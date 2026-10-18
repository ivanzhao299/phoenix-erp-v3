import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { REMOTE_BODY, TARGET_SHA, PAYLOAD_FIELDS, validateConnection, reviewedPayload, snapshotRunnerFiles, verifyRunnerFiles, parseDiagnosticOutput, captureSsh, executeReviewedAudit } from './pinned-readonly-ssh-execution.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const runnerSha = 'a'.repeat(40), sentinel = 'SENSITIVE_SENTINEL_DO_NOT_ECHO';
function source() {
  const fields = {}, sourceDigests = {};
  for (const key of PAYLOAD_FIELDS.filter(k => k.endsWith('_B64'))) { const bytes = Buffer.from('reviewed-public-source-' + key); fields[key] = bytes.toString('base64'); sourceDigests[key] = sha(bytes); }
  fields.FORENSIC_TARGET_SHA = TARGET_SHA; fields.FORENSIC_RUNNER_SHA = runnerSha;
  fields.FORENSIC_PROGRAM_SHA256 = sourceDigests.FORENSIC_PROGRAM_B64; fields.FORENSIC_TOPOLOGY_SHA256 = sourceDigests.FORENSIC_TOPOLOGY_B64;
  return { fields, approval: { runnerSha, sourceDigests, programSha256: fields.FORENSIC_PROGRAM_SHA256, topologySha256: fields.FORENSIC_TOPOLOGY_SHA256 } };
}
function diagnostic() { return { schema: 'phoenix.batch2-config-forensics/v1', target: TARGET_SHA, runnerSha, context: { uid: 0, trustedPathsAndFd9: 'PASS' },
  operationsAttemptedByThisDiagnostic: { checkoutUpdate: false, floorWrite: false, activeWrite: false, transactionWrite: false, containerSwitch: false, migration: false, databaseWrite: false, chanjetSync: false } }; }
const output = data => 'CONFIG_FORENSICS_JSON=' + JSON.stringify(data) + '\nFORENSIC_CONTROL_SHELL_COMPLETE=true\n';
function fakeSpawn({ stdout = output(diagnostic()), stderr = '', status = 0, neverClose = false, onSpawn = () => {} } = {}) {
  return (binary, args, options) => {
    onSpawn(binary, args, options);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => { queueMicrotask(() => child.emit('close', null, 'SIGTERM')); return true; };
    child.stdin.on('finish', () => { if (neverClose) return; queueMicrotask(() => { child.stdout.end(stdout); child.stderr.end(stderr); child.emit('close', status, null); }); });
    return child;
  };
}
function optionsFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pinned-ssh-execution-test-')); fs.chmodSync(directory, 0o700);
  const identityFile = path.join(directory, 'identity'); fs.writeFileSync(identityFile, 'SYNTHETIC_NOT_A_PRIVATE_KEY', { mode: 0o600, flag: 'wx' });
  return { ...source(), directory, identityFile, knownHostsFile: path.join(directory, 'known_hosts'), connection: { host: '47.236.122.224', port: '22', proxyHost: '', username: 'root' } };
}
async function withOptions(callback) { const options = optionsFixture(); try { return await callback(options); } finally { fs.rmSync(options.directory, { recursive: true }); } }
test('frozen original twelve-line remote body is byte-identical to the reviewed SSH-action body', () => {
  assert.equal(sha(REMOTE_BODY), '32e5051638456ca8b9a3dc570b9b7b21dfeda25d9dc6745f0ca4a7c8252f324b');
  assert.equal(REMOTE_BODY.trimEnd().split('\n').length, 12); assert.ok(REMOTE_BODY.includes('PRODUCTION_CONTROL_BOOTSTRAP_B64'));
});
test('reviewed renderer accepts only complete canonical base64/hex fields and exact source pins', () => {
  const { fields, approval } = source(); const rendered = reviewedPayload(fields, approval); assert.ok(rendered.payload.endsWith(REMOTE_BODY)); assert.equal(rendered.sha256, sha(rendered.payload));
  for (const changed of [{ ...fields, COMMAND: sentinel }, { ...fields, FORENSIC_TARGET_SHA: runnerSha }, { ...fields, FORENSIC_PROGRAM_SHA256: 'b'.repeat(64) }, { ...fields, FORENSIC_RUNNER_SHA: 'c'.repeat(40) }, { ...fields, PRODUCTION_CONTROL_BOOTSTRAP_B64: Buffer.from('malicious command').toString('base64') }, { ...fields, PRODUCTION_PATH_HELPER_B64: "';id;#" }]) assert.throws(() => reviewedPayload(changed, approval), e => !e.message.includes(sentinel));
});
test('endpoint, port, proxy and local identity fallback cannot change', () => {
  const good = { host: '47.236.122.224', port: '22', proxyHost: '', username: 'root' }; validateConnection(good);
  for (const changed of [{ host: '127.0.0.1' }, { port: '2222' }, { port: '' }, { port: undefined }, { proxyHost: sentinel }, { username: 'phoenix-codex-deploy' }, { username: 'root;id' }, { username: '' }]) assert.throws(() => validateConnection({ ...good, ...changed }), e => !e.message.includes(sentinel));
});
test('bounded capture sends minimal environment, approved stdin and never returns raw stderr', async () => {
  let checked = false; const plan = { executable: '/usr/bin/ssh', args: ['fixed'], stdin: 'frozen script' };
  const stdout = await captureSsh(plan, { spawnProcess: fakeSpawn({ stderr: sentinel, onSpawn: (binary, args, options) => { checked = true; assert.equal(binary, '/usr/bin/ssh'); assert.deepEqual(args, ['fixed']); assert.deepEqual(Object.keys(options.env).sort(), ['LANG', 'LC_ALL', 'PATH']); assert.equal(options.shell, false); } }) });
  assert.equal(checked, true); assert.ok(!stdout.includes(sentinel));
});
test('SSH exit 42 with valid result and completion marker always HOLD, without stderr leak', async () => {
  await assert.rejects(captureSsh({ executable: 'ssh', args: [], stdin: '' }, { spawnProcess: fakeSpawn({ status: 42, stderr: sentinel }) }), e => e.message === 'PINNED_READONLY_EXECUTION_HOLD=SSH_PROCESS_FAILED' && !e.message.includes(sentinel));
});
test('SSH timeout, output limit and stderr limit fail closed', async () => {
  const plan = { executable: 'ssh', args: [], stdin: '' };
  await assert.rejects(captureSsh(plan, { spawnProcess: fakeSpawn({ neverClose: true }), timeoutMs: 5 }), /SSH_TIMEOUT/);
  await assert.rejects(captureSsh(plan, { spawnProcess: fakeSpawn({ stdout: 'x'.repeat(512 * 1024 + 1) }) }), /SSH_STDOUT_LIMIT/);
  await assert.rejects(captureSsh(plan, { spawnProcess: fakeSpawn({ stderr: 'x'.repeat(64 * 1024 + 1) }) }), /SSH_STDERR_LIMIT/);
});
test('only unique canonical exact-context readonly result and completion marker are accepted', () => {
  assert.deepEqual(parseDiagnosticOutput(output(diagnostic()), runnerSha), diagnostic());
  const good = output(diagnostic());
  for (const bad of [good + good, good.split('\n').slice(0, 1).join('\n'), good.replace('FORENSIC_CONTROL_SHELL_COMPLETE=true', sentinel), good + sentinel, good.replace('"target":', '"target":"' + TARGET_SHA + '","target":'), output({ ...diagnostic(), target: runnerSha }), output({ ...diagnostic(), context: { uid: 1002, trustedPathsAndFd9: 'PASS' } }), output({ ...diagnostic(), password: sentinel }), output({ ...diagnostic(), health: { api: sentinel } }), output({ ...diagnostic(), operationsAttemptedByThisDiagnostic: { ...diagnostic().operationsAttemptedByThisDiagnostic, databaseWrite: true } })]) assert.throws(() => parseDiagnosticOutput(bad, runnerSha), e => !e.message.includes(sentinel));
});
test('full expected health, ledger and permission-free topology snapshot vocabulary is preserved', () => {
  const data = { ...diagnostic(), health: { api: '200', web: '200' }, ledger: { canonicalCount: 89, pendingCount: 0, legacyExactSet: true }, migrationScope: { baseline: runnerSha, target: TARGET_SHA, changed: [] }, hostTopology: {
    schema: 'phoenix.maintenance-host-topology/v1', completeSafetyProof: false, productionMutation: false, continuousDrainProof: false, admissionOrApprovalGranted: false, verification: 'UNVERIFIED',
    docker: { inventoryStable: true, containers: [{ id: 'b'.repeat(64), networkMode: 'BRIDGE', ports: [{ containerPort: 3100, protocol: 'tcp', published: true, hosts: [{ hostAddress: '127.0.0.1', hostPort: 3100, exposure: 'LOOPBACK' }] }] }] }, processes: { hostExecutorCompleteness: 'UNVERIFIED', processes: [] }, cron: { otherSchedulers: 'UNVERIFIED', files: [] } } };
  assert.deepEqual(parseDiagnosticOutput(output(data), runnerSha), data);
});
test('known_hosts create-only and private identity metadata, symlink and hardlink checks', async () => {
  await withOptions(async options => {
    const result = await executeReviewedAudit(options, { spawnProcess: fakeSpawn() }); assert.equal(result.transport.sshExitCode, 0); assert.equal(fs.statSync(options.knownHostsFile).mode & 0o777, 0o600);
    await assert.rejects(executeReviewedAudit(options, { spawnProcess: fakeSpawn() }));
    const snapshot = snapshotRunnerFiles(options.directory, options.identityFile, options.knownHostsFile); fs.chmodSync(options.identityFile, 0o640); assert.throws(() => verifyRunnerFiles(snapshot, options.directory, options.identityFile, options.knownHostsFile), /RUNNER_FILE_METADATA/);
  });
  await withOptions(async options => { fs.linkSync(options.identityFile, path.join(options.directory, 'another')); await assert.rejects(executeReviewedAudit(options, { spawnProcess: fakeSpawn() }), /RUNNER_FILE_METADATA/); });
  await withOptions(async options => { fs.renameSync(options.identityFile, path.join(options.directory, 'real')); fs.symlinkSync('real', options.identityFile); await assert.rejects(executeReviewedAudit(options, { spawnProcess: fakeSpawn() }), /RUNNER_FILE_METADATA/); });
});
test('identity inode replacement between preparation and execution denies before subprocess', async () => {
  await withOptions(async options => { let spawned = false; await assert.rejects(executeReviewedAudit(options, { beforeExecute: () => { fs.renameSync(options.identityFile, path.join(options.directory, 'old')); fs.writeFileSync(options.identityFile, sentinel, { mode: 0o600, flag: 'wx' }); }, spawnProcess: () => { spawned = true; throw new Error('SHOULD_NOT_EXECUTE'); } }), /RUNNER_METADATA_CHANGED/); assert.equal(spawned, false); });
});
test('private identity is metadata-only; execution module never reads its bytes', () => {
  const source = fs.readFileSync(new URL('./pinned-readonly-ssh-execution.mjs', import.meta.url), 'utf8');
  assert.ok(!/readFileSync\(options\.identityFile|readFileSync\(.*DEPLOY_SSH_KEY|process\.env\.DEPLOY_SSH_KEY/.test(source));
});

test('workflow keeps protected context and exact source pins, only native transport handles credentials', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/chanjet-readonly-restoration.yml', import.meta.url), 'utf8');
  for (const required of ['environment: production', 'group: cicd-refs/heads/main', 'cancel-in-progress: false', 'approved_runner_sha', 'approved_program_sha256', 'approved_topology_sha256', 'git ls-remote origin refs/heads/main', 'umask 077', 'set -o noclobber', 'trap cleanup_transport EXIT', 'node scripts/ci/pinned-readonly-ssh-execution.mjs --execute']) assert.ok(workflow.includes(required));
  assert.ok(!workflow.includes('appleboy/ssh-action')); assert.ok(!workflow.includes('DEPLOY_PROXY_SSH_KEY')); assert.ok(!workflow.includes('steps.production.outputs.stdout'));
  assert.ok(workflow.indexOf('unset DEPLOY_SSH_KEY') < workflow.indexOf('node scripts/ci/pinned-readonly-ssh-execution.mjs --execute'));
  assert.ok(!workflow.includes('ssh-keyscan')); assert.ok(!workflow.includes('StrictHostKeyChecking=no'));
});

test('actual execution argv resolves fixed Ed25519, curve25519 KEX and strict policy offline without connecting', async () => {
  await withOptions(async options => {
    let argv;
    await executeReviewedAudit(options, { spawnProcess: fakeSpawn({ onSpawn: (binary, args) => { assert.equal(binary, '/usr/bin/ssh'); argv = args; } }) });
    assert.ok(argv.includes('-oKexAlgorithms=curve25519-sha256'));
    const resolved = spawnSync('/usr/bin/ssh', ['-G', ...argv], { env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 5000 });
    assert.equal(resolved.status, 0);
    const entries = new Map(resolved.stdout.trim().split('\n').map(line => { const i = line.indexOf(' '); return [line.slice(0, i), line.slice(i + 1)]; }));
    assert.equal(entries.get('hostname'), '47.236.122.224'); assert.equal(entries.get('hostkeyalgorithms'), 'ssh-ed25519');
    assert.equal(entries.get('kexalgorithms'), 'curve25519-sha256'); assert.equal(entries.get('stricthostkeychecking'), 'true');
    assert.equal(entries.get('identityagent'), 'none'); assert.equal(entries.get('identitiesonly'), 'yes'); assert.equal(entries.get('passwordauthentication'), 'no');
    assert.equal(entries.get('userknownhostsfile'), options.knownHostsFile);
    assert.ok(argv.includes('-oProxyCommand=none')); assert.ok(argv.includes('-oProxyJump=none'));
    assert.ok(!entries.has('proxycommand') || entries.get('proxycommand') === 'none');
    assert.ok(!entries.has('proxyjump') || entries.get('proxyjump') === 'none'); assert.equal(entries.get('proxyusefdpass'), 'no');
  });
});

test('owner-approved direct forensic route is fixed in source and keeps protected identity only',()=>{
  const workflow=fs.readFileSync(new URL('../../.github/workflows/chanjet-readonly-restoration.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes("DEPLOY_HOST: '47.236.122.224'"));assert.ok(workflow.includes("DEPLOY_PORT: '22'"));assert.ok(workflow.includes("DEPLOY_PROXY_HOST: ''"));
  assert.ok(!workflow.includes('secrets.DEPLOY_HOST'));assert.ok(!workflow.includes('secrets.DEPLOY_PORT'));assert.ok(!workflow.includes('secrets.DEPLOY_PROXY_HOST'));
  assert.ok(workflow.includes('DEPLOY_USER: ${{ secrets.DEPLOY_USER }}'));assert.ok(workflow.includes('DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}'));
});

test('all four existing startup summary results are preserved without treating HOLD as PASS',()=>{
  for(const result of ['HOLD_SCHEMA_OR_WRITE_SIGNAL','HOLD_STARTUP_ERROR','UNVERIFIED_STARTUP_EVIDENCE','PASS_REDACTED_SUMMARY']){
    const data={...diagnostic(),latestCompleteEvidenceTriplet:{startup:{result,rawOutput:false}}};
    assert.equal(parseDiagnosticOutput(output(data),runnerSha).latestCompleteEvidenceTriplet.startup.result,result);
  }
  assert.throws(()=>parseDiagnosticOutput(output({...diagnostic(),latestCompleteEvidenceTriplet:{startup:{result:sentinel}}}),runnerSha),e=>e.message==='PINNED_READONLY_EXECUTION_HOLD=RESULT_STRING_RESULT'&&!e.message.includes(sentinel));
});

test('HTTP status, source migration paths and IPv4-mapped IPv6 follow their existing typed collector contracts',()=>{
  for(const api of ['100','200','404','500','599'])assert.equal(parseDiagnosticOutput(output({...diagnostic(),health:{api}}),runnerSha).health.api,api);
  for(const api of ['000','099','600',sentinel])assert.throws(()=>parseDiagnosticOutput(output({...diagnostic(),health:{api}}),runnerSha));
  const data={...diagnostic(),migrationScope:{changed:['migrations/20260101_example.sql']},hostTopology:{completeSafetyProof:false,productionMutation:false,continuousDrainProof:false,admissionOrApprovalGranted:false,docker:{containers:[{ports:[{hosts:[{hostAddress:'::ffff:127.0.0.1'}]}]}]}}};
  assert.deepEqual(parseDiagnosticOutput(output(data),runnerSha),data);
  for(const changed of ['migrations/../secret.sql','private/secret.sql'])assert.throws(()=>parseDiagnosticOutput(output({...diagnostic(),migrationScope:{changed:[changed]}}),runnerSha));
  assert.throws(()=>parseDiagnosticOutput(output({...diagnostic(),hostAddress:'999.999.999.999'}),runnerSha));
});

test('live GitHub main pin is checked separately from the frozen comparison baseline',()=>{
  const w=fs.readFileSync(new URL('../../.github/workflows/chanjet-readonly-restoration.yml',import.meta.url),'utf8');
  assert.ok(w.includes('expected_github_main_sha:'));assert.ok(w.includes('test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$EXPECTED_GITHUB_MAIN_SHA"'));
  assert.equal(w.split('test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$EXPECTED_GITHUB_MAIN_SHA"').length-1,2);
  assert.ok(w.includes("productionReleaseEligibility:'NOT_EVALUATED'"));assert.ok(w.includes("'scope.json'"));
});

test('new attribution joins accept only digests and fixed process metadata, never raw paths or names',()=>{
  const data={...diagnostic(),hostTopology:{completeSafetyProof:false,productionMutation:false,continuousDrainProof:false,admissionOrApprovalGranted:false,docker:{containers:[{nameSha256:'a'.repeat(64),projectNameSha256:'b'.repeat(64),serviceNameSha256:'c'.repeat(64)}]},processes:{processes:[{cwdSha256:'d'.repeat(64),systemdControlGroupSha256:['e'.repeat(64)]}]},systemd:{units:[{controlGroupSha256:'e'.repeat(64),workingDirectorySha256:'d'.repeat(64),invocationIdSha256:'f'.repeat(64),mainProcess:{pid:2,startTicks:'123',realUid:0,effectiveUid:0,verification:'SNAPSHOT_ONLY'}}]}}};
  assert.deepEqual(parseDiagnosticOutput(output(data),runnerSha),data);
  data.hostTopology.systemd.units[0].workingDirectorySha256='/private/'+sentinel;
  assert.throws(()=>parseDiagnosticOutput(output(data),runnerSha),e=>!e.message.includes(sentinel));
});
