import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runTransport, validateActivationInputs, containerProgram, safeFailureDiagnostic, sanitizeCatalogSnapshot, SOURCE_PATH, MANIFEST_PATH } from './sku-source-activation-transport.mjs';
import { readManifest, digest, APPROVED_PARENT_RESTORATIONS } from './sku-source-activation.mjs';
const target = 'a'.repeat(40), old = 'b'.repeat(40), sha = 'c'.repeat(64), id = 'd'.repeat(64);
const base = { mode: 'apply', effectiveDate: '2026-11-11', expectedPlanSha256: sha, approveProduction: true,
  targetSha: target, deployMode: 'api', buildApi: true };
const legacyMap=Array.from({length:5},(_,i)=>['LOOSE','TRAY30','TRAY36','BOX360','BOX720','GIFT12','GIFT24'].map(spec=>({
  sku_code:`HISTORIC-${i+1}-${spec}`,product_code:i<2?`PRD-EGG-GRADE_${i+1}`:`PRD-EGG-${i+1}`,
  grade_code:`GRADE_${i+1}`,spec_code:spec,status:'ACTIVE',variety_code:null,parent_status:'ACTIVE',parent_variety_code:null,
  org_context_required:false,base_unit:'枚'}))).flat();
const readySnapshot={plan_ready:true,manifest_sha256:sha,db_state_sha256:sha,plan_sha256:sha,
  legacy_identity_map:legacyMap,legacy_identity_map_sha256:digest(legacyMap),approved_parent_restoration_count:0,approved_parent_restorations:[],approved_parent_restorations_sha256:digest([])};
const missingReport={report_version:'1',plan_ready:false,reason:'LEGACY_STANDARD_TUPLE_MISSING',candidate_count:34,truncated:false,candidates:legacyMap.slice(1).map(r=>({...r,category_code:'EGG',effective_date:'2020-01-02',expire_date:null,parent_effective_date:null,parent_expire_date:null}))};
const reportSnapshot={plan_ready:false,manifest_sha256:sha,db_state_sha256:sha,catalog_report:missingReport,catalog_report_sha256:digest(missingReport)};
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
      if (args[0] === 'exec') {
        if (overrides.execError) throw overrides.execError;
        return JSON.stringify({ ...readySnapshot,mode: overrides.mode || 'apply', effective_date: base.effectiveDate, plan_sha256: overrides.plan || sha,
          expectedCounts: { profiles: 11 }, existingCounts: { profiles: 0 }, ...(overrides.receipt || {}),
          ...(overrides.receipt?.plan_ready===false ? {legacy_identity_map:undefined,legacy_identity_map_sha256:undefined} : {}) });
      }
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
test('successful catalog map is exact35, digest-bound and strips unrelated receipt fields',()=>{
  const {deps}=fixture({receipt:{private_customer:'MUST-NOT-EXPORT',existingCounts:{profiles:0,price:'MUST-NOT-EXPORT'},rows:{inserted:{skus:91,customer:'MUST-NOT-EXPORT'},remark:'MUST-NOT-EXPORT'}}});
  const result=runTransport(base,deps);
  assert.equal(result.plan_ready,true);assert.equal(result.legacy_identity_map.length,35);
  assert.equal(Object.hasOwn(result,'private_customer'),false);
  assert.ok(!JSON.stringify(result).includes('MUST-NOT-EXPORT'));
  assert.throws(()=>runTransport(base,fixture({receipt:{existingCounts:{profiles:'private-free-text'}}}).deps),/INVALID_RECEIPT_METADATA/);
  for (const mutate of [
    r=>r.legacy_identity_map.pop(),
    r=>r.legacy_identity_map[0].price='private-price',
    r=>r.legacy_identity_map[0].sku_name='private-name',
    r=>r.legacy_identity_map[0].category_code='EGG',
    r=>r.legacy_identity_map[0].base_unit='公斤',
    r=>r.legacy_identity_map[0].parent_variety_code='EGG_RED',
    r=>r.legacy_identity_map[1]={...r.legacy_identity_map[0]},
    r=>r.legacy_identity_map_sha256='f'.repeat(64),
    r=>r.plan_ready=undefined,
  ]) {
    const receipt=structuredClone(readySnapshot);mutate(receipt);
    assert.throws(()=>runTransport(base,fixture({receipt}).deps),/INVALID_CATALOG_SNAPSHOT/);
  }
});
test('restoration receipts bind only exact reviewed five parent definitions, count and digest',()=>{
  const approved=APPROVED_PARENT_RESTORATIONS.map(({product_code,product_name,unit_zh,variety_code,status,category_code,reason})=>
    ({product_code,product_name,unit_zh,variety_code,status,category_code,reason}));
  const receipt={...readySnapshot,approved_parent_restorations:approved,approved_parent_restoration_count:5,approved_parent_restorations_sha256:digest(approved)};
  const result=runTransport(base,fixture({receipt}).deps);assert.deepEqual(result.approved_parent_restorations,approved);
  for(const change of [r=>r[0].product_code='PRD-EGG-6',r=>r[0].product_name='未经批准名称',r=>r[0].variety_code='EGG_RED',
    r=>r[0].unit_zh='公斤',r=>r[0].price='secret',r=>r.push({...r[0]}),r=>r[0].reason='OTHER']) {
    const bad=structuredClone(approved);change(bad);
    assert.throws(()=>runTransport(base,fixture({receipt:{...receipt,approved_parent_restorations:bad,
      approved_parent_restoration_count:bad.length,approved_parent_restorations_sha256:digest(bad)}}).deps),/INVALID_CATALOG_SNAPSHOT/);
  }
  assert.throws(()=>runTransport(base,fixture({receipt:{...receipt,approved_parent_restoration_count:4}}).deps),/INVALID_CATALOG_SNAPSHOT/);
  assert.throws(()=>runTransport(base,fixture({receipt:{...receipt,approved_parent_restorations_sha256:'f'.repeat(64)}}).deps),/INVALID_CATALOG_SNAPSHOT/);
});
test('read-only report has no executable digest and preflight/apply cannot accept it',()=>{
  const receipt={...reportSnapshot,plan_sha256:undefined};
  const result=runTransport({mode:'inspect',effectiveDate:base.effectiveDate,targetSha:target},fixture({mode:'inspect',receipt}).deps);
  assert.equal(result.plan_ready,false);assert.equal(Object.hasOwn(result,'plan_sha256'),false);
  assert.equal(result.catalog_report.candidates.length,34);
  for (const mode of ['preflight','apply']) assert.throws(()=>runTransport({...base,mode},fixture({mode:mode==='preflight'?'inspect':'apply',receipt}).deps),/INVALID_CATALOG_SNAPSHOT|PLAN_OR_DATABASE_STATE_MOVED/);
  for (const mutate of [
    r=>r.plan_sha256=sha,
    r=>r.catalog_report.candidates[0].remark='private-free-text',
    r=>r.catalog_report.candidates[0].category_code='x'.repeat(65),
    r=>r.catalog_report.candidates[0].category_code={private:'secret'},
    r=>r.catalog_report.candidates[0].parent_status='x'.repeat(33),
    r=>r.catalog_report.candidates[0].effective_date='2026-02-30',
    r=>r.catalog_report.candidates[0].expire_date='2026-11-12T12:00:00Z',
    r=>r.catalog_report.candidates[0].parent_effective_date={private:'secret'},
    r=>r.catalog_report.candidates[0].parent_expire_date='0000-01-01',
    r=>r.catalog_report.truncated=true,
    r=>r.catalog_report.candidate_count=1,
    r=>r.catalog_report_sha256='f'.repeat(64),
    r=>r.catalog_report.candidates[0].sku_code='code\nsecret',
  ]) {
    const bad=structuredClone(reportSnapshot);mutate(bad);
    assert.throws(()=>runTransport({mode:'inspect',effectiveDate:base.effectiveDate,targetSha:target},fixture({mode:'inspect',receipt:{...bad,plan_sha256:bad.plan_sha256}}).deps),/INVALID_CATALOG_SNAPSHOT/);
  }
  assert.throws(()=>sanitizeCatalogSnapshot({...reportSnapshot,mode:'apply'}),/INVALID_CATALOG_SNAPSHOT/);
});
test('report-only category codes and four nullable dates survive exact allowlisting without changing eligibility',()=>{
  const report=structuredClone(missingReport);Object.assign(report.candidates[0],{category_code:'OLD-EGG-CATEGORY',
    effective_date:'2099-01-01',expire_date:'2099-12-31',parent_effective_date:'2020-02-29',parent_expire_date:'2026-11-01'});
  const receipt={...reportSnapshot,mode:'inspect',catalog_report:report,catalog_report_sha256:digest(report),plan_sha256:undefined};
  const result=runTransport({mode:'inspect',effectiveDate:base.effectiveDate,targetSha:target},fixture({mode:'inspect',receipt}).deps);
  assert.deepEqual(result.catalog_report.candidates[0],report.candidates[0]);
  assert.equal(result.plan_ready,false);assert.equal(Object.hasOwn(result,'plan_sha256'),false);
});
test('stdin core imports do not execute main and container failures redact secrets', () => {
  const core = fs.readFileSync(new URL('./sku-source-activation.mjs', import.meta.url), 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module'], { input: containerProgram(core), encoding: 'utf8',
    env: { PATH: process.env.PATH, SKU_ACTIVATION_OPTIONS_B64: 'invalid-secret-password' } });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=OPTIONS;reason=OPERATION_FAILED\n');
});
test('diagnostics allow only known invariant reason names or five-character SQLSTATE, never secret details', () => {
  const secret = 'password=super-secret SELECT confidential_price FROM private_finance';
  assert.equal(safeFailureDiagnostic(Object.assign(new Error(secret), { code: '42703', detail: secret }), 'ACTIVATION'),
    'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=ACTIVATION;sqlstate=42703');
  assert.equal(safeFailureDiagnostic(new Error(`SKU_ACTIVATION_HOLD=PRODUCT_CONFLICT:${secret}`), 'ACTIVATION'),
    'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=ACTIVATION;reason=SKU_ACTIVATION_HOLD=PRODUCT_CONFLICT');
  for (const error of [new Error(secret), new Error('SKU_ACTIVATION_HOLD=SECRET_PASSWORD'),
    Object.assign(new Error(secret), { code: '42703 password' }), new Error(`SKU_ACTIVATION_HOLD=PRODUCT_CONFLICT\n${secret}`)]) {
    assert.equal(safeFailureDiagnostic(error, secret), 'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=HOST;reason=OPERATION_FAILED');
  }
});

test('the actual stdin child program parses and reports missing-column SQLSTATE with mocked pg, without raw SQL', () => {
  const core = fs.readFileSync(new URL('./sku-source-activation.mjs', import.meta.url), 'utf8');
  const program = containerProgram(core);
  const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: program, encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const secret = 'postgres://user:secret-password@private-db/confidential SELECT price';
  const preload = `import Module from 'node:module';
    const load = Module._load;
    Module._load = function(request, parent, ...args) {
      if (request === 'pg' && parent.filename === '/app/package.json') return { Client: class {
        async connect() {}
        async query() { throw Object.assign(new Error(${JSON.stringify(secret)}), {code:'42703',detail:${JSON.stringify(secret)}}); }
        async end() {}
      }};
      return load.call(this, request, parent, ...args);
    };`;
  const env = { PATH: process.env.PATH, DB_HOST:'fixture',DB_PORT:'5432',DB_USER:'fixture',DB_PASSWORD:'test-only',DB_NAME:'fixture',
    SKU_ACTIVATION_OPTIONS_B64: Buffer.from(JSON.stringify({mode:'inspect',effectiveDate:'2026-11-10'})).toString('base64'),
    SKU_ACTIVATION_MANIFEST_B64: Buffer.from(JSON.stringify(readManifest())).toString('base64') };
  const execute = (manifest = readManifest()) => spawnSync(process.execPath, ['--input-type=module', '--import', `data:text/javascript;base64,${Buffer.from(preload).toString('base64')}`],
    { input: program, encoding: 'utf8', env: {...env,SKU_ACTIVATION_MANIFEST_B64:Buffer.from(JSON.stringify(manifest)).toString('base64')} });
  const missing = execute();
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.equal(missing.stderr, 'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=ACTIVATION;sqlstate=42703\n');
  const invalid = readManifest(); invalid.scope.sale_enabled = true;
  const refused = execute(invalid);
  assert.equal(refused.status, 1);
  assert.equal(refused.stderr, 'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=ACTIVATION;reason=SKU_ACTIVATION_HOLD=MANIFEST_SCOPE_OR_SPECS\n');
  const arbitraryPreload = preload.replace("{code:'42703',detail:", "{code:'invalid-secret-code',detail:");
  const arbitrary = spawnSync(process.execPath, ['--input-type=module', '--import', `data:text/javascript;base64,${Buffer.from(arbitraryPreload).toString('base64')}`],
    { input: program, encoding:'utf8',env });
  assert.equal(arbitrary.status,1);
  assert.equal(arbitrary.stderr,'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=ACTIVATION;reason=OPERATION_FAILED\n');
});

test('host docker exec forwards only one bounded canonical child diagnostic and never its command/error output', () => {
  for (const diagnostic of [
    'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=ACTIVATION;sqlstate=42703',
    'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=ACTIVATION;reason=SKU_ACTIVATION_HOLD=PRODUCT_CONFLICT',
  ]) {
    const { deps } = fixture({execError:Object.assign(new Error('secret command SQL password'),{stderr:Buffer.from(`${diagnostic}\n`)})});
    assert.throws(() => runTransport(base,deps), error => error.message === diagnostic);
  }
  for (const stderr of ['password=super-secret SELECT confidential_price',
    'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=ACTIVATION;reason=SKU_ACTIVATION_HOLD=SECRET_PASSWORD',
    'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=PASSWORD_SECRET;sqlstate=42703',
    'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=ACTIVATION;sqlstate=42703\nsecret-password',
    'x'.repeat(10000)]) {
    const {deps}=fixture({execError:Object.assign(new Error('secret command SQL password'),{stderr})});
    assert.throws(() => runTransport(base,deps), error => error.message === 'SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=CONTAINER_EXEC;reason=OPERATION_FAILED');
  }
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
  const receipt={...readySnapshot,mode:'inspect',target_sha:target,effective_date:'2026-11-11',plan_sha256:`22${'a'.repeat(62)}`};
  const execute=stdout=>spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:directory,encoding:'utf8',env:{...process.env,INSPECT_STDOUT:stdout,EXPECTED_TARGET_SHA:target,EXPECTED_EFFECTIVE_DATE:'2026-11-11'}});
  const line=`SKU_SOURCE_INSPECT_RECEIPT=${JSON.stringify(receipt)}`;
  try {
    assert.equal(execute(line).status,0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'sku-source-inspect.json'),'utf8')).plan_sha256,receipt.plan_sha256);
    assert.notEqual(execute(`${line}\n${line}`).status,0);
    assert.notEqual(execute(`SKU_SOURCE_INSPECT_RECEIPT=${JSON.stringify({...receipt,target_sha:old})}`).status,0);
    assert.notEqual(execute(`SKU_SOURCE_INSPECT_RECEIPT=${JSON.stringify({...receipt,plan_sha256:'***masked'})}`).status,0);
    const report={...reportSnapshot,mode:'inspect',target_sha:target,effective_date:'2026-11-11'};
    assert.equal(execute(`SKU_SOURCE_INSPECT_RECEIPT=${JSON.stringify(report)}`).status,0);
    const saved=JSON.parse(fs.readFileSync(path.join(directory,'sku-source-inspect.json'),'utf8'));
    assert.equal(saved.plan_ready,false);assert.equal(Object.hasOwn(saved,'plan_sha256'),false);
    for (const bad of [{...report,plan_sha256:sha},{...receipt,plan_ready:undefined},{...report,catalog_report_sha256:'bad'},
      {...receipt,target_sha:old},{...receipt,effective_date:'2026-11-12'},{...receipt,db_state_sha256:'bad'}])
      assert.notEqual(execute(`SKU_SOURCE_INSPECT_RECEIPT=${JSON.stringify(bad)}`).status,0);
    const restores=APPROVED_PARENT_RESTORATIONS.map(({product_code,product_name,unit_zh,variety_code,status,category_code,reason})=>({product_code,product_name,unit_zh,variety_code,status,category_code,reason}));
    const repair={...receipt,approved_parent_restorations:restores,approved_parent_restoration_count:5,approved_parent_restorations_sha256:digest(restores)};
    assert.equal(execute(`SKU_SOURCE_INSPECT_RECEIPT=${JSON.stringify(repair)}`).status,0);
    for(const mutate of [r=>r[0].product_code='PRD-EGG-6',r=>r[0].product_name='unapproved',r=>r[0].price='secret',r=>r[1]={...r[0]}]) {
      const badRows=structuredClone(restores);mutate(badRows);
      const bad={...repair,approved_parent_restorations:badRows,approved_parent_restorations_sha256:digest(badRows)};
      assert.notEqual(execute(`SKU_SOURCE_INSPECT_RECEIPT=${JSON.stringify(bad)}`).status,0);
    }
    assert.equal(saved.catalog_report.candidates[0].category_code,'EGG');
    assert.equal(saved.catalog_report.candidates[0].effective_date,'2020-01-02');
    for (const mutate of [
      r=>r.candidates[0].category_code='x'.repeat(65),r=>r.candidates[0].effective_date='2026-02-30',
      r=>r.candidates[0].expire_date='2026-11-12T00:00:00Z',r=>r.candidates[0].parent_effective_date={private:'secret'},
      r=>r.candidates[0].parent_expire_date='0000-01-01',r=>r.candidates[0].parent_status='x'.repeat(33),
      r=>r.candidates[0].remark='private',r=>r.candidates[0].category_code={private:'secret'},
    ]) {
      const badReport=structuredClone(missingReport);mutate(badReport);
      const bad={...report,catalog_report:badReport,catalog_report_sha256:digest(badReport)};
      assert.notEqual(execute(`SKU_SOURCE_INSPECT_RECEIPT=${JSON.stringify(bad)}`).status,0);
    }
  } finally {
    assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(directory),/^sku-source-inspect-receipt-/);
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
