/** Owned Node responder + synthetic Docker/PG/catalog, never production evidence. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { harness, toStopped, now, time, hash } from './maintenance-transition-fixture.mjs';
import { RootControlLease } from '../ops/production-maintenance-root-lease.mjs';
import { PUBLIC_DIRECTORY, HOLD_KINDS } from '../ops/background-control-manifest.mjs';
const json = JSON.stringify, digest = value => createHash('sha256').update(json(value)).digest('hex');
export async function phaseFixture() {
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
      let timer;
      try { await Promise.race([new Promise(resolve => { child.once('close', resolve); child.stdin.end(); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OWNED_RESPONDER_CLOSE_TIMEOUT')), 2000); })]); }
      catch {
        // This exact locally spawned Node responder has no descendants. Never
        // signal arbitrary host processes, containers or production executors.
        clearTimeout(timer);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        await Promise.race([new Promise(resolve => { if (closed) resolve(); else child.once('close', resolve); }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OWNED_RESPONDER_CLEANUP_UNVERIFIED')), 2000); })]);
      } finally { clearTimeout(timer); }
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
