/** Real local transition/archive chain; synthetic PG/Docker and owned Node
 * control responder only. This is not live lease/production authority proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { harness, toStopped, now, time, hash } from '../ci/maintenance-transition-fixture.mjs';
import { RootControlLease } from './production-maintenance-root-lease.mjs';
import { collectCandidateLeaseBinding, collectCandidateServerBinding } from './production-maintenance-candidate-binding.mjs';
import { PUBLIC_DIRECTORY, HOLD_KINDS } from './background-control-manifest.mjs';
const json = JSON.stringify, digest = value => createHash('sha256').update(json(value)).digest('hex');
async function phaseFixture() {
  const h = harness(), c = h.candidate, context = h.context;
  c.api.status = 'running'; h.completion = h.evidence('COMPLETION', { ...h.completion.body, api: c.api });
  Object.assign(c.controlSession, { backendStartedAtUs: c.controlSession.backendStartedAt.replace('Z', '456Z'), applicationName: 'phoenix-fence:' + c.bootId,
    cleanup: { acquirePending: false, queriesPending: 0, retirementPending: false, terminationConfirmed: false, releaseConfirmed: false, debt: true } });
  const db = context.preSnapshot.db;
  const database = { containerId: db.id, imageId: db.imageId, containerStartedAt: db.startedAt, postmasterStartedAt: time(-90000).replace('Z', '000Z'), clusterSystemIdentifier: '1234567890123456789', databaseOid: c.controlSession.databaseOid };
  const rootRow = { pid: 4321, databaseOid: database.databaseOid, backendStartedAt: time(-1000).replace('Z', '123Z'), applicationName: 'phoenix-maintenance-control:' + context.owner, backendType: 'client backend' };
  let child, closed = false, locks = [], root, calls = [], hook = () => {}, catalogHook = value => value;
  const metadata = { sampledAt: time(0), databaseOid: database.databaseOid, postmasterStartedAt: database.postmasterStartedAt, clusterSystemIdentifier: database.clusterSystemIdentifier, serverVersionNum: 180000 };
  const rootRun = args => args[0] === 'inspect' ? [db.id, db.imageId, db.startedAt, true, 'healthy'].map(json).join('\t') : json({ ...metadata, statsVisible: true,
    backends: closed ? [] : [rootRow], locks: closed ? [] : locks.map(key => ({ pid: rootRow.pid, databaseOid: database.databaseOid, namespace: 17455, key, keyForm: 2, mode: 'ExclusiveLock', granted: true })) });
  const launch = () => {
    child = spawn(process.execPath, ['-e', "let b='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{b+=s;let n;while((n=b.indexOf('\\n'))>=0){b=b.slice(n+1);process.stdout.write('t\\n')}});"], { stdio: ['pipe', 'pipe', 'pipe'] });
    const write = child.stdin.write.bind(child.stdin);
    child.stdin.write = (sql, ...args) => { if (sql.includes('pg_try_advisory_lock')) locks.push(Number(/17455,(\d)/.exec(sql)[1])); return write(sql, ...args); };
    child.once('close', () => { closed = true; locks = []; }); return child;
  };
  const start = h.adapters.startCandidate;
  h.adapters.startCandidate = async request => {
    root = new RootControlLease({ context, database, approval: h.material.approval, expectedStateDigest: request.state.stateDigest, registerOwnedChild: proc => ({ registered: true, pid: proc.pid }) },
      { store: h.store, guard() {}, admit: async () => true, now: () => now, run: rootRun, spawn: launch });
    await root.acquire(); return start(request);
  };
  try {
    await toStopped(h); await h.engine.reconcile({ evidence: h.reconciliation }); await h.engine.preparePromotion(); await h.engine.replaceCandidate(); await h.engine.startCandidate();
  } catch (error) {
    // Construction itself may fail after acquiring the original owned Node
    // responder. Fixture cleanup is not a production release/drain receipt.
    await root?.close().catch(() => undefined);
    if (child && !closed) {
      assert.equal(child.spawnargs[0], process.execPath);
      await new Promise(resolve => { child.once('close', resolve); child.stdin.end(); });
    }
    throw error;
  }
  const candidateState = h.store.readState();
  const manifest = { protocolVersion: 1, phase: 'FENCED', owner: context.owner, generation: 1, targetSha: context.targetSha, participants: [] };
  const projection = { bootstrap: { schema: 'phoenix.legacy-public-control/v1', contextDigest: h.store.digest, owner: context.owner, previousFloorSha: context.previousFloorSha,
    targetSha: context.targetSha, stateDigest: hash('8'), phase: 'PUBLISHING_LEGACY_FENCE', manifestDigest: digest(manifest), generation: 1, capturedAt: time(-20000) }, modern: null, manifest };
  const status = { protocolVersion: 1, bootId: c.bootId, phase: 'FENCED', owner: context.owner, generation: 1, inFlight: 0, pendingChildren: 0, taskGraphs: 0, poisoned: false, stopping: false, controlSession: c.controlSession };
  const floor = { version: 3, floorSha: context.targetSha, phase: 'READY', chanjetPolicy: 'HOLD', readonlyApproval: null, project: context.replacement.project,
    operationalTuple: { PHOENIX_DATA_MOUNT_GUARD: 'true', PHOENIX_PG_DATA_DIR: '/data/owned-fixture/pg', PHOENIX_UPLOADS_DIR: '/data/owned-fixture/uploads', CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' } };
  const mounts = [{ Type: 'bind', Source: PUBLIC_DIRECTORY, Destination: '/run/phoenix-background-control', RW: false, Propagation: 'rprivate' },
    { Type: 'bind', Source: floor.operationalTuple.PHOENIX_UPLOADS_DIR, Destination: '/app/uploads', RW: true, Propagation: 'rprivate' }];
  const run = (args, input) => {
    calls.push(args); hook(args);
    if (args[0] === 'inspect') {
      if (args[1] === db.id) return rootRun(args);
      assert.equal(args[1], c.api.id);
      return [c.api.id, c.api.imageId, c.api.startedAt, true, 'healthy', c.api.pid, 'running', false, false, 0, context.replacement.project, 'api', mounts,
        false, '', 'private', '', '', 'phoenix-test-network', 'no', 0, 0, 0, null].map(json).join('\t');
    }
    if (args[0] === 'image') return context.targetSha;
    if (args[2] === 'node') { assert.equal(args[1], c.api.id); return json(status); }
    assert.equal(args[2], db.id); assert.ok(input.includes('rootBackends'));
    return json(catalogHook({ ...metadata, statsVisibilityComplete: true, rootBackends: [rootRow], candidateBackends: [{ pid: c.controlSession.sessionPid, databaseOid: database.databaseOid,
      backendStartedAt: c.controlSession.backendStartedAtUs, applicationName: c.controlSession.applicationName, backendType: 'client backend' }],
    rootLocks: locks.map(key => ({ databaseOid: database.databaseOid, namespace: 17455, key, keyForm: 2, mode: 'ExclusiveLock', granted: true })) }));
  };
  const adopt = () => {
    manifest.generation = 2; status.generation = 2; manifest.participants = [{ bootId: c.bootId, containerId: c.api.id, revision: context.targetSha, allowedKinds: [...HOLD_KINDS] }];
    projection.modern = { protocolVersion: 1, owner: context.owner, previousFloorSha: context.previousFloorSha, targetSha: context.targetSha, generation: 2, phase: 'FENCED', manifestDigest: digest(manifest),
      maintenanceContextDigest: h.store.digest, maintenanceStateDigest: candidateState.stateDigest, adoptionEvidenceSha256: hash('d'), updatedAt: time(0) };
  };
  const request = mode => ({ context, expectedStateDigest: h.store.readState().stateDigest, replacementEvidence: h.engine.receipt(h.store.readState(), 'CANDIDATE_REPLACEMENT'), rootLease: root, mode });
  const dependencies = { store: h.store, guard() {}, now: () => now, run, readProjection: () => structuredClone(projection), readFloor: () => structuredClone(floor), inspectStorage() {} };
  return { h, root, request, dependencies, candidateState, projection, status, floor, mounts, calls, adopt,
    hook(fn) { hook = fn; }, catalog(fn) { catalogHook = fn; },
    async verify() { const verify = h.adapters.verifyCandidate; h.adapters.verifyCandidate = async req => { adopt(); return verify(req); }; return h.engine.verifyCandidate(); },
    async close() { await root.close(); assert.equal(closed, true); } };
}
async function using(action) { const f = await phaseFixture(); try { return await action(f); } finally { await f.close(); } }
const hold = /CANDIDATE_BINDING_HOLD=/;
test('steady CF lease observation uses real committed START while the operation collector still rejects no VERIFY intent', () => using(async f => {
  const r = await collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies);
  assert.equal(r.schema, 'phoenix.candidate-lease-binding-observation/v1'); assert.equal(r.stateDigest, f.candidateState.stateDigest);
  assert.equal(r.authorizationCandidateStateDigest, f.candidateState.stateDigest); assert.equal(r.phaseAnchor.replacementStateDigest, f.root.expectedStateDigest);
  assert.equal(r.registryInstalled, false); assert.equal(r.continuousDrainProof, false);
  await assert.rejects(collectCandidateServerBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
}));
test('CF in real VERIFY supports PRE then exact ADOPTED; committed VF keeps the original CF authorization', () => using(async f => {
  const original = f.h.adapters.verifyCandidate;
  f.h.adapters.verifyCandidate = async req => {
    await collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies); f.adopt();
    await collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies); return original(req);
  };
  await f.h.engine.verifyCandidate();
  const r = await collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies);
  assert.equal(r.phaseAnchor.currentPhase, 'VERIFIED_FENCED'); assert.notEqual(r.stateDigest, r.authorizationCandidateStateDigest);
  assert.equal(r.authorizationCandidateStateDigest, f.candidateState.stateDigest);
  await assert.rejects(collectCandidateServerBinding(f.request('ADOPTED'), f.dependencies), hold);
}));
test('actual private OPEN_PENDING reads the original CF anchor and never accepts public OPEN', () => using(async f => {
  await f.verify(); const open = f.h.adapters.openCandidate;
  f.h.adapters.openCandidate = async req => {
    const r = await collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies); assert.equal(r.phaseAnchor.currentStatus, 'OPEN_COMMIT_PENDING');
    f.projection.manifest.phase = 'OPEN'; f.projection.manifest.generation = 3;
    await assert.rejects(collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies), hold);
    throw new Error('OWNED_FIXTURE_OPEN_NOT_PUBLISHED');
  };
  await assert.rejects(f.h.engine.complete({ completionEvidence: f.h.completion }), /OWNED_FIXTURE_OPEN_NOT_PUBLISHED/);
}));
test('an adopted CF without a real VERIFY intent refuses even with matching projection files', () => using(async f => {
  f.adopt(); await assert.rejects(collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies), hold); assert.equal(f.calls.length, 0);
}));
test('VF refuses PRE_ADOPTION and wrong modern CF authorization digest', () => using(async f => {
  await f.verify(); await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
  f.projection.modern.maintenanceStateDigest = f.h.store.readState().stateDigest;
  await assert.rejects(collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies), hold);
}));

test('caller-supplied alternative root digest cannot override the genuine immutable root binding', () => using(async f => {
  const wrong = new RootControlLease({ context: f.h.context, database: f.root.database, approval: f.h.material.approval, expectedStateDigest: hash('e'), registerOwnedChild: () => { throw new Error('MUST_NOT_SPAWN'); } }, { store: f.h.store, guard() {} });
  await assert.rejects(collectCandidateLeaseBinding({ ...f.request('PRE_ADOPTION'), rootLease: wrong, replacementStateDigest: f.root.expectedStateDigest }, f.dependencies), hold);
  assert.equal(f.calls.length, 0);
}));
for (const kind of ['START', 'VERIFY']) test(`changed ${kind} archive during runtime observation invalidates the entire lease snapshot`, () => using(async f => {
  if (kind === 'VERIFY') await f.verify();
  const state = kind === 'START' ? f.candidateState : f.h.store.readState();
  const file = path.join(f.h.directory, `maintenance-intent-${f.h.context.owner}-${state.stateDigest}.json`); let changed = false;
  f.hook(() => {
    if (!changed) { changed = true; const marker = f.h.store.read(file); fs.writeFileSync(file, json({ ...marker, startedAt: time(-1) })); }
  });
  await assert.rejects(collectCandidateLeaseBinding(f.request(kind === 'START' ? 'PRE_ADOPTION' : 'ADOPTED'), f.dependencies), /PHASE_ANCHOR_CHANGED/);
  assert.equal(changed, true);
}));
test('new VERIFY intent with unchanged CF state during observation cannot be mixed into a steady snapshot', () => using(async f => {
  let changed = false; f.hook(() => {
    if (!changed) { changed = true; const state = f.h.store.readState(); f.h.store.beginMarker({ operation: 'VERIFY_CANDIDATE', from: state.phase, to: 'VERIFIED_FENCED', previousStateDigest: state.stateDigest, startedAt: time(0) }); }
  });
  await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), /PHASE_ANCHOR_CHANGED/);
}));
test('OPEN pending refuses PRE, then SUCCESS can no longer provide any fenced lease observation', () => using(async f => {
  await f.verify(); const open = f.h.adapters.openCandidate;
  f.h.adapters.openCandidate = async request => {
    await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
    await assert.rejects(collectCandidateServerBinding(f.request('ADOPTED'), f.dependencies), hold);
    return open(request);
  };
  await f.h.engine.complete({ completionEvidence: f.h.completion });
  await assert.rejects(collectCandidateLeaseBinding(f.request('ADOPTED'), f.dependencies), hold);
}));
test('new collector keeps raw microsecond, database and root-lock checks in the common observation core', () => using(async f => {
  f.catalog(value => ({ ...value, candidateBackends: [{ ...value.candidateBackends[0], backendStartedAt: value.candidateBackends[0].backendStartedAt.replace('456Z', '457Z') }] }));
  await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
  f.catalog(value => ({ ...value, rootLocks: value.rootLocks.slice(0, 1) }));
  await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
}));
test('the new phase path obeys the same single monotonic IO deadline and retains the original lease', () => using(async f => {
  let elapsed = 0; f.dependencies.monotonicNow = () => elapsed; f.hook(() => { elapsed = 11; });
  await assert.rejects(collectCandidateLeaseBinding({ ...f.request('PRE_ADOPTION'), timeoutMs: 10 }, f.dependencies), /DEADLINE_OR_ABORT/);
  assert.equal(f.calls.length, 1);
}));

test('intent change exactly at root-after refuses a mixed phase snapshot', () => using(async f => {
  const original = f.root.run; let catalogs = 0;
  f.root.run = (...args) => {
    const result = original(...args);
    if (args[0][0] === 'exec' && ++catalogs === 2) {
      const state = f.h.store.readState(); f.h.store.beginMarker({ operation: 'VERIFY_CANDIDATE', from: state.phase, to: 'VERIFIED_FENCED', previousStateDigest: state.stateDigest, startedAt: time(0) });
    }
    return result;
  };
  await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), /PHASE_ANCHOR_CHANGED/);
  assert.equal(catalogs, 2);
}));
for (const drift of ['mount', 'storage', 'private']) test(`new lease path retains shared ${drift} drift rejection`, () => using(async f => {
  if (drift === 'mount') f.mounts[0].RW = true;
  if (drift === 'storage') f.floor.operationalTuple.PHOENIX_UPLOADS_DIR = '/var/run/docker.sock';
  if (drift === 'private') f.projection.bootstrap.owner = 'another-owner';
  await assert.rejects(collectCandidateLeaseBinding(f.request('PRE_ADOPTION'), f.dependencies), hold);
}));
