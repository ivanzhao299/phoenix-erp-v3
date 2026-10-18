/** Actual ERP/PG/control correlation with real local receipt archives.
 * Historical replacement/governance are synthetic. Not the full collector,
 * Compose/storage/FD9 proof, production authority or a continuous lease. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fixture, harness, toStopped } from './maintenance-transition-fixture.mjs';
import { settleFixtureRootLease } from './maintenance-erp-root-binding.fixture.mjs';
import { RootControlLease } from '../ops/production-maintenance-root-lease.mjs';
import { collectCandidateDatabaseSnapshot } from '../ops/production-maintenance-candidate-database.mjs';
import { canonicalDigest } from '../ops/production-maintenance-receipts.mjs';

const changedMicrosecond = value => value.slice(0, -2) + (value.at(-2) === '9' ? '8' : String(Number(value.at(-2)) + 1)) + 'Z';
export async function stablePhaseStatus(read, { expected, timeoutMs = 5000 } = {}) {
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 5000);
  const deadline = performance.now() + timeoutMs;
  while (true) {
    assert.ok(performance.now() < deadline, 'ACTUAL_CONTROL_STATUS_DEADLINE');
    const value = read(), c = value.controlSession, debt = c?.cleanup;
    assert.ok(performance.now() < deadline, 'ACTUAL_CONTROL_STATUS_DEADLINE');
    assert.equal(value.phase, 'FENCED'); assert.equal(value.poisoned, false); assert.equal(value.stopping, false);
    for (const key of ['inFlight', 'pendingChildren', 'taskGraphs']) assert.equal(value[key], 0);
    assert.equal(c.connected, true); assert.equal(c.broken, false);
    for (const key of ['acquirePending', 'retirementPending', 'terminationConfirmed', 'releaseConfirmed']) assert.equal(debt[key], false);
    assert.equal(debt.debt, true); assert.ok(Number.isSafeInteger(debt.queriesPending) && debt.queriesPending >= 0);
    if (expected) {
      for (const key of ['bootId', 'owner', 'generation']) assert.equal(value[key], expected[key]);
      for (const key of ['sessionPid', 'databaseOid', 'backendStartedAt', 'backendStartedAtUs', 'applicationName']) assert.equal(c[key], expected.controlSession[key]);
    }
    if (debt.queriesPending === 0) {
      if (expected) assert.deepEqual(value, expected); // No field is hidden from the accepted comparison.
      return value;
    }
    assert.ok(performance.now() < deadline, 'ACTUAL_CONTROL_PROBE_DID_NOT_SETTLE');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
export function archiveOwnedPhaseStore(directory, target) {
  const root = fs.lstatSync(directory);
  assert.ok(root.isDirectory() && !root.isSymbolicLink()); assert.equal(root.uid, process.getuid()); assert.equal(root.mode & 0o777, 0o700);
  fs.mkdirSync(target, { mode: 0o700 }); const files = [];
  for (const name of fs.readdirSync(directory).sort()) {
    assert.match(name, /^maintenance-[a-z0-9-]+\.json$/);
    const file = path.join(directory, name), before = fs.lstatSync(file);
    assert.ok(before.isFile() && !before.isSymbolicLink()); assert.equal(before.uid, process.getuid());
    assert.equal(before.nlink, 1); assert.equal(before.mode & 0o777, 0o600);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let raw;
    try { assert.equal(fs.fstatSync(fd).ino, before.ino); raw = fs.readFileSync(fd); assert.equal(fs.fstatSync(fd).size, raw.length); }
    finally { fs.closeSync(fd); }
    fs.writeFileSync(path.join(target, name), raw, { mode: 0o600, flag: 'wx' });
    files.push({ name, size: raw.length, sha256: createHash('sha256').update(raw).digest('hex') });
  }
  assert.ok(files.length > 0);
  const manifest = { fixtureOnly: true, productionReceipt: false, governanceAndHistoricalPre: 'SYNTHETIC_TEST_ONLY', files };
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return { directory: path.basename(target), ...manifest };
}
export function actualPhaseMaterials({ owner, sourceSha, imageId, runtime, status, dbRuntime, database, clock = Date.now }) {
  assert.match(owner, /^[0-9]{1,20}-[0-9]{1,10}$/);
  assert.equal(status.owner, owner); assert.equal(status.phase, 'FENCED');
  assert.equal(runtime.Image, imageId); assert.equal(runtime.Config.Labels['org.opencontainers.image.revision'], sourceSha);
  assert.equal(runtime.State.Health.Status, 'healthy'); assert.equal(dbRuntime.State.Health.Status, 'healthy');
  assert.equal(runtime.State.Status, 'running');
  const f = fixture({ clock }), context = structuredClone(f.context), web = context.preSnapshot.web;
  context.owner = owner; context.targetSha = sourceSha; context.candidate = { revision: sourceSha, imageId };
  context.preSnapshot.db = { id: dbRuntime.Id, imageId: dbRuntime.Image, startedAt: dbRuntime.State.StartedAt, restartCount: dbRuntime.RestartCount,
    running: dbRuntime.State.Running, health: dbRuntime.State.Health.Status, mountsSha256: canonicalDigest(dbRuntime.Mounts) };
  assert.equal(context.preSnapshot.db.id, database.containerId);
  assert.equal(context.preSnapshot.db.imageId, database.imageId);
  assert.equal(context.preSnapshot.db.startedAt, database.containerStartedAt);
  const candidate = { api: { id: runtime.Id, imageId, revision: sourceSha, startedAt: runtime.State.StartedAt, restartCount: runtime.RestartCount,
    running: runtime.State.Running, status: runtime.State.Status, health: runtime.State.Health.Status, pid: runtime.State.Pid, restarting: runtime.State.Restarting, dead: runtime.State.Dead },
    bootId: status.bootId, owner, admissionState: 'DENIED', inFlight: status.inFlight, pendingChildren: status.pendingChildren, taskGraphs: status.taskGraphs,
    poisoned: status.poisoned, stopping: status.stopping, controlSession: structuredClone(status.controlSession),
    chanjetPolicy: 'HOLD', readonlySync: false, inboundSync: false, web, db: context.preSnapshot.db };
  // Generate every approval, recovery and transition digest only after the
  // final real identities and real clock are known. All remain TEST authority.
  return fixture({ clock, context, candidate });
}

export async function exerciseActualErpPhaseCorrelation(capsule, candidate) {
  assert.equal(candidate.mode, 'FENCED'); assert.match(capsule.owner, /^[0-9]{1,20}-[0-9]{1,10}$/);
  const pg = candidate.pg, cases = [], observations = [], children = [];
  const runtime = capsule.inspectContainer(candidate.id), dbRuntime = capsule.inspectContainer(pg.id), status = await stablePhaseStatus(() => capsule.status(candidate));
  capsule.verifySession(candidate, status);
  const database = { containerId: pg.id, imageId: dbRuntime.Image, containerStartedAt: dbRuntime.State.StartedAt,
    ...JSON.parse(capsule.sql(pg, `SELECT json_build_object('databaseOid',(SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=current_database()),
      'postmasterStartedAt',to_char(pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()));`)) };
  const beforeData = capsule.fingerprint(pg);
  const materials = actualPhaseMaterials({ owner: capsule.owner, sourceSha: capsule.sourceSha, imageId: capsule.imageId, runtime, status, dbRuntime, database });
  const h = harness(materials, { now: Date.now }), context = h.context;
  const guard = () => {
    for (const id of [pg.id, candidate.id]) {
      assert.ok(capsule.resources.some(r => r.id === id && r.type === 'container'));
      // Initial inspectContainer above verifies immutable owner labels. Fixed
      // full IDs cannot be reused. Each actual PG observer independently pins
      // DB ID/image/StartedAt before and after I/O; do not add slow Docker
      // subprocesses to every trusted-path checkpoint in this fixture guard.
    }
  };
  const run = (args, input, { timeoutMs = 10000 } = {}) => {
    guard(); assert.ok((args[0] === 'inspect' && args[1] === pg.id) || (args[0] === 'exec' && args[1] === '-i' && args[2] === pg.id));
    return capsule.docker(args, { input, timeout: Math.min(timeoutMs, 10000), maxBuffer: 65536 });
  };
  let lease, binding, initialRoot, candidateDigest, cleanup;
  const transportStages = [];
  const start = h.adapters.startCandidate;
  h.adapters.startCandidate = async request => {
    lease = new RootControlLease({ context, approval: h.material.approval, expectedStateDigest: request.state.stateDigest, database,
      registerOwnedChild(child) {
        const owned = { child, closed: false }; owned.done = new Promise(resolve => child.once('close', () => { owned.closed = true; resolve(); }));
        children.push(owned); return { registered: true, pid: child.pid };
      } }, { store: h.store, guard, run, now: Date.now, admit: async () => true });
    // Fixed stage/error codes only, never raw database stderr or connection data.
    for (const name of ['start', 'query']) {
      const original = lease.session[name].bind(lease.session);
      lease.session[name] = async (...args) => {
        transportStages.push({ method: name, state: 'ENTERED' });
        try { const value = await original(...args); transportStages.push({ method: name, state: 'SETTLED' }); return value; }
        catch { transportStages.push({ method: name, state: 'FAILED', code: lease.session.errorCode }); throw Error('OWNED_PHASE_CONTROL_TRANSPORT_FAILED'); }
      };
    }
    await lease.acquire(); return start(request);
  };
  const observe = async label => {
    const state = h.store.readState();
    const anchor = h.store.readCandidateLeasePhaseAnchor({ expectedStateDigest: state.stateDigest, replacementStateDigest: lease.expectedStateDigest });
    const rootBefore = await lease.observe(), apiBefore = await stablePhaseStatus(() => capsule.status(candidate), { expected: status });
    capsule.verifySession(candidate, apiBefore); assert.deepEqual(apiBefore, status);
    const root = rootBefore.observation.backends[0];
    initialRoot ??= structuredClone(root); assert.deepEqual(root, initialRoot);
    binding ??= { owner: context.owner, previousFloorSha: context.previousFloorSha, targetSha: context.targetSha, database,
      root: { sessionPid: root.pid, backendStartedAt: root.backendStartedAt },
      candidate: { sessionPid: status.controlSession.sessionPid, backendStartedAt: status.controlSession.backendStartedAtUs, bootId: status.bootId } };
    const catalog = collectCandidateDatabaseSnapshot(binding, {}, { guard, run });
    assert.deepEqual(await stablePhaseStatus(() => capsule.status(candidate), { expected: apiBefore }), apiBefore);
    const rootAfter = await lease.observe(); assert.deepEqual(rootAfter.observation.backends, rootBefore.observation.backends);
    assert.deepEqual(rootAfter.observation.locks, rootBefore.observation.locks);
    assert.deepEqual(h.store.readCandidateLeasePhaseAnchor({ expectedStateDigest: state.stateDigest, replacementStateDigest: lease.expectedStateDigest }), anchor);
    candidateDigest ??= anchor.candidateStateDigest; assert.equal(anchor.candidateStateDigest, candidateDigest);
    assert.equal(capsule.request(candidate, '/api/auth/login', { method: 'POST', body: {} }).status, 503);
    observations.push({ label, actualStateDigest: state.stateDigest, anchor, catalog, rootBefore, rootAfter, api: apiBefore, originalChildPid: children[0].child.pid });
    cases.push(label);
  };
  let failure, phaseArchive;
  try {
    await toStopped(h); await h.engine.reconcile({ evidence: h.reconciliation }); await h.engine.preparePromotion(); await h.engine.replaceCandidate(); await h.engine.startCandidate();
    await observe('CF_STEADY_REAL_START_ARCHIVE');
    await assert.rejects(lease.acquire(), /ATTEMPT_REUSE/);
    const bad = structuredClone(binding); bad.candidate.backendStartedAt = changedMicrosecond(bad.candidate.backendStartedAt);
    assert.throws(() => collectCandidateDatabaseSnapshot(bad, {}, { guard, run }), /BACKEND_IDENTITY_CHANGED/); cases.push('ACTUAL_PG_MICROSECOND_MISMATCH_REFUSED');
    const verify = h.adapters.verifyCandidate;
    h.adapters.verifyCandidate = async request => { await observe('CF_ACTUAL_VERIFY_INTENT'); return verify(request); };
    await h.engine.verifyCandidate(); await observe('VF_COMMITTED_ORIGINAL_CF_ANCHOR');
    assert.notEqual(h.store.readState().stateDigest, candidateDigest);
    const open = h.adapters.openCandidate;
    h.adapters.openCandidate = async request => { await observe('ACTUAL_PRIVATE_OPEN_PENDING'); return open(request); };
    await h.engine.complete({ completionEvidence: h.completion });
    assert.throws(() => h.store.readCandidateLeasePhaseAnchor({ expectedStateDigest: h.store.readState().stateDigest, replacementStateDigest: lease.expectedStateDigest }));
    assert.equal(capsule.status(candidate).phase, 'FENCED'); cases.push('LOCAL_SUCCESS_REFUSES_ANCHOR_REAL_PUBLIC_STAYS_FENCED');
    const released = await lease.close(); assert.equal(released.ownedBackendGone, true);
    const absent = collectCandidateDatabaseSnapshot(binding, { expectRoot: 'RELEASED' }, { guard, run });
    assert.equal(absent.observation.rootBackends.length, 0); assert.equal(absent.observation.rootLocks.length, 0);
    assert.equal(absent.observation.candidateBackends[0].pid, status.controlSession.sessionPid);
    assert.throws(() => collectCandidateDatabaseSnapshot(binding, {}, { guard, run }), /ROOT_BACKEND_NOT_UNIQUE/);
    cases.push('ORIGINAL_ROOT_RELEASED_ACTUAL_ERP_CONTROL_SURVIVES');
    assert.deepEqual(capsule.fingerprint(pg), beforeData);
  } catch (error) { failure = error; }
  finally {
    if (lease) cleanup = await settleFixtureRootLease(lease, children);
    try { phaseArchive = archiveOwnedPhaseStore(h.directory, path.join(capsule.root, `pg${pg.major}-phase-chain`)); }
    catch { failure ||= Error('ACTUAL_PHASE_ARCHIVE_UNVERIFIED'); }
  }
  const result = { schema: 'phoenix.actual-erp-phase-correlation-fixture/v1', result: failure || cleanup?.failures.length ? 'FAIL' : 'PASS',
    fixtureOnly: true, productionReceipt: false, owner: context.owner, pgMajor: pg.major, sourceSha: capsule.sourceSha, actualRuntime: { id: runtime.Id, imageId: runtime.Image, startedAt: runtime.State.StartedAt, pid: runtime.State.Pid, health: runtime.State.Health.Status, revision: capsule.sourceSha },
    actualDatabase: database, cases, observations, cleanup, phaseArchive, transportStages,
    scope: { actualErpControlBackend: true, actualOriginalRootChild: true, actualPgCatalog: true, actualReceiptStoreAndPhaseArchives: true,
      fullCandidateLeaseCollectorPositive: 'NOT_RUN', composeRuntimeContract: 'NOT_RUN', productionStorageAndFd9: 'NOT_RUN',
      governanceAndHistoricalPre: 'SYNTHETIC_TEST_ONLY', continuousIngressProof: false, registryInstalled: false } };
  fs.writeFileSync(path.join(capsule.root, `pg${pg.major}-actual-erp-phase-correlation.json`), JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  if (failure) throw failure;
  assert.equal(result.result, 'PASS'); return result;
}
