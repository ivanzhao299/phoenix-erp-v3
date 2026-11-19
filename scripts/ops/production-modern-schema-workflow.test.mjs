import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runModernSchemaWorkflow } from './production-modern-schema-workflow.mjs';

const sha = 'a'.repeat(40);
const preparationSha256 = 'c'.repeat(64);
const identityToken = 'fixture.only.proof';
const githubReadToken = 'fixture_only_read_channel';
const owner = '9001-1';
const env = Object.freeze({
  GITHUB_REPOSITORY: 'ivanzhao299/phoenix-erp-v3',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_JOB: 'deploy',
  RUNNER_ENVIRONMENT: 'github-hosted',
  GITHUB_ACTOR: 'emvia',
  GITHUB_ACTOR_ID: '7245339',
  GITHUB_TRIGGERING_ACTOR: 'emvia',
  GITHUB_WORKFLOW_REF: 'ivanzhao299/phoenix-erp-v3/.github/workflows/deploy.yml@refs/heads/main',
  GITHUB_SHA: sha,
  GITHUB_WORKFLOW_SHA: sha,
  GITHUB_RUN_ID: '9001',
  GITHUB_RUN_ATTEMPT: '1',
  APPROVED_CONFIG_FLOOR_SHA: sha,
  APPROVED_PREVIOUS_FLOOR_SHA: 'b'.repeat(40),
  DEPLOY_MODE: 'api',
  BUILD_API: 'true',
  BUILD_WEB: 'false',
  RUN_MIG: 'false',
  APPROVE_PRODUCTION: 'true',
  PRESERVE_ARTIFACTS: 'true',
  MODERN_SCHEMA_RELEASE: 'true',
  ROTATE_CHANJET_CREDENTIALS: 'false',
  ONE_TIME_CONFIG_FLOOR_TRANSITION: 'false',
  MODERN_SCHEMA_GITHUB_READ_TOKEN: githubReadToken,
});
const prepared = { schema: 'phoenix.modern-schema-public-preparation/v1', owner, targetSha: sha, preparationSha256, prepared: true };
const success = { schema: 'phoenix.modern-schema-public-result/v1', owner, targetSha: sha, outcome: 'SUCCESS', defaultOff: true };

function fixture({ prepareOutput = JSON.stringify(prepared), runOutput = JSON.stringify(success),
  prepareStatus = 0, runStatus = 0 } = {}) {
  const events = [];
  return {
    events,
    dependencies: {
      createSsh(input, hostEnv) {
        events.push('connect');
        assert.equal(hostEnv.API_IMAGE, 'ghcr.io/ivanzhao299/phoenix-erp-v3/api:sha-' + sha);
        assert.equal(hostEnv.DEPLOY_RUN_ID, owner);
        assert.equal(hostEnv.RUN_MIG, 'false');
        assert.doesNotMatch(JSON.stringify(hostEnv), /fixture_only_read_channel|fixture\.only\.proof/);
        return {
          exchange(operation, stdin) {
            events.push(operation);
            if (operation === 'prepare') {
              assert.equal(stdin, githubReadToken + '\n');
              return { status: prepareStatus, stdout: prepareOutput };
            }
            assert.deepEqual(JSON.parse(stdin), { schema: 'phoenix.modern-schema-run-input/v1', preparationSha256, identityToken, githubReadToken });
            return { status: runStatus, stdout: runOutput };
          },
          close() {
            events.push('close');
          },
        };
      },
      async requestToken(input) {
        events.push('identity');
        assert.deepEqual(input, { owner, targetSha: sha, preparationSha256 });
        return identityToken;
      },
    },
  };
}

test('verified prepare binds the private identity request to the same run and target', async () => {
  const f = fixture();
  assert.deepEqual(await runModernSchemaWorkflow(env, f.dependencies), success);
  assert.deepEqual(f.events, ['connect', 'prepare', 'identity', 'run', 'close']);
});

test('only the dedicated exact main API job may open the production transport', async () => {
  for (const override of [
    { GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/other' }, { GITHUB_ACTOR_ID: '12' },
    { GITHUB_TRIGGERING_ACTOR: 'someone' }, { GITHUB_WORKFLOW_SHA: 'b'.repeat(40) },
    { APPROVED_CONFIG_FLOOR_SHA: 'b'.repeat(40) }, { APPROVED_PREVIOUS_FLOOR_SHA: sha },
    { BUILD_WEB: 'true' }, { RUN_MIG: 'true' }, { APPROVE_PRODUCTION: 'false' },
    { ROTATE_CHANJET_CREDENTIALS: 'true' }, { ONE_TIME_CONFIG_FLOOR_TRANSITION: 'true' },
    { MAINTENANCE_RELEASE_INPUT: '{}' }, { SKU_SOURCE_PLAN_SHA256: preparationSha256 },
  ]) {
    const f = fixture();
    await assert.rejects(runModernSchemaWorkflow({ ...env, ...override }, f.dependencies), /EXACT_DISPATCH_REQUIRED/);
    assert.deepEqual(f.events, []);
  }
});

test('failed, mismatched or non-canonical public preparation never requests identity', async () => {
  for (const fixtureOptions of [
    { prepareOutput: JSON.stringify({ ...prepared, owner: '9001-2' }) },
    { prepareOutput: JSON.stringify({ ...prepared, targetSha: 'd'.repeat(40) }) },
    { prepareOutput: JSON.stringify({ ...prepared, private: 'unexpected fixture data' }) },
    { prepareOutput: 'unverified diagnostics\n' + JSON.stringify(prepared) },
    { prepareStatus: 1 },
  ]) {
    const f = fixture(fixtureOptions);
    await assert.rejects(runModernSchemaWorkflow(env, f.dependencies), /PREPARATION_/);
    assert.deepEqual(f.events, ['connect', 'prepare', 'close']);
  }
});

test('ambiguous execution cannot become success and raw remote diagnostics are excluded', async () => {
  const f = fixture({ runOutput: 'unverified accidentally returned value' });
  await assert.rejects(runModernSchemaWorkflow(env, f.dependencies), { message: 'MODERN_SCHEMA_WORKFLOW_HOLD=RELEASE_RECEIPT' });
  assert.deepEqual(f.events, ['connect', 'prepare', 'identity', 'run', 'close']);
  const g = fixture({ runStatus: 1 });
  await assert.rejects(runModernSchemaWorkflow(env, g.dependencies), /RELEASE_COMMAND_STATUS/);
  const h = fixture({ runStatus: 2, runOutput: JSON.stringify({ ...success, outcome: 'HOLD' }) });
  assert.equal((await runModernSchemaWorkflow(env, h.dependencies)).outcome, 'HOLD');
});

test('the reviewed host shell retains parent FD9 and uses only the two staged entrypoints', () => {
  const source = fs.readFileSync(new URL('./production-modern-schema-ssh.sh', import.meta.url), 'utf8');
  assert.equal(spawnSync('/bin/bash', ['-n'], { input: source }).status, 0);
  assert.match(source, /test "\$\(repo_git rev-parse refs\/remotes\/origin\/main\)" = "\$TARGET_SHA"/);
  assert.match(source, /cmp -s "\$staged_file" <\(repo_git show "\$TARGET_SHA:\$file"\)/);
  assert.match(source, /node "\$stage\/\$entry" prepare <\/dev\/null/);
  assert.match(source, /\n  node "\$stage\/\$entry" run 2>\/dev\/null \| public_receipt\n/);
  assert.doesNotMatch(source, /exec node "\$stage\/\$entry"/);
});

test('workflow selects one production transport and rejects incompatible dispatches in Bash', () => {
  const yaml = fs.readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(yaml, /inputs\.modern_schema_release == true[\s\S]+node scripts\/ops\/production-modern-schema-workflow\.mjs/);
  assert.match(yaml, /name: Deploy via SSH\n\s+if: inputs\.modern_schema_release != true/);
  assert.match(yaml, /production_state\(\) \{ node scripts\/ops\/production-deployment-state\.mjs "\$@"; \}/);
  assert.match(yaml, /production_promote_floor\(\) \{ node "\$1\/promote-production-config-floor\.mjs"; \}/);
  const start = yaml.indexOf('          if [ "$MODERN_SCHEMA_RELEASE" = true ]; then');
  const end = yaml.indexOf('\n          DEPLOY_MODE="$MODE"', start);
  assert.ok(start > 0 && end > start);
  const guard = yaml.slice(start, end);
  const choice = {
    ...env, IS_DISPATCH: 'true', MANUAL_MODE: 'api', MANUAL_RUN_MIG: 'false', SKIP_DEPLOY: 'false',
    MAINTENANCE_RELEASE_INPUT: '', SKU_SOURCE_EFFECTIVE_DATE: '', SKU_SOURCE_PLAN_SHA256: '',
  };
  const check = values => spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', guard + '\nprintf "NEXT\\n"'], {
    env: values, encoding: 'utf8',
  });
  assert.equal(check(choice).stdout, 'NEXT\n');
  for (const override of [
    { IS_DISPATCH: 'false' }, { GITHUB_REF: 'refs/heads/other' }, { MANUAL_MODE: 'full' },
    { MANUAL_RUN_MIG: 'auto' }, { APPROVE_PRODUCTION: 'false' }, { SKIP_DEPLOY: 'true' },
    { APPROVED_CONFIG_FLOOR_SHA: '' }, { APPROVED_PREVIOUS_FLOOR_SHA: sha },
    { MAINTENANCE_RELEASE_INPUT: 'legacy' }, { SKU_SOURCE_EFFECTIVE_DATE: '2026-11-17' },
    { ROTATE_CHANJET_CREDENTIALS: 'true' }, { ONE_TIME_CONFIG_FLOOR_TRANSITION: 'true' },
  ]) {
    const outcome = check({ ...choice, ...override });
    assert.notEqual(outcome.status, 0, JSON.stringify(override));
    assert.equal(outcome.stdout, '', JSON.stringify(override));
  }
});

test('host filter suppresses raw output, proves real CLI parent FD9 and propagates release exit', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-schema-ssh-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const lock = path.join(directory, 'lock');
  fs.writeFileSync(lock, '');
  fs.writeFileSync(path.join(directory, 'helper.mjs'), `
    import fs from 'node:fs';
    const lock=fs.fstatSync(9), parent=fs.statSync('/proc/'+process.ppid+'/fd/9');
    if (parent.ino!==lock.ino||parent.dev!==lock.dev||process.argv[2]!=='run') process.exit(9);
    if (fs.readFileSync(0,'utf8')!==process.env.FIXTURE_STDIN) process.exit(10);
    process.stderr.write('fixture error text that must stay private\\n');
    console.log(process.env.FIXTURE_RESULT);
    process.exit(Number(process.env.FIXTURE_CODE));
  `);
  const source = fs.readFileSync(new URL('./production-modern-schema-ssh.sh', import.meta.url), 'utf8');
  const start = source.indexOf('public_receipt() {');
  const end = source.indexOf('if [ "$operation" = prepare ]; then\n  # The registry credential', start);
  const final = source.indexOf('# Even a misbehaving helper');
  assert.ok(start > 0 && end > start && final > end);
  const script = `
    set -Eeuo pipefail
    trap 'echo FIXED_HOLD >&2' ERR
    exec 9<>"$FIXTURE_LOCK"
    flock -n 9
    operation=run
    DEPLOY_RUN_ID="$FIXTURE_OWNER"
    TARGET_SHA="$FIXTURE_SHA"
    stage="$FIXTURE_STAGE"
    entry=helper.mjs
  ` + source.slice(start, end) + source.slice(final);
  const invoke = (result, code) => spawnSync('/bin/bash', ['-c', script], {
    input: 'fixture stdin only',
    env: { PATH: process.env.PATH, FIXTURE_LOCK: lock, FIXTURE_OWNER: owner, FIXTURE_SHA: sha, FIXTURE_STAGE: directory,
      FIXTURE_STDIN: 'fixture stdin only', FIXTURE_RESULT: result, FIXTURE_CODE: String(code) },
    encoding: 'utf8', timeout: 6000,
  });
  const pass = invoke(JSON.stringify(success), 0);
  assert.equal(pass.status, 0);
  assert.deepEqual(JSON.parse(pass.stdout), success);
  assert.equal(pass.stderr, '');
  const holdReceipt = { ...success, outcome: 'HOLD' };
  const hold = invoke(JSON.stringify(holdReceipt), 37);
  assert.equal(hold.status, 37);
  assert.deepEqual(JSON.parse(hold.stdout), holdReceipt);
  assert.doesNotMatch(hold.stderr, /fixture error text/);
  const raw = invoke('private raw detail that cannot leave the host', 0);
  assert.notEqual(raw.status, 0);
  assert.equal(raw.stdout, '');
  assert.doesNotMatch(raw.stderr, /private raw detail|fixture error text/);
});
