import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runTransport, validateActivationInputs, containerProgram, SOURCE_PATH, MANIFEST_PATH } from './sku-source-activation-transport.mjs';
const target = 'a'.repeat(40), old = 'b'.repeat(40), sha = 'c'.repeat(64), id = 'd'.repeat(64);
const base = { mode: 'apply', effectiveDate: '2026-11-11', expectedPlanSha256: sha, approveProduction: true,
  targetSha: target, deployMode: 'api', buildApi: true };
function fixture(overrides = {}) {
  const calls = [];
  const deps = {
    verifyContext: (...args) => calls.push(['context', ...args]),
    git: (root, args) => {
      calls.push(['gitProbe', args]);
      if (args[0] === 'branch') return 'main';
      if (args[0] === 'status') return '';
      if (args[0] === 'ls-remote') return `${overrides.remote || target}\trefs/heads/main`;
      if (args[0] === 'rev-parse') return overrides.head || target;
      throw Error('unexpected git');
    },
    execute: (program, args, options = {}) => {
      calls.push([program, args, options]);
      if (program === 'git') return args.at(-1).endsWith(SOURCE_PATH) ? '// exact source\n' : '{"explicit":"manifest"}\n';
      if (args[0] === 'inspect') return JSON.stringify({ Id: id, Image: `sha256:${sha}`, State: { Running: true, Health: { Status: overrides.health || 'healthy' } } });
      if (args[0] === 'image') return overrides.actual || target;
      if (args[0] === 'exec') return JSON.stringify({ mode: overrides.mode || 'apply', effective_date: base.effectiveDate, plan_sha256: overrides.plan || sha,
        expectedCounts: { profiles: 11 }, existingCounts: { profiles: 0 } });
      throw Error('unexpected execution');
    },
  };
  return { deps, calls };
}
test('apply verifies trusted context, actual image and SHA before safe stdin exec', () => {
  const { deps, calls } = fixture();
  const result = runTransport(base, deps);
  assert.equal(calls[0][0], 'context');
  assert.equal(result.actual_api_revision, target);
  const exec = calls.find(c => c[0] === 'docker' && c[1][0] === 'exec');
  assert.deepEqual(exec[1], ['exec', '-i', '-e', 'SKU_ACTIVATION_OPTIONS_B64', '-e', 'SKU_ACTIVATION_MANIFEST_B64', id, 'node', '--input-type=module']);
  assert.deepEqual(Object.keys(exec[2].env).sort(), ['PATH','DOCKER_CONFIG','DOCKER_HOST','SKU_ACTIVATION_OPTIONS_B64','SKU_ACTIVATION_MANIFEST_B64'].sort());
  assert.equal(Buffer.from(exec[2].env.SKU_ACTIVATION_MANIFEST_B64, 'base64').toString(), '{"explicit":"manifest"}\n');
  assert.match(exec[2].input, /^\/\/ exact source\n/);
  assert.match(exec[2].input, /transportRequire\('\/app\/package.json'\)\('pg'\)/);
  assert.match(exec[2].input, /manifest: transportManifest/);
  assert.match(exec[2].input, /explicitDbConfig\(Object\.fromEntries\(\['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME'\]/);
  assert.doesNotMatch(exec[2].input, /explicitDbConfig\(process\.env\)/);
  assert.ok(!exec[1].some(arg => arg.includes('DB_') || arg.includes('PASSWORD')));
  assert.deepEqual(calls.filter(c => c[0] === 'git').map(c => c[1].at(-1)), [`${target}:${SOURCE_PATH}`, `${target}:${MANIFEST_PATH}`]);
});
for (const [name, options, overrides, code] of [
  ['wrong actual revision', {}, { actual: old }, 'ACTUAL_API_REVISION_MISMATCH'],
  ['unhealthy API', {}, { health: 'starting' }, 'API_NOT_HEALTHY'],
  ['wrong HEAD', {}, { head: old }, 'HEAD_TARGET_MISMATCH'],
  ['wrong remote SHA', {}, { remote: old }, 'REMOTE_MAIN_MOVED'],
  ['missing approval', { approveProduction: false }, {}, 'APPROVED_API_DEPLOYMENT_REQUIRED'],
  ['unknown mode', { mode: 'dry-run' }, {}, 'UNKNOWN_MODE'],
  ['invalid SHA', { expectedPlanSha256: 'oops' }, {}, 'INVALID_DATE_OR_PLAN_SHA256'],
  ['invalid calendar date', { effectiveDate: '2026-02-30' }, {}, 'INVALID_DATE_OR_TARGET'],
  ['web only', { deployMode: 'web', buildApi: false }, {}, 'APPROVED_API_DEPLOYMENT_REQUIRED'],
]) test(`rejects ${name} without docker exec`, () => {
  const { deps, calls } = fixture(overrides);
  assert.throws(() => runTransport({ ...base, ...options }, deps), new RegExp(code));
  assert.ok(!calls.some(c => c[0] === 'docker' && c[1][0] === 'exec'));
});
test('empty legacy inputs remain disabled; partial inputs fail closed', () => {
  assert.equal(validateActivationInputs({}), false);
  for (const input of [{ effectiveDate: base.effectiveDate }, { expectedPlanSha256: sha }])
    assert.throws(() => validateActivationInputs(input), /PAIRED_INPUTS_REQUIRED/);
});
test('inspect accepts old runtime and old HEAD, never asserts floor or enables writes', () => {
  const { deps, calls } = fixture({ actual: old, head: old, mode: 'inspect' });
  const result = runTransport({ mode: 'inspect', effectiveDate: base.effectiveDate, targetSha: target }, deps);
  assert.equal(result.actual_api_revision, old);
  assert.ok(!calls.some(c => c[0] === 'gitProbe' && c[1][0] === 'rev-parse'));
  const program = calls.find(c => c[0] === 'docker' && c[1][0] === 'exec')[2].input;
  assert.match(program, /default_transaction_read_only=on/);
});
test('preflight on old runtime only inspects and binds approved hash before switching', () => {
  const { deps, calls } = fixture({ actual: old, mode: 'inspect' });
  assert.equal(runTransport({ ...base, mode: 'preflight' }, deps).mode, 'preflight');
  const exec = calls.find(c => c[0] === 'docker' && c[1][0] === 'exec');
  const options = JSON.parse(Buffer.from(exec[2].env.SKU_ACTIVATION_OPTIONS_B64, 'base64'));
  assert.deepEqual(options, { mode: 'inspect', effectiveDate: base.effectiveDate });
});
test('preflight hash drift stops before any apply execution', () => {
  const { deps, calls } = fixture({ actual: old, mode: 'inspect', plan: 'f'.repeat(64) });
  assert.throws(() => runTransport({ ...base, mode: 'preflight' }, deps), /PLAN_OR_DATABASE_STATE_MOVED/);
  const execs = calls.filter(c => c[0] === 'docker' && c[1][0] === 'exec');
  assert.equal(execs.length, 1);
  assert.equal(JSON.parse(Buffer.from(execs[0][2].env.SKU_ACTIVATION_OPTIONS_B64, 'base64')).mode, 'inspect');
});
test('stdin core imports do not execute main and container failures redact secrets', () => {
  const core = fs.readFileSync(new URL('./sku-source-activation.mjs', import.meta.url), 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module'], { input: containerProgram(core), encoding: 'utf8',
    env: { PATH: process.env.PATH, SKU_ACTIVATION_OPTIONS_B64: 'invalid-secret-password' } });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'SKU_TRANSPORT_HOLD=CONTAINER_OPERATION_FAILED\n');
});
test('workflow binds read-only inspect and activation strictly after API switch before smoke', () => {
  const deploy = fs.readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const inspect = fs.readFileSync(new URL('../../.github/workflows/sku-source-activation-inspect.yml', import.meta.url), 'utf8');
  const body = deploy.slice(deploy.indexOf('            perform_deployment() {'));
  assert.ok(body.indexOf('SKU_ACTIVATION_MODE=preflight') > body.indexOf('production-deployment-state.mjs begin'));
  assert.ok(body.indexOf('SKU_ACTIVATION_MODE=preflight') > body.indexOf('production-deployment-state.mjs candidate api'));
  assert.ok(body.indexOf('SKU_ACTIVATION_MODE=preflight') < body.indexOf('production-deployment-state.mjs switch api'));
  assert.ok(body.indexOf('SKU_ACTIVATION_MODE=apply') > body.indexOf('API_IMAGE="$CANDIDATE_API_IMAGE" docker compose up'));
  assert.ok(body.indexOf('SKU_ACTIVATION_MODE=apply') < body.indexOf('# ── Smoke test'));
  assert.match(inspect, /SKU_ACTIVATION_MODE: inspect/);
  assert.doesNotMatch(inspect, /SKU_ACTIVATION_MODE[=:] ?apply|assertFloor|git_safe (merge|checkout|reset)/);
  for (const block of deploy.split('          script: |\n').slice(1)) {
    const lines = [];
    for (const line of block.split('\n')) { if (line && !line.startsWith('            ')) break; lines.push(line.slice(12)); }
    assert.ok(Buffer.byteLength(lines.join('\n')) <= 20000);
  }
});

test('the exact inspect staging list imports with its complete closure outside the checkout', () => {
  const inspect = fs.readFileSync(new URL('../../.github/workflows/sku-source-activation-inspect.yml',import.meta.url),'utf8');
  const files = inspect.match(/for helper in ([^;\n]+); do/)[1].split(/\s+/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'sku-source-inspect-import-'));
  try {
    for (const file of files) {
      assert.match(file,/^[a-z][a-z0-9.-]+\.(mjs|json)$/);
      fs.copyFileSync(new URL(`./${file}`,import.meta.url),path.join(directory,file));
    }
    const result=spawnSync(process.execPath,['--input-type=module','-e','await import(process.argv[1])',pathToFileURL(path.join(directory,'sku-source-activation-transport.mjs')).href],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(directory),/^sku-source-inspect-import-/);
    fs.rmSync(directory,{recursive:true,force:true});
  }
});

test('inspect artifact preserves the full plan hash and rejects duplicated or wrong-target receipts', () => {
  const workflow=fs.readFileSync(new URL('../../.github/workflows/sku-source-activation-inspect.yml',import.meta.url),'utf8');
  const code=workflow.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n {10}NODE/)[1].replace(/^ {10}/gm,'');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sku-source-inspect-receipt-'));
  const receipt={mode:'inspect',target_sha:target,effective_date:'2026-11-11',plan_sha256:`22${'a'.repeat(62)}`,db_state_sha256:sha};
  const execute=stdout=>spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:directory,encoding:'utf8',env:{...process.env,INSPECT_STDOUT:stdout,EXPECTED_TARGET_SHA:target,EXPECTED_EFFECTIVE_DATE:'2026-11-11'}});
  const line=`SKU_SOURCE_INSPECT_RECEIPT=${JSON.stringify(receipt)}`;
  try {
    assert.equal(execute(line).status,0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'sku-source-inspect.json'),'utf8')).plan_sha256,receipt.plan_sha256);
    assert.notEqual(execute(`${line}\n${line}`).status,0);
    assert.notEqual(execute(`SKU_SOURCE_INSPECT_RECEIPT=${JSON.stringify({...receipt,target_sha:old})}`).status,0);
    assert.notEqual(execute(`SKU_SOURCE_INSPECT_RECEIPT=${JSON.stringify({...receipt,plan_sha256:'***masked'})}`).status,0);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(directory),/^sku-source-inspect-receipt-/);
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
