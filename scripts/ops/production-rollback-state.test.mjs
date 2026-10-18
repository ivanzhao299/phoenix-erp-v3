import { verifyTransition } from './verify-config-floor-transition.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';
import { migrationScope, assertFloor, rollbackEligibility, requireCleanMain, assertFloorMonotonic, assertRuntimePins, assertTransactionOwnership, CONTRACT, validateEffectiveConfig } from './production-config-guard.mjs';
import { beginState, rollbackPlan, inspectCandidate, atomicState, requireFirstTransition } from './production-deployment-state.mjs';
import { composeArguments, runCompose } from './phoenix-production-compose.mjs';
const id = char => `sha256:${char.repeat(64)}`;
const revision = char => char.repeat(40);
const previous = { api: { imageId: id('a'), revision: revision('a') }, web: { imageId: id('b'), revision: revision('b') } };

function stateIO(dir) {
  const rootStat = stat => Object.assign(Object.create(stat), { uid: 0 });
  return { contract: { ...CONTRACT, stateDirectory: dir }, inspectDirectory: () => [{ path: dir }],
    fs: { ...fs, fstatSync: fd => rootStat(fs.fstatSync(fd)), lstatSync: (...args) => rootStat(fs.lstatSync(...args)) } };
}
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-rollback-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), value); };
  const commit = name => { git('add', '.'); git('commit', '-qm', name); return git('rev-parse', 'HEAD'); };
  try {
    git('init', '-q', '--initial-branch=main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    write('README.md', 'legacy'); const legacy = commit('legacy');
    for (const file of CONTRACT.criticalFiles) write(file, fs.readFileSync(path.resolve(file)));
    const floorSha = commit('safe configuration'); const floor = { version: CONTRACT.version, phase: 'READY', floorSha };
    return run({ root, git, write, commit, legacy, floor });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('captures actual immutable API/Web image IDs and OCI revisions without pull/tag/start/env inspection', () => {
  const calls = []; const actual = captureRuntime(args => { calls.push(args); return args.includes('--format') && args.at(-1) === '{{.Image}}' ? (args[1].endsWith('api') ? id('a') : id('b')) : (args[2] === id('a') ? revision('a') : revision('b')); });
  assert.deepEqual(actual, previous); assert.equal(calls.length, 4); assert.ok(calls.every(args => args[0] === 'inspect' || args[0] === 'image'));
  assert.doesNotMatch(JSON.stringify(calls), /pull|tag|restart|Config.Env/);
});
test('missing/malformed OCI revision or immutable ID holds before any switch', () => {
  assert.throws(() => captureRuntime(() => ''), /IMAGE_ID_UNAVAILABLE/);
  assert.throws(() => captureRuntime(args => args[0] === 'inspect' ? id('a') : 'latest'), /REVISION_UNAVAILABLE/);
  assert.throws(() => inspectCandidate('candidate', revision('b'), args => args.at(-1) === '{{.Id}}' ? id('a') : revision('a')), /CANDIDATE_REVISION/);
});
test('execution environment strips credential, flag and remote/context overrides', () => {
  const safe = executionEnv();
  for (const key of ['CHANJET_READONLY_SYNC_ENABLED', 'JWT_SECRET', 'COMPOSE_FILE', 'DOCKER_CONTEXT']) assert.equal(Object.hasOwn(safe, key), false);
  assert.equal(safe.DOCKER_HOST, 'unix:///var/run/docker.sock');
});
test('image rollback retains current config SHA and exact previous image IDs', () => {
  const state = beginState({ previous, configSha: revision('c'), target: revision('c'), scope: { baseline: previous.api.revision, target: revision('c'), changed: [] }, floor: { floorSha: revision('c') } });
  state.switched.api = true; state.switched.web = true;
  const plan = rollbackPlan(state, { allowed: true });
  assert.deepEqual(plan, [{ service: 'api', ...previous.api }, { service: 'web', ...previous.web }]);
  assert.equal(state.configSha, revision('c')); assert.deepEqual(state.protectedImages, [id('a'), id('b')]);
});
test('failure before any switch does not recreate previous containers', () => {
  const state = beginState({ previous, configSha: revision('c'), target: revision('c'), scope: { baseline: previous.api.revision, target: revision('c'), changed: [] }, floor: { floorSha: revision('c') } });
  assert.deepEqual(rollbackPlan(state, { allowed: false }), []);
});
test('pre-floor API is ineligible and rollback never silently restores it', () => fixture(({ root, legacy, floor }) => {
  const eligibility = rollbackEligibility(root, floor, { imageId: id('a'), revision: legacy }); assert.equal(eligibility.allowed, false);
  const state = { switched: { api: true, web: false }, migrationPaths: [], previous };
  assert.throws(() => rollbackPlan(state, eligibility), /ROLLBACK_API_IMAGE_ALLOWED=NO/);
}));
test('at-floor API satisfies scheduled/manual/bootstrap/direct/inbound source contract', () => fixture(({ root, floor }) => {
  assert.equal(rollbackEligibility(root, floor, { imageId: id('a'), revision: floor.floorSha }).allowed, true);
}));
test('retained newer checkout cannot hide migrations from the older running API baseline', () => fixture(({ root, floor, write, commit }) => {
  write('apps/api/src/database/migrations/9999999999999-Fixture.ts', '// synthetic migration path'); const failedTarget = commit('candidate not installed');
  write('README.md', 'later docs'); const nextTarget = commit('next deployment');
  const scope = migrationScope(root, floor.floorSha, nextTarget);
  assert.equal(scope.baseline, floor.floorSha); assert.ok(scope.changed.includes('apps/api/src/database/migrations/9999999999999-Fixture.ts'));
  assert.deepEqual(migrationScope(root, failedTarget, nextTarget).changed, []); // the old HEAD-only model would miss it
}));
test('non-ancestor and unavailable API commit hold migration scope', () => fixture(({ root, floor, git, write, commit }) => {
  git('switch', '-q', '--orphan', 'other'); write('unrelated', 'x'); const unrelated = commit('different history');
  assert.throws(() => migrationScope(root, unrelated, floor.floorSha), /MIGRATION_SCOPE=HOLD/);
  assert.throws(() => migrationScope(root, revision('f'), floor.floorSha), /MIGRATION_SCOPE=HOLD/);
}));
test('floor rejects missing capabilities, descendants reverting config and pre-floor targets BEFORE ff', () => fixture(({ root, floor, legacy, write, commit, git }) => {
  assertFloor(root, floor); assert.throws(() => assertFloor(root, floor, legacy), /BELOW_FLOOR/);
  write('docker-compose.yml', 'unsafe: reverted'); const unsafe = commit('unsafe descendant');
  git('switch', '-q', '--detach', floor.floorSha);
  assert.throws(() => assertFloor(root, floor, unsafe, { targetTree: true }), /FLOOR_CONTRACT_CHANGED/);
  assert.equal(git('rev-parse', 'HEAD'), floor.floorSha); // no config sync/mutation
}));
test('dirty/untracked/index states all retain hard deployment gate', () => fixture(({ root, write, git }) => {
  requireCleanMain(root); write('unknown.env.bak', 'fake'); assert.throws(() => requireCleanMain(root), /WORKTREE_NOT_CLEAN_MAIN/);
  git('add', 'unknown.env.bak'); assert.throws(() => requireCleanMain(root), /WORKTREE_NOT_CLEAN_MAIN/);
}));
test('wrapper forbids raw config/exec/build/routing/down and requires a single controlled service', () => {
  for (const args of [['config', '--format', 'json'], ['exec', 'db', 'psql'], ['down'], ['up', '--build', 'api'], ['up', '-d'], ['-f', '/tmp/other.yml', 'up']]) assert.throws(() => composeArguments('/data/phoenix-erp', args, 'phoenix-fixture'), /UNSUPPORTED_OPERATION/);
  const args = composeArguments('/data/phoenix-erp', ['up', '-d', '--no-deps', '--wait', 'api'], 'phoenix-fixture'); assert.ok(args.includes('never')); assert.ok(args.includes('--no-build'));
});
test('production config validates simultaneous bind paths and explicit independent hold values', () => {
  const tuple = { PHOENIX_DATA_MOUNT_GUARD: 'true', PHOENIX_PG_DATA_DIR: '/data/test/postgres', PHOENIX_UPLOADS_DIR: '/data/test/uploads', CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' };
  const config = { services: { db: { volumes: [{ type: 'bind', source: tuple.PHOENIX_PG_DATA_DIR, target: '/var/lib/postgresql/data' }] }, api: { environment: { CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' }, volumes: [{ type: 'bind', source: tuple.PHOENIX_UPLOADS_DIR, target: '/app/uploads' }] } } };
  config.services.api.volumes.push({ type: 'bind', source: '/var/lib/phoenix-background-control', target: '/run/phoenix-background-control', read_only: true, bind: { create_host_path: false } });
  validateEffectiveConfig(config, tuple);
  config.services.api.environment.CHANJET_READONLY_SYNC_ENABLED = 'true'; assert.throws(() => validateEffectiveConfig(config, tuple), /CHANJET_POLICY_FLAGS/);
});
test('state replacement persists active image identity at 0600 outside checkout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-state-')); try {
    const file = path.join(dir, 'active.json'); atomicState(file, { configSha: revision('c'), active: previous }, stateIO(dir));
    assert.equal(fs.statSync(file).mode & 0o777, 0o600); assert.deepEqual(JSON.parse(fs.readFileSync(file)).active, previous);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('actual wrapper execution uses exact captured image IDs and strips all inherited overrides', () => {
  let command;
  runCompose(['up', '-d', '--no-deps', '--wait', 'api'], {
    root: '/data/phoenix-erp', directory: '/fixture', readState: () => ({ version: CONTRACT.version, active: previous }), guard: () => ({ project: 'phoenix-fixture', operationalTuple: { CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' } }), capture: () => previous,
    inspect: (id, revision) => ({ imageId: id, revision }), eligibility: () => ({ allowed: true }),
    backgroundMount: () => undefined,
    backgroundFence: () => undefined,
    execute: (binary, args, options) => { command = { binary, args, options }; return Buffer.from('not-forwarded'); },
  });
  assert.equal(command.binary, 'docker'); assert.equal(command.options.env.API_IMAGE, previous.api.imageId); assert.equal(command.options.env.WEB_IMAGE, previous.web.imageId);
  assert.ok(command.args.includes('never')); assert.equal(command.options.env.CHANJET_APP_SECRET, undefined);
});
test('legacy API refuses DB or Web restart too, before any Docker mutation can indirectly resume recovery', () => {
  for (const service of ['api', 'db', 'web']) {
    let mutated = false;
    assert.throws(() => runCompose(['restart', service], {
      root: '/data/phoenix-erp', directory: '/fixture', readState: () => ({ version: CONTRACT.version, active: previous }), guard: () => ({ project: 'phoenix-fixture', operationalTuple: { CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' } }), capture: () => previous,
      inspect: (id, revision) => ({ imageId: id, revision }), eligibility: () => ({ allowed: false }), execute: () => { mutated = true; },
    }), /PRE_FLOOR_API_RECOVERY_HOLD/);
    assert.equal(mutated, false);
  }
});

test('configuration floor high-water anchor cannot move backwards', () => fixture(({ root, legacy, floor }) => {
  assertFloorMonotonic(root, floor.floorSha, floor.floorSha);
  assert.throws(() => assertFloorMonotonic(root, floor.floorSha, legacy), /FLOOR_REGRESSION/);
}));

test('one-time transition verifier proves exact two-line drift and archived backup without recovery or Compose operations', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-transition-')); const root = path.join(parent, 'repo'); fs.mkdirSync(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, bytes) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), bytes); };
  try {
    git('init', '-q', '--initial-branch=main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    const safeCompose = fs.readFileSync('docker-compose.yml', 'utf8');
    const legacyCompose = safeCompose.replace('      CHANJET_READONLY_SYNC_ENABLED: ${CHANJET_READONLY_SYNC_ENABLED:-false}\n', '').replace('      CHANJET_ERP_INBOUND_SYNC_ENABLED: ${CHANJET_ERP_INBOUND_SYNC_ENABLED:-false}\n', '');
    write('docker-compose.yml', legacyCompose); write('.gitignore', '.env\n'); git('add', '.'); git('commit', '-qm', 'legacy'); const previous = git('rev-parse', 'HEAD');
    git('switch', '-qc', 'candidate');
    for (const file of CONTRACT.criticalFiles) write(file, fs.readFileSync(file));
    git('add', '.'); git('commit', '-qm', 'floor candidate'); const target = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/main', target); git('switch', '-q', 'main');
    write('docker-compose.yml', safeCompose);
    const tuple = { PHOENIX_DATA_MOUNT_GUARD: 'true', PHOENIX_PG_DATA_DIR: '/data/test/postgres', PHOENIX_UPLOADS_DIR: '/data/test/uploads', CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' };
    write('.env', Object.entries(tuple).map(([k,v])=>`${k}=${v}`).join('\n')+'\n');
    const backup = path.join(root, '.env.pre-verification-20261005T114700+08:00'); const archive = path.join(parent, 'archive.env');
    fs.writeFileSync(backup, 'synthetic backup', { mode: 0o600 }); fs.writeFileSync(archive, 'synthetic backup', { mode: 0o600 });
    const statusBefore = git('status', '--porcelain', '--untracked-files=all');
    const expectedBackupSha256 = createHash('sha256').update('synthetic backup').digest('hex');
    const args = { root, target, archiveBackup: archive, operationalTuple: tuple, expectedBackupSha256 };
    const dependencies = { readArchive: file => fs.readFileSync(file) };
    const result = verifyTransition(args, dependencies);
    assert.equal(result.compositionEquivalent, true); assert.equal(result.archiveVerified, true); assert.equal(result.recoveryAuthorized, false); assert.equal(result.composeDuringIntermediateStateAllowed, false);
    assert.equal(git('rev-parse', 'HEAD'), previous); assert.equal(git('status', '--porcelain', '--untracked-files=all'), statusBefore);
    fs.writeFileSync(archive, 'different'); assert.throws(()=>verifyTransition(args, dependencies), /BACKUP_HASH/);
    fs.writeFileSync(backup, 'altered historical evidence'); fs.writeFileSync(archive, 'altered historical evidence');
    assert.throws(() => verifyTransition(args, dependencies), /BACKUP_HASH/); // even matching new copies cannot replace the pinned history
    fs.writeFileSync(backup, 'synthetic backup');
    fs.writeFileSync(archive, 'synthetic backup'); write('unknown.env', 'unknown'); assert.throws(()=>verifyTransition(args, dependencies), /UNKNOWN_DIRT/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('an interrupted deployment marker blocks a new run and every nontransaction maintenance caller', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-pending-')); try {
    assert.equal(assertTransactionOwnership(dir, '1'), false);
    atomicState(path.join(dir, 'transaction.json'), { version: CONTRACT.version, runId: '1', phase: 'IN_PROGRESS' }, stateIO(dir));
    assert.equal(assertTransactionOwnership(dir, '1', { readState: file => JSON.parse(fs.readFileSync(file)) }), true);
    assert.throws(() => assertTransactionOwnership(dir, undefined, { readState: file => JSON.parse(fs.readFileSync(file)) }), /UNFINISHED_TRANSACTION/);
    assert.throws(() => assertTransactionOwnership(dir, '2', { readState: file => JSON.parse(fs.readFileSync(file)) }), /UNFINISHED_TRANSACTION/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('actual container identity drift cannot be judged by stale active pins', () => {
  assertRuntimePins(previous, previous);
  const changed = { api: { imageId: id('c'), revision: revision('c') }, web: previous.web };
  assert.throws(() => assertRuntimePins(changed, previous), /ACTIVE_RUNTIME_DRIFT/);
  let mutated = false;
  assert.throws(() => runCompose(['restart', 'api'], {
    root: '/data/phoenix-erp', directory: '/fixture', readState: () => ({ version: CONTRACT.version, active: previous }), guard: () => ({ project: 'phoenix-fixture', operationalTuple: { CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' } }), capture: () => changed,
    inspect: (id, revision) => ({ imageId: id, revision }), eligibility: () => ({ allowed: true }), execute: () => { mutated = true; },
  }), /ACTIVE_RUNTIME_DRIFT/);
  assert.equal(mutated, false);
});

test('first pre-floor forward deployment requires separate opt-in, full mode and exact C3 certificate', () => {
  const bytes = Buffer.from('fixture Compose'); const floor = { floorSha: revision('c') };
  const proof = { version: CONTRACT.version, executionUid: 0, archiveDirectory: CONTRACT.archiveDirectory, target: floor.floorSha, compositionEquivalent: true, archiveVerified: true, composeDuringIntermediateStateAllowed: false, backupSha256: 'a'.repeat(64), composeSha256: createHash('sha256').update(bytes).digest('hex') };
  const args = { legacyApi: true, floor, proof, composeBytes: bytes, mode: 'full', buildApi: true, buildWeb: true, authorized: true, rotateCredentials: false };
  requireFirstTransition(args);
  for (const change of [{ authorized: false }, { mode: 'web' }, { buildApi: false }, { buildWeb: false }, { rotateCredentials: true }, { proof: undefined }, { proof: { ...proof, version: 1 } }, { proof: { ...proof, executionUid: 1002 } }, { proof: { ...proof, archiveDirectory: '/legacy' } }, { composeBytes: Buffer.from('different') }]) assert.throws(() => requireFirstTransition({ ...args, ...change }), /C3_PROOF_REQUIRED/);
});
