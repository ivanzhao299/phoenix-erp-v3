import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { CONTRACT } from './production-config-guard.mjs';
import { MODE_EVIDENCE_SCHEMA } from './production-deployment-evidence.mjs';
import { INCIDENT, restoreWebBaseline } from './production-web-baseline-restoration.mjs';

const target = 'd'.repeat(40);
const restoreOwner = '45570000001-1';
const resumeOwner = '45570000002-1';
const fallbackOwner = '45570000003-1';
const baseTime = Date.parse('2026-11-25T08:00:00.000Z');
const iso = millis => new Date(baseTime + millis).toISOString();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const image = letter => 'sha256:' + letter.repeat(64);
const apiPin = { imageId: image('a'), revision: INCIDENT.apiRevision };
const previousPin = { imageId: image('b'), revision: INCIDENT.apiRevision };
const hotfixPin = { imageId: image('c'), revision: INCIDENT.webRevision };
const paired = { api: apiPin, web: previousPin };
const split = { api: apiPin, web: hotfixPin };
const privateName = 'web-baseline-restoration-45559680114-1.json';

function metadata(service, letter, selected, millis) {
  return {
    service, container: 'phoenix-v3-' + service, id: letter.repeat(64), image: selected.imageId, ociRevision: selected.revision,
    created: iso(millis), startedAt: iso(millis), restartCount: 0, health: 'healthy', running: true, mounts: [],
  };
}

function fixture() {
  let time = 250;
  let mutations = 0;
  let runtime = {
    api: metadata('api', 'a', apiPin, 0),
    web: metadata('web', 'b', previousPin, 0),
    db: metadata('db', 'd', { imageId: image('d'), revision: null }, 0),
  };
  const database = new Map();
  const clone = structuredClone;
  const key = file => path.basename(file);
  const read = file => {
    assert.ok(database.has(key(file)), 'fixture record exists: ' + key(file));
    return clone(database.get(key(file)));
  };
  const write = (file, value) => database.set(key(file), clone(value));
  const getSnapshot = ({ phase, runId, runAttempt, targetSha, floorSha, deployMode }) => ({
    schema: MODE_EVIDENCE_SCHEMA, phase, deployRunId: runId, deployRunAttempt: runAttempt, targetSha,
    configFloorSha: floorSha, deployMode, capturedAt: iso(++time), containers: clone(runtime),
  });
  function record(owner, mode, revision, before, after, previous, active) {
    const files = Object.fromEntries([['pre', 'pre'], ['post', 'post'], ['log', 'startup']]
      .map(([name, suffix]) => [name, path.join(CONTRACT.stateDirectory, `deploy-${owner}-${suffix}-evidence.json`)]));
    const snapshotArgs = { runId: owner, runAttempt: 1, targetSha: revision, floorSha: INCIDENT.floor, deployMode: mode };
    write(files.pre, { ...getSnapshot({ ...snapshotArgs, phase: 'PRE_SNAPSHOT' }), containers: before });
    write(files.post, { ...getSnapshot({ ...snapshotArgs, phase: 'POST_SNAPSHOT' }), containers: after });
    write(files.log, {});
    write(`deploy-${owner}.json`, {
      version: CONTRACT.version, outcome: 'SUCCESS', deployMode: mode, target: revision, configSha: revision, floorSha: INCIDENT.floor,
      migrationBaseline: INCIDENT.apiRevision, migrationPaths: [], evidence: files, previous, active, switched: { api: mode === 'full', web: true },
    });
  }
  const fullRuntime = clone(runtime);
  record(INCIDENT.fullOwner, 'full', INCIDENT.apiRevision, fullRuntime, fullRuntime, paired, paired);
  runtime = { ...runtime, web: metadata('web', 'c', hotfixPin, ++time) };
  record(INCIDENT.webOwner, 'web', INCIDENT.webRevision, fullRuntime, runtime, paired, split);
  write('active.json', { version: CONTRACT.version, floorSha: INCIDENT.floor, active: split, outcome: 'SUCCESS',
    configSha: INCIDENT.webRevision, migrationBaseline: INCIDENT.apiRevision });
  write('floor.json', { version: CONTRACT.version, phase: 'READY', floorSha: INCIDENT.floor,
    chanjetPolicy: 'HOLD', readonlyApproval: null, project: 'phoenix-test' });
  const participant = { containerId: runtime.api.id, revision: INCIDENT.apiRevision, bootId: 'same-boot' };
  const manifest = { phase: 'OPEN', owner: INCIDENT.fullOwner, generation: INCIDENT.openGeneration,
    targetSha: INCIDENT.apiRevision, participants: [participant] };
  const privateRecord = { ...manifest, manifestDigest: hash(manifest) };
  const mocks = {
    read, write, exists: file => database.has(key(file)), now: () => baseTime + ++time,
    context() {}, activeGuard() {}, floorGuard() {}, admission() {}, cleanMain() {}, latestMain() {}, gitRead() {},
    scope: () => ({ changed: [] }), privateControl: () => privateRecord, publicControl: () => manifest,
    inventory: () => [runtime.api.id], snapshot: getSnapshot, candidate: (id, revision) => ({ imageId: id, revision }),
    inspectParticipant: () => ({ ...participant, imageId: apiPin.imageId, startedAt: runtime.api.startedAt, restartCount: 0,
      status: { protocolVersion: 1, ...manifest, bootId: participant.bootId, poisoned: false, stopping: false, inFlight: 0,
        pendingChildren: 0, taskGraphs: 0, controlSession: {
          sessionPid: 100, databaseOid: 999, backendStartedAt: iso(1), connected: true, broken: false,
        } } }),
    evidenceFiles(pre, post, logs, binding) {
      const { targetSha, deployMode, runId } = binding;
      for (const file of [pre, post]) {
        const snap = read(file);
        assert.equal(snap.targetSha, targetSha);
        assert.equal(snap.deployMode, deployMode);
        assert.equal(snap.deployRunId, runId);
      }
      assert.ok(read(logs));
    },
    liveSnapshot: post => assert.deepEqual(post.containers, runtime),
    http() {},
    logs({ startedAt }) { return { stdout: startedAt + ' Ready in 72ms', stderr: '' }; },
    compose(args) {
      assert.deepEqual(args, ['up', '-d', '--no-deps', '--wait', 'web']);
      const marker = read('transaction.json'), state = read(`deploy-${marker.runId}.json`);
      assert.deepEqual(state.switched, { api: false, web: true });
      assert.deepEqual(state.active.api, apiPin);
      assert.deepEqual(state.migrationPaths, []);
      ++mutations;
      runtime = { ...runtime, web: metadata('web', mutations === 1 ? 'e' : 'f', state.active.web, ++time) };
    },
    unlink(file) { assert.ok(database.delete(key(file))); },
    stateOperation(root, owner, revision, operation, service) {
      assert.equal(root, CONTRACT.repository);
      const file = `deploy-${owner}.json`;
      const state = read(file);
      assert.equal(revision, state.target);
      if (operation === 'rollback-pin') {
        assert.equal(service, 'web');
        write(file, { ...state, active: state.previous, outcome: 'ROLLING_BACK' });
        return;
      }
      assert.ok(['complete', 'rolled-back'].includes(operation));
      const outcome = operation === 'complete' ? 'SUCCESS' : 'ROLLED_BACK';
      write('active.json', { version: state.version, configSha: state.configSha, floorSha: state.floorSha, outcome,
        active: state.active, migrationBaseline: state.migrationBaseline });
      write(file, { ...state, outcome });
      database.delete('transaction.json');
    },
  };
  return { mocks, read, write, database, manifest, privateRecord, mutations: () => mutations, moveApi: () => {
    runtime.api.startedAt = iso(++time);
  } };
}

function run(f, phase, workflowOwner = restoreOwner, originalOwner) {
  return restoreWebBaseline({ phase, target, workflowOwner, resumeOwner: originalOwner }, f.mocks);
}

test('read-only preflight, exact Web restore, and fallback only to the original hotfix', () => {
  const f = fixture();
  const size = f.database.size;
  assert.equal(run(f, 'preflight').restoredWeb, INCIDENT.apiRevision);
  assert.equal(f.database.size, size);
  assert.equal(f.mutations(), 0);
  const restored = run(f, 'restore');
  assert.equal(restored.web, INCIDENT.apiRevision);
  assert.ok(Date.parse(restored.continueBy) > baseTime);
  assert.deepEqual(f.read('active.json').active, paired);
  assert.equal(f.database.has('transaction.json'), false);
  assert.equal(f.mutations(), 1);
  assert.throws(() => run(f, 'restore', resumeOwner), /JOURNAL_OR_TRANSACTION_BINDING/);
  assert.equal(run(f, 'fallback', fallbackOwner).web, INCIDENT.webRevision);
  assert.deepEqual(f.read('active.json').active, split);
  assert.equal(f.mutations(), 2);
  assert.throws(() => run(f, 'fallback', resumeOwner), /JOURNAL_OR_TRANSACTION_BINDING/);
});

test('third-party transaction, manifest drift, source identity drift and wrong image fail before switch', () => {
  const foreign = fixture();
  foreign.write('transaction.json', { version: CONTRACT.version, runId: '45569999999-1', phase: 'IN_PROGRESS' });
  assert.throws(() => run(foreign, 'restore'), /JOURNAL_OR_TRANSACTION_BINDING/);
  const changed = fixture();
  changed.manifest.generation++;
  assert.throws(() => run(changed, 'restore'), /OPEN_BINDING/);
  const moved = fixture();
  moved.moveApi();
  assert.throws(() => run(moved, 'restore'), /CURRENT_PRE_DRIFT/);
  const unmatched = fixture();
  unmatched.mocks.candidate = (id, revision) => ({ imageId: image('f'), revision });
  assert.throws(() => run(unmatched, 'restore'), /IMMUTABLE_IMAGE/);
  for (const f of [foreign, changed, moved, unmatched]) assert.equal(f.mutations(), 0);
});

test('resume observes an already switched Web after a lost Compose result without a new mutation', () => {
  const f = fixture();
  const perform = f.mocks.compose;
  f.mocks.compose = args => { perform(args); throw Error('SIMULATED_LOST_RESULT'); };
  assert.throws(() => run(f, 'restore'), /SIMULATED_LOST_RESULT/);
  assert.equal(f.read(privateName).pending.owner, restoreOwner);
  assert.equal(f.read('transaction.json').runId, restoreOwner);
  assert.equal(run(f, 'resume', resumeOwner, restoreOwner).web, INCIDENT.apiRevision);
  assert.equal(f.mutations(), 1);
});

test('resume finalizes journal after the canonical state commit without re-running Compose', () => {
  const f = fixture();
  const complete = f.mocks.stateOperation;
  f.mocks.stateOperation = (...args) => { complete(...args); throw Error('SIMULATED_LOST_COMPLETE_RESULT'); };
  assert.throws(() => run(f, 'restore'), /SIMULATED_LOST_COMPLETE_RESULT/);
  assert.deepEqual(f.read('active.json').active, paired);
  assert.equal(f.database.has('transaction.json'), false);
  assert.equal(run(f, 'resume', resumeOwner, restoreOwner).web, INCIDENT.apiRevision);
  assert.equal(f.mutations(), 1);
});

test('fallback refuses the old incident after an ordinary full-release fence takes ownership', () => {
  const f = fixture();
  run(f, 'restore');
  f.privateRecord.phase = 'FENCED';
  f.manifest.phase = 'FENCED';
  assert.throws(() => run(f, 'fallback', fallbackOwner), /OPEN_BINDING/);
  assert.equal(f.mutations(), 1);
});

test('aborting before Web replacement closes only the incident marker and preserves prior SUCCESS', () => {
  const f = fixture();
  const perform = f.mocks.compose;
  f.mocks.compose = () => { throw Error('SIMULATED_COMPOSE_REFUSAL'); };
  assert.throws(() => run(f, 'restore'), /SIMULATED_COMPOSE_REFUSAL/);
  assert.ok(f.database.has('transaction.json'));
  assert.equal(run(f, 'abort', resumeOwner, restoreOwner).phase, 'aborted');
  assert.equal(f.database.has('transaction.json'), false);
  assert.deepEqual(f.read('active.json').active, split);
  assert.equal(f.read('active.json').outcome, 'SUCCESS');
  assert.equal(f.mutations(), 0);
  f.mocks.compose = perform;
  assert.equal(run(f, 'restore', fallbackOwner).phase, 'restore');
  assert.equal(f.mutations(), 1);
});

test('aborting after replacement returns the exact original Web image and retains an explicit HOLD', () => {
  const f = fixture();
  const perform = f.mocks.compose;
  f.mocks.compose = args => { perform(args); throw Error('SIMULATED_UNHEALTHY_WEB'); };
  assert.throws(() => run(f, 'restore'), /SIMULATED_UNHEALTHY_WEB/);
  f.mocks.compose = perform;
  f.mocks.latestMain = () => { throw Error('ORIGIN_MOVED'); };
  assert.equal(run(f, 'abort', resumeOwner, restoreOwner).phase, 'rolled-back-hold');
  assert.equal(f.database.has('transaction.json'), false);
  assert.deepEqual(f.read('active.json').active, split);
  assert.equal(f.read('active.json').outcome, 'ROLLED_BACK');
  assert.equal(f.mutations(), 2);
  assert.equal(f.read(privateName).heldRollback, restoreOwner);
  assert.equal(f.database.has(`deploy-${restoreOwner}-startup-evidence.json`), false);
});

test('uncommitted proof is never discoverable as a new complete formal triplet', () => {
  const f = fixture();
  const operation = f.mocks.stateOperation;
  f.mocks.stateOperation = () => { throw Error('SIMULATED_FAILED_COMMIT'); };
  assert.throws(() => run(f, 'restore'), /SIMULATED_FAILED_COMMIT/);
  assert.equal(f.database.has(`web-baseline-${restoreOwner}-startup-evidence.json`), true);
  assert.equal(f.database.has(`deploy-${restoreOwner}-startup-evidence.json`), false);
  f.mocks.stateOperation = operation;
  assert.equal(run(f, 'resume', resumeOwner, restoreOwner).phase, 'restore');
  assert.equal(f.database.has(`deploy-${restoreOwner}-startup-evidence.json`), true);
});

test('remote main drift immediately before staging leaves no deployment owner', () => {
  const f = fixture();
  let calls = 0;
  f.mocks.latestMain = () => { if (++calls > 1) throw Error('ORIGIN_MOVED'); };
  assert.throws(() => run(f, 'restore'), /ORIGIN_MOVED/);
  assert.equal(f.database.has('transaction.json'), false);
  assert.equal(f.database.has(privateName), false);
  assert.equal(f.mutations(), 0);
});
