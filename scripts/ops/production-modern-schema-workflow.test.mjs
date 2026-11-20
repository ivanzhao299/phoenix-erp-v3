import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { requestModernSchemaIdentityToken } from './production-modern-schema-identity.mjs';
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
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/fixture//idtoken/dispatch/job?api-version=2.0',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-oidc-channel-credential',
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

test('OIDC channel preflight stops before SSH connection or host preparation', async () => {
  for (const [override, code] of [
    [{ ACTIONS_ID_TOKEN_REQUEST_URL: '' }, 'CHANNEL_URL_REQUIRED'],
    [{ ACTIONS_ID_TOKEN_REQUEST_URL: 'unparseable-test-value' }, 'CHANNEL_URL_INVALID'],
    [{ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://untrusted.invalid/a/b/idtoken/job?api-version=2.0' }, 'CHANNEL_AUTHORITY_UNAPPROVED'],
    [{ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/a/b/other/job?api-version=2.0' }, 'CHANNEL_ROUTE_UNAPPROVED'],
    [{ ACTIONS_ID_TOKEN_REQUEST_URL: env.ACTIONS_ID_TOKEN_REQUEST_URL+'&audience=old' }, 'CHANNEL_QUERY_UNAPPROVED'],
    [{ ACTIONS_ID_TOKEN_REQUEST_TOKEN: undefined }, 'CHANNEL_CREDENTIAL_REQUIRED'],
    [{ ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture credential' }, 'CHANNEL_CREDENTIAL_INVALID'],
  ]) {
    const f = fixture();
    await assert.rejects(runModernSchemaWorkflow({...env, ...override},f.dependencies),
      {message:'MODERN_SCHEMA_WORKFLOW_HOLD=IDENTITY_PREFLIGHT_'+code});
    assert.deepEqual(f.events, []);
  }
});

test('OIDC request after preparation reports only allowlisted codes and closes without run', async () => {
  for (const [fetch, code] of [
    [async()=>new Response('fixture private payload',{status:403}),'HTTP_AUTHORIZATION'],
    [async()=>new Response('fixture private payload'),'RESPONSE_JSON'],
    [async()=>new Response(JSON.stringify({value:'fixture credential'})),'TOKEN_FORMAT'],
    [async()=>{throw Error('fixture private endpoint details');},'TRANSPORT_FAILED'],
  ]) {
    const f = fixture();
    f.dependencies.requestToken = (binding, request) => {
      f.events.push('identity');
      assert.equal(request.env,env);
      return requestModernSchemaIdentityToken(binding,{env:request.env,fetch});
    };
    await assert.rejects(runModernSchemaWorkflow(env,f.dependencies), {message:'MODERN_SCHEMA_WORKFLOW_HOLD=IDENTITY_REQUEST_'+code});
    assert.deepEqual(f.events,['connect','prepare','identity','close']);
  }
  const f = fixture();
  f.dependencies.requestToken = () => { throw Error('MODERN_SCHEMA_RUNNER_IDENTITY_HOLD=FIXTURE_PRIVATE_VALUE'); };
  await assert.rejects(runModernSchemaWorkflow(env,f.dependencies),{message:'MODERN_SCHEMA_WORKFLOW_HOLD=IDENTITY_REQUEST_UNVERIFIED'});
  assert.deepEqual(f.events,['connect','prepare','close']);
});

test('runner CLI prints one fixed OIDC preflight line without URL or credential details', () => {
  const result = spawnSync(process.execPath,[fileURLToPath(new URL('./production-modern-schema-workflow.mjs',import.meta.url))],{
    env:{...env,ACTIONS_ID_TOKEN_REQUEST_URL:'https://untrusted.invalid/private-test-url'},encoding:'utf8',
  });
  assert.equal(result.status,1);
  assert.equal(result.stdout,'');
  assert.equal(result.stderr,'MODERN_SCHEMA_WORKFLOW_HOLD=IDENTITY_PREFLIGHT_CHANNEL_AUTHORITY_UNAPPROVED\n');
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

test('only exact public preparation failure classes can diagnose a nonzero command, with no OIDC request', async () => {
  const hold = {schema: 'phoenix.modern-schema-public-preparation-hold/v1', owner, targetSha: sha, prepared: false, failure: 'HOST_SURFACE'};
  for (const [prepareStatus, prepareOutput, expected] of [
    [2, JSON.stringify(hold), 'PREPARATION_HOST_SURFACE'],
    [2, JSON.stringify({...hold, failure:'HOST_SURFACE_EXACT_BRIDGE_REQUIRED'}), 'PREPARATION_HOST_SURFACE_EXACT_BRIDGE_REQUIRED'],
    [2, JSON.stringify({...hold, failure:'HOST_SURFACE_UNCLASSIFIED'}), 'PREPARATION_HOST_SURFACE_UNCLASSIFIED'],
    [2, JSON.stringify({...hold, failure:'BACKUP'}), 'PREPARATION_BACKUP'],
    [2, JSON.stringify({...hold, failure:'BACKUP_FACTS'}), 'PREPARATION_BACKUP_FACTS'],
    [2, JSON.stringify({...hold, failure:'BACKUP_CLEANUP_UNRESOLVED'}), 'PREPARATION_BACKUP_CLEANUP_UNRESOLVED'],
    [2, JSON.stringify({...hold, failure:'BACKUP_FACTS /private'}), 'PREPARATION_COMMAND_FAILED'],
    [2, JSON.stringify({...hold, failure:'HOST_SURFACE_EXACT_BRIDGE_REQUIRED /private'}), 'PREPARATION_COMMAND_FAILED'],
    [2, JSON.stringify({...hold, owner: '9001-2'}), 'PREPARATION_COMMAND_FAILED'],
    [2, JSON.stringify({...hold, failure: 'FIXTURE_PRIVATE_DIAGNOSTIC'}), 'PREPARATION_COMMAND_FAILED'],
    [2, JSON.stringify({...hold, private: 'fixture'}), 'PREPARATION_COMMAND_FAILED'],
    [2, JSON.stringify({...hold, prepared: true}), 'PREPARATION_COMMAND_FAILED'],
    [0, JSON.stringify(hold), 'PREPARATION_RECEIPT'],
    [24, '', 'PREPARATION_FD9_BUSY'],
  ]) {
    const f = fixture({prepareStatus, prepareOutput});
    await assert.rejects(runModernSchemaWorkflow(env, f.dependencies), {message: 'MODERN_SCHEMA_WORKFLOW_HOLD=' + expected});
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

test('the reviewed host shell retains parent FD9 and uses only fixed staged entrypoints', () => {
  const source = fs.readFileSync(new URL('./production-modern-schema-ssh.sh', import.meta.url), 'utf8');
  assert.equal(spawnSync('/bin/bash', ['-n'], { input: source }).status, 0);
  assert.match(source, /test "\$\(repo_git rev-parse refs\/remotes\/origin\/main\)" = "\$TARGET_SHA"/);
  assert.match(source, /cmp -s "\$staged_file" <\(repo_git show "\$TARGET_SHA:\$file"\)/);
  assert.match(source, /node "\$stage\/\$entry" prepare <\/dev\/null/);
  assert.match(source, /\n  node "\$stage\/\$entry" run >&"\$receipt_fd" 2>\/dev\/null \|\| status=\$\?/);
  assert.match(source, /\npublic_receipt "\$status" < "\$raw_receipt"\nexit "\$status"/);
  assert.doesNotMatch(source, /exec node "\$stage\/\$entry"/);
});

test('a newer host wrapper validates the prior target stage for finalize without the new prepare vocabulary', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-schema-prior-stage-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const script = fs.readFileSync(new URL('./production-modern-schema-ssh.sh', import.meta.url), 'utf8');
  const start = script.indexOf('stage="$STATE_DIR/modern-schema-stage-$DEPLOY_RUN_ID"');
  const end = script.indexOf('public_receipt() {');
  assert.ok(start > 0 && end > start);
  const entry = 'scripts/ops/production-modern-schema-release.mjs';
  const stage = path.join(directory, 'modern-schema-stage-' + owner);
  fs.mkdirSync(path.join(stage, 'scripts/ops'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(stage, entry), 'reviewed prior entry\n', { mode: 0o600 });
  const setup = `
    set -Eeuo pipefail
    operation=$1
    repo_git() {
      case "$1:$2" in
        "show:$TARGET_SHA:scripts/ops/modern-schema-stage-files.txt")
          printf '%s\\n' scripts/ops/production-modern-schema-release.mjs ;;
        "show:$TARGET_SHA:scripts/ops/production-modern-schema-release.mjs")
          printf 'reviewed prior entry\\n' ;;
        "ls-tree:$TARGET_SHA")
          printf '100644 blob %s\\t%s\\n' "$TARGET_SHA" "$4" ;;
        *) return 92 ;;
      esac
    }
    stat() {
      command stat "$@" | sed 's/^[0-9]*:/0:/'
    }
  `;
  const invoke = operation => spawnSync('/bin/bash', ['-c', setup + script.slice(start, end), 'fixture', operation], {
    env: { PATH: process.env.PATH, STATE_DIR: directory, DEPLOY_RUN_ID: owner, TARGET_SHA: sha },
    encoding: 'utf8',
  });
  assert.equal(invoke('finalize').status, 0);
  assert.equal(invoke('run').status, 0);
  fs.writeFileSync(path.join(stage, entry), 'changed prior entry\n');
  assert.equal(invoke('finalize').status, 1);
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
    const lock=fs.fstatSync(9), pp=process.ppid, parent=fs.statSync('/proc/'+pp+'/fd/9');
    const children=fs.readFileSync('/proc/'+pp+'/task/'+pp+'/children','utf8').trim().split(/\\s+/);
    if(children.length!==1||children[0]!==String(process.pid)) process.exit(11);
    if (parent.ino!==lock.ino||parent.dev!==lock.dev||process.argv[2]!==process.env.FIXTURE_OPERATION) process.exit(9);
    if (fs.readFileSync(0,'utf8')!==process.env.FIXTURE_STDIN) process.exit(10);
    process.stderr.write('fixture error text that must stay private\\n');
    console.log(process.env.FIXTURE_RESULT);
    process.exit(Number(process.env.FIXTURE_CODE));
  `);
  const source = fs.readFileSync(new URL('./production-modern-schema-ssh.sh', import.meta.url), 'utf8');
  const start = source.indexOf('public_receipt() {');
  const end = source.indexOf('if [ "$operation" = prepare ]; then\n  # The registry credential', start);
  const final = source.indexOf('# Run as the only child');
  assert.ok(start > 0 && end > start && final > end);
  const script = `
    set -Eeuo pipefail
    umask 077
    trap 'echo FIXED_HOLD >&2' ERR
    exec 9<>"$FIXTURE_LOCK"
    flock -n 9
    operation="$FIXTURE_OPERATION"
    DEPLOY_RUN_ID="$FIXTURE_OWNER"
    TARGET_SHA="$FIXTURE_SHA"
    stage="$FIXTURE_STAGE"
    STATE_DIR="$FIXTURE_STATE"
    entry=helper.mjs
  ` + source.slice(start, end) + source.slice(final);
  const invoke = (result, code, stage = fs.mkdtempSync(path.join(directory, 'run-')), operation = 'run') => {
    fs.copyFileSync(path.join(directory, 'helper.mjs'), path.join(stage, 'helper.mjs'));
    if(operation==='prepare'){
      fs.mkdirSync(path.join(stage,'scripts/ops'),{recursive:true});
      fs.copyFileSync(new URL('./production-modern-schema-public-preparation.mjs',import.meta.url),
        path.join(stage,'scripts/ops/production-modern-schema-public-preparation.mjs'));
    }
    const privateState = stage + '-private';
    fs.mkdirSync(privateState, {recursive: true, mode: 0o700});
    return spawnSync('/bin/bash', ['-c', script], {
      input: 'fixture stdin only',
      env: { PATH: process.env.PATH, FIXTURE_LOCK: lock, FIXTURE_OWNER: owner, FIXTURE_SHA: sha, FIXTURE_STAGE: stage, FIXTURE_STATE: privateState,
        FIXTURE_OPERATION: operation, FIXTURE_STDIN: operation === 'run' ? 'fixture stdin only' : '', FIXTURE_RESULT: result, FIXTURE_CODE: String(code) },
      encoding: 'utf8', timeout: 6000,
    });
  };
  const firstStage = fs.mkdtempSync(path.join(directory, 'first-'));
  const pass = invoke(JSON.stringify(success), 0, firstStage);
  assert.equal(pass.status, 0);
  assert.deepEqual(JSON.parse(pass.stdout), success);
  assert.equal(pass.stderr, '');
  const captured = path.join(firstStage + '-private', '.transport-' + owner + '-run.receipt');
  assert.deepEqual(fs.readdirSync(firstStage), ['helper.mjs']);
  assert.equal(fs.lstatSync(captured).mode & 0o777, 0o600);
  const saved = fs.readFileSync(captured, 'utf8');
  const repeated = invoke('unexpected duplicate', 0, firstStage);
  assert.notEqual(repeated.status, 0);
  assert.equal(repeated.stdout, '');
  assert.equal(fs.readFileSync(captured, 'utf8'), saved);
  const holdReceipt = { ...success, outcome: 'HOLD' };
  const hold = invoke(JSON.stringify(holdReceipt), 37);
  assert.equal(hold.status, 37);
  assert.deepEqual(JSON.parse(hold.stdout), holdReceipt);
  assert.doesNotMatch(hold.stderr, /fixture error text/);
  const preparationHold = {schema: 'phoenix.modern-schema-public-preparation-hold/v1', owner, targetSha: sha, prepared: false, failure: 'BACKUP'};
  const blocked = invoke(JSON.stringify(preparationHold), 36, undefined, 'prepare');
  assert.equal(blocked.status, 36);
  assert.deepEqual(JSON.parse(blocked.stdout), preparationHold);
  const classified={...preparationHold,failure:'HOST_SURFACE_ROOT_READER_UNIT_INVENTORY'};
  const safe=invoke(JSON.stringify(classified),36,undefined,'prepare');
  assert.equal(safe.status,36);
  assert.deepEqual(JSON.parse(safe.stdout),classified);
  const backupClassified={...preparationHold,failure:'BACKUP_CLEANUP_UNRESOLVED'};
  const backupSafe=invoke(JSON.stringify(backupClassified),36,undefined,'prepare');
  assert.equal(backupSafe.status,36);
  assert.deepEqual(JSON.parse(backupSafe.stdout),backupClassified);
  const unsafeBackup=invoke(JSON.stringify({...backupClassified,failure:'BACKUP_PRIVATE_FIXTURE'}),36,undefined,'prepare');
  assert.equal(unsafeBackup.stdout,'');
  assert.doesNotMatch(unsafeBackup.stderr,/PRIVATE_FIXTURE/);
  const privateCode=invoke(JSON.stringify({...classified,failure:classified.failure+' /private fixture-token'}),36,undefined,'prepare');
  assert.equal(privateCode.stdout,'');
  assert.doesNotMatch(privateCode.stderr,/private|fixture-token/);
  const finishStage=fs.mkdtempSync(path.join(directory,'finish-'));
  assert.equal(invoke(JSON.stringify(success),0,finishStage,'finalize').status,0);
  assert.equal(invoke(JSON.stringify(success),0,finishStage,'finalize').status,0);
  const finishReceipts=fs.readdirSync(finishStage+'-private');
  assert.equal(finishReceipts.length,2);
  assert.ok(finishReceipts.every(file=>file.startsWith('.transport-'+owner+'-finalize.')));
  const unapproved = invoke(JSON.stringify({...preparationHold, failure: 'FIXTURE_PRIVATE_DIAGNOSTIC'}), 36, undefined, 'prepare');
  assert.equal(unapproved.stdout, '');
  assert.doesNotMatch(unapproved.stderr, /FIXTURE_PRIVATE_DIAGNOSTIC/);
  const raw = invoke('private raw detail that cannot leave the host', 0);
  assert.notEqual(raw.status, 0);
  assert.equal(raw.stdout, '');
  assert.doesNotMatch(raw.stderr, /private raw detail|fixture error text/);
});

test('a protected continuation uses the exact original run without preparation, identity, or migration',async()=>{
  const events=[],original='8900-3';
  const dependencies={
    requestToken(){assert.fail('continuation requested a new authorization token');},
    createSsh(_request,host){
      assert.equal(host.DEPLOY_RUN_ID,original);
      assert.equal(host.DEPLOY_RUN_ATTEMPT,'3');
      assert.equal(host.RUN_MIG,'false');
      return {exchange(operation,stdin){events.push(operation);assert.equal(stdin,'');
        assert.equal(operation,'finalize');return {status:0,stdout:JSON.stringify({...success,owner:original})};},
      close(){events.push('close');}};
    },
  };
  const result=await runModernSchemaWorkflow({...env,MODERN_SCHEMA_GITHUB_READ_TOKEN:undefined,MODERN_SCHEMA_RESUME_OWNER:original,
    ACTIONS_ID_TOKEN_REQUEST_URL:undefined,ACTIONS_ID_TOKEN_REQUEST_TOKEN:undefined},dependencies);
  assert.equal(result.owner,original);
  assert.deepEqual(events,['finalize','close']);
  for(const invalid of ['undefined','000-1','9000','8900-03','8900-3; bad']){
    await assert.rejects(runModernSchemaWorkflow({...env,MODERN_SCHEMA_RESUME_OWNER:invalid},{
      createSsh(){assert.fail('bad continuation identity reached SSH');},
    }),/EXACT_RESUME_OWNER_REQUIRED/);
  }
});

test('the resume input is limited to the protected modern deployment path',()=>{
  const yaml=fs.readFileSync(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
  const shell=fs.readFileSync(new URL('./production-modern-schema-ssh.sh',import.meta.url),'utf8');
  assert.match(yaml,/if \[ -n "\$MODERN_SCHEMA_RESUME_OWNER" \]; then\s+test "\$MODERN_SCHEMA_RELEASE" = true/);
  assert.match(shell,/node "\$stage\/\$entry" finalize <\/dev\/null/);
  assert.match(shell,/repo_git merge-base --is-ancestor "\$TARGET_SHA" "\$MODERN_SCHEMA_EXECUTION_SHA"/);
  assert.match(shell,/repo_git show "\$TARGET_SHA:\$manifest"/);
  assert.match(shell,/raw_receipt="\$\(\/usr\/bin\/mktemp "\$STATE_DIR\/.transport-\$DEPLOY_RUN_ID-finalize\./);
});

test('continuation uses the current protected main source and the past committed target independently',async()=>{
  const executionSha='e'.repeat(40),original='8900-3';
  const result=await runModernSchemaWorkflow({...env,GITHUB_SHA:executionSha,GITHUB_WORKFLOW_SHA:executionSha,MODERN_SCHEMA_RESUME_OWNER:original},{
    requestToken(){assert.fail('continuation requested new authority');},
    createSsh(_request,host){
      assert.equal(host.TARGET_SHA,sha);
      assert.equal(host.APPROVED_CONFIG_FLOOR_SHA,sha);
      assert.equal(host.MODERN_SCHEMA_EXECUTION_SHA,executionSha);
      return {exchange(operation,stdin){
        assert.equal(operation,'finalize');assert.equal(stdin,'');
        return {status:0,stdout:JSON.stringify({...success,owner:original})};
      },close(){}};
    },
  });
  assert.equal(result.targetSha,sha);
});

test('the real upstream-main gate allows only finalize against an exact ancestor', t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-modern-main-advances-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const local=path.join(directory,'local'),origin=path.join(directory,'origin');
  const gitEnv={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Fixture',
    GIT_AUTHOR_EMAIL:'fixture@localhost',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@localhost'};
  const git=(...args)=>{
    const result=spawnSync('/usr/bin/git',args,{env:gitEnv,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    return result.stdout.trim();
  };
  git('init','--quiet','--initial-branch=main',local);
  git('init','--quiet','--bare',origin);
  git('-C',local,'commit','--quiet','--allow-empty','-m','prior exact release');
  const original=git('-C',local,'rev-parse','HEAD');
  git('-C',local,'commit','--quiet','--allow-empty','-m','current main');
  const current=git('-C',local,'rev-parse','HEAD');
  git('-C',local,'remote','add','origin',origin);
  git('-C',local,'push','--quiet','origin','main');
  const ssh=fs.readFileSync(new URL('./production-modern-schema-ssh.sh',import.meta.url),'utf8');
  const start=ssh.indexOf('repo_git fetch origin main'),end=ssh.indexOf('\nstage=',start);
  assert.ok(start>=0&&end>start);
  const gate=ssh.slice(start,end);
  const check=(operation,target,execution='')=>spawnSync('/bin/bash',['-euo','pipefail','-c',`
    repo_git(){ /usr/bin/git -C "$FIXTURE_GIT_DIRECTORY" "$@"; }
    ${gate}
    echo REACHED_EXACT_STAGE
  `],{env:{...gitEnv,operation,TARGET_SHA:target,MODERN_SCHEMA_EXECUTION_SHA:execution,FIXTURE_GIT_DIRECTORY:local},encoding:'utf8'});
  assert.equal(check('finalize',original,current).stdout.trim(),'REACHED_EXACT_STAGE');
  assert.notEqual(check('finalize','f'.repeat(40),current).status,0);
  assert.notEqual(check('finalize',original,original).status,0);
  assert.notEqual(check('run',original).status,0);
  assert.notEqual(check('prepare',current,current).status,0);
  assert.equal(check('run',current).stdout.trim(),'REACHED_EXACT_STAGE');
});

test('resume cannot enter application builds, push image tags, or use ordinary deploy',()=>{
  const yaml=fs.readFileSync(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
  const build=yaml.slice(yaml.indexOf('\n  build-push:'),yaml.indexOf('\n    runs-on:',yaml.indexOf('\n  build-push:')));
  const deploy=yaml.slice(yaml.indexOf('\n  deploy:'),yaml.indexOf('\n    steps:',yaml.indexOf('\n  deploy:')));
  assert.match(build,/success\(\) &&\s+!inputs\.modern_schema_resume_owner &&/);
  assert.match(deploy,/needs\.detect-changes\.result == 'success'/);
  assert.match(deploy,/!inputs\.modern_schema_resume_owner && needs\.build-push\.result == 'success'/);
  assert.match(deploy,/inputs\.modern_schema_release == true && inputs\.modern_schema_resume_owner && needs\.build-push\.result == 'skipped'/);
  assert.match(deploy,/environment: production/);
  assert.match(yaml,/name: Deploy via SSH\n\s+if: inputs\.modern_schema_release != true/);
  assert.match(yaml,/name: Send deploy notification\n\s+if: always\(\) && !inputs\.modern_schema_resume_owner/);
});

test('the hosted and SSH duration allowances apply only to the exact modern release route',()=>{
  const yaml=fs.readFileSync(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
  const deploy=yaml.slice(yaml.indexOf('\n  deploy:'),yaml.indexOf('\n    steps:',yaml.indexOf('\n  deploy:')));
  const transport=fs.readFileSync(new URL('./production-modern-schema-workflow.mjs',import.meta.url),'utf8');
  assert.match(deploy,/timeout-minutes: \$\{\{ inputs\.modern_schema_release && 105 \|\| 40 \}\}/);
  assert.match(transport,/const timeoutMinutes = operation === 'run' \? 59 : 34;/);
  assert.match(transport,/operatorRecovery \? \['recover-original'\] : \['prepare', 'run', 'finalize'\]/);
});
