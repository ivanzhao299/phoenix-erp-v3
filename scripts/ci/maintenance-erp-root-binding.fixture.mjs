/** Actual source-built ERP + original root client + independent PG catalog.
 * Store/authority/history are explicitly synthetic. This is not the full
 * candidate-server observer, production storage proof or a release receipt. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RootControlLease } from '../ops/production-maintenance-root-lease.mjs';
import { collectCandidateDatabaseSnapshot } from '../ops/production-maintenance-candidate-database.mjs';
import { bindingDigest } from '../ops/production-maintenance-receipts.mjs';
import { rootLeaseFixture } from './maintenance-root-lease-fixture.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const changedMicrosecond = value => value.slice(0, -2) + (Number(value.at(-2)) === 9 ? 8 : Number(value.at(-2)) + 1) + 'Z';
async function bounded(work, ms) {
  let timer;
  try { return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('OWNED_ROOT_CHILD_NOT_SETTLED')), ms); })]); }
  finally { clearTimeout(timer); }
}

/** Local process settlement is separate from server release. Even a failed
 * close/guard must not skip ownership cleanup of the registered original child. */
export async function settleFixtureRootLease(lease, children, { timeoutMs = 3000 } = {}) {
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 3000);
  const failures = []; let serverReleaseVerified = false;
  try { serverReleaseVerified = (await lease.close()).ownedBackendGone === true; }
  catch { failures.push('ROOT_SERVER_RELEASE_UNVERIFIED'); }
  if (!serverReleaseVerified && !failures.length) failures.push('ROOT_SERVER_RELEASE_UNVERIFIED');
  for (const owned of children) {
    if (!owned.closed) {
      try { owned.child.stdin.end(); } catch { /* Still wait for the original close event. */ }
      try { await bounded(owned.done, timeoutMs); }
      catch {
        failures.push('ORIGINAL_CHILD_EOF_NOT_SETTLED');
        try { owned.child.kill('SIGTERM'); } catch { /* A local signal grants no server proof. */ }
        try { await bounded(owned.done, timeoutMs); } catch { failures.push('ORIGINAL_CHILD_CLOSE_UNVERIFIED'); }
      }
    }
    if (!owned.closed && !failures.includes('ORIGINAL_CHILD_CLOSE_UNVERIFIED')) failures.push('ORIGINAL_CHILD_CLOSE_UNVERIFIED');
  }
  if (children.length !== 1) failures.push('EXACT_ORIGINAL_CHILD_COUNT_UNVERIFIED');
  return { serverReleaseVerified, originalChildren: children.length, originalChildrenClosed: children.every(item => item.closed), failures };
}

export function persistRootBindingFailure(capsule, major, cleanup, children) {
  assert.ok([16, 18].includes(major));
  const file = path.join(capsule.root, `pg${major}-actual-erp-root-binding.json`);
  fs.writeFileSync(file, JSON.stringify({ schema: 'phoenix.actual-erp-root-binding-fixture/v1', result: 'FAIL', fixtureOnly: true,
    productionReceipt: false, sourceSha: capsule.sourceSha, pgMajor: major, cleanup,
    originalChildren: children.map(owned => ({ pid: owned.child.pid ?? null, closeEventObserved: owned.closed })) }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return file;
}

export async function exerciseActualErpRootBinding(capsule, candidate) {
  assert.equal(candidate.mode, 'FENCED');
  const pg = candidate.pg, cases = [], observations = [], children = [];
  const runtime = capsule.inspectContainer(candidate.id), dbRuntime = capsule.inspectContainer(pg.id);
  assert.equal(runtime.State.Running, true); assert.equal(dbRuntime.State.Health.Status, 'healthy');
  const database = { containerId: pg.id, imageId: dbRuntime.Image, containerStartedAt: dbRuntime.State.StartedAt,
    ...JSON.parse(capsule.sql(pg, `SELECT json_build_object('databaseOid',(SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=current_database()),
      'postmasterStartedAt',to_char(pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()));`)) };
  const f = rootLeaseFixture({ database, owner: `${Date.now()}-${pg.major}` });
  // Only the candidate source/image and database identities are real. The
  // fabricated historical PRE and approval never become production authority.
  f.context.targetSha = capsule.sourceSha;
  f.context.candidate = { revision: capsule.sourceSha, imageId: capsule.imageId };
  f.state.contextDigest = bindingDigest(f.context);
  // Initial inspect checks immutable ownership labels. Each real observer pins
  // the exact DB runtime again; no production trusted-path/FD9 guard is claimed.
  const guard = () => {
    for (const id of [pg.id, candidate.id]) assert.ok(capsule.resources.some(resource => resource.id === id && resource.type === 'container'));
  };
  const run = (args, input, { timeoutMs = 10000 } = {}) => {
    guard();
    assert.ok((args[0] === 'inspect' && args[1] === pg.id) || (args[0] === 'exec' && args[1] === '-i' && args[2] === pg.id));
    return capsule.docker(args, { input, timeout: Math.min(timeoutMs, 10000), maxBuffer: 65536 });
  };
  const lease = new RootControlLease({ ...f.options, registerOwnedChild(child) {
    const owned = { child, closed: false };
    owned.done = new Promise(resolve => child.once('close', () => { owned.closed = true; resolve(); }));
    children.push(owned); return { registered: true, pid: child.pid };
  } }, { ...f.dependencies, guard, run, now: Date.now });
  let release;
  try {
    await lease.acquire();
    const rootBefore = await lease.observe(), status = capsule.status(candidate);
    capsule.verifySession(candidate, status);
    assert.equal(status.phase, 'FENCED'); assert.equal(status.poisoned, false);
    assert.equal(status.inFlight, 0); assert.equal(status.pendingChildren, 0); assert.equal(status.taskGraphs, 0);
    const root = rootBefore.observation.backends[0], control = status.controlSession;
    const binding = { owner: f.context.owner, previousFloorSha: f.context.previousFloorSha, targetSha: capsule.sourceSha, database,
      root: { sessionPid: root.pid, backendStartedAt: root.backendStartedAt },
      candidate: { sessionPid: control.sessionPid, backendStartedAt: control.backendStartedAtUs, bootId: status.bootId } };
    const collect = (b = binding, expectRoot = 'HELD') => collectCandidateDatabaseSnapshot(b, { expectRoot }, { guard, run });
    const first = collect(); observations.push(first);
    assert.notEqual(root.pid, control.sessionPid);
    assert.deepEqual(first.observation.candidateBackends.map(row => [row.pid, row.backendStartedAt, row.applicationName]),
      [[control.sessionPid, control.backendStartedAtUs, `phoenix-fence:${status.bootId}`]]);
    assert.equal(first.observation.rootLocks.length, 2);
    assert.equal(first.admissionOrApprovalGranted, false);
    cases.push('actual ERP control backend and original root client share the exact PG database with two exclusive root locks');

    const changed = structuredClone(binding); changed.candidate.backendStartedAt = changedMicrosecond(control.backendStartedAtUs);
    assert.throws(() => collect(changed), /CANDIDATE_DATABASE_HOLD=BACKEND_IDENTITY_CHANGED/);
    cases.push('a one-microsecond candidate identity mismatch is rejected against actual PG');

    assert.equal(capsule.request(candidate, '/api/auth/login', { method: 'POST', body: {} }).status, 503);
    const second = collect(); observations.push(second);
    assert.deepEqual(second.observation.rootBackends, first.observation.rootBackends);
    assert.deepEqual(second.observation.candidateBackends, first.observation.candidateBackends);
    assert.deepEqual(second.observation.rootLocks, first.observation.rootLocks);
    assert.equal((await lease.observe()).observation.backends[0].pid, root.pid);
    cases.push('real HTTP admission remains denied while the same original root lease stays held');

    release = await lease.close(); assert.equal(release.ownedBackendGone, true);
    const released = collect(binding, 'RELEASED'); observations.push(released);
    assert.deepEqual(released.observation.rootBackends, []); assert.deepEqual(released.observation.rootLocks, []);
    assert.deepEqual(released.observation.candidateBackends, first.observation.candidateBackends);
    cases.push('normal root EOF removes its backend and locks while the actual ERP control connection survives');
    assert.throws(() => collect(), /CANDIDATE_DATABASE_HOLD=ROOT_BACKEND_NOT_UNIQUE/);
    cases.push('a released root lease cannot satisfy the earlier HELD expectation');

    // Terminate only this owned fixture's exact original API control backend.
    // Never run this probe against production or substitute a synthetic psql peer.
    capsule.verifySession(candidate, capsule.status(candidate));
    assert.equal(capsule.sql(pg, `SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity
      WHERE pid=${control.sessionPid} AND datid=${database.databaseOid} AND application_name=${literal(control.applicationName)}
      AND to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')=${literal(control.backendStartedAtUs)};`), 't');
    assert.throws(() => collect(binding, 'RELEASED'), /CANDIDATE_DATABASE_HOLD=BACKEND_NOT_UNIQUE/);
    const deadline = Date.now() + 10000;
    let failedStatus;
    do { failedStatus = capsule.status(candidate); if (failedStatus.poisoned === true) break; await pause(100); } while (Date.now() < deadline);
    assert.equal(failedStatus.poisoned, true); assert.equal(failedStatus.controlSession.broken, true);
    assert.equal(capsule.request(candidate, '/api/auth/login', { method: 'POST', body: {} }).status, 503);
    assert.equal(Number(capsule.sql(pg, `SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name=${literal(control.applicationName)};`)), 0);
    const finalRuntime = capsule.inspectContainer(candidate.id);
    assert.deepEqual([finalRuntime.Id, finalRuntime.Image, finalRuntime.State.StartedAt, finalRuntime.RestartCount],
      [runtime.Id, runtime.Image, runtime.State.StartedAt, runtime.RestartCount]);
    cases.push('loss of the actual ERP control connection poisons admission without replacement, restart or stale catalog acceptance');
    assert.equal(cases.length, 6);
    return { schema: 'phoenix.actual-erp-root-binding-fixture/v1', result: 'PASS', fixtureOnly: true, productionReceipt: false,
      sourceSha: capsule.sourceSha, imageId: capsule.imageId, pgMajor: pg.major, apiContainerId: candidate.id, database,
      erpRuntime: 'ACTUAL_SOURCE_BUILT', rootLeaseTransport: 'ACTUAL_ORIGINAL_CHILD', catalog: 'ACTUAL_INDEPENDENT_PG',
      authorityAndStore: 'SYNTHETIC_TEST_ONLY', historicalPre: 'SYNTHETIC_TEST_ONLY', fullCandidateServerObserver: 'NOT_RUN',
      productionStorageAndFD9: 'NOT_RUN', continuousDrainProof: false, registryInstalled: false, productionMutation: false,
      cases, observations, rootBefore, release, finalApiStatus: failedStatus,
      originalChildren: children.length, originalChildPids: children.map(item => item.child.pid), originalChildrenClosed: children.every(item => item.closed) };
  } finally {
    // Original resources remain owner-managed even after a negative probe.
    const cleanup = await settleFixtureRootLease(lease, children);
    if (cleanup.failures.length) {
      // A later outer record() overwrites resources.json. Keep debt in its own
      // allowlisted immutable artifact so that the failure handler cannot erase it.
      persistRootBindingFailure(capsule, pg.major, cleanup, children);
      throw Error('ACTUAL_ERP_ROOT_BINDING_CLEANUP_UNVERIFIED');
    }
  }
}
