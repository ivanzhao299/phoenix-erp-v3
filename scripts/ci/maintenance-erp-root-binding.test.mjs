import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { persistRootBindingFailure, settleFixtureRootLease, performExpectedFaultTerm, performExpectedFaultKill, validateExpectedFaultShutdown } from './maintenance-erp-root-binding.fixture.mjs';

function child({ eofCloses = true, signalCloses = true } = {}) {
  const calls = []; let resolve;
  const owned = { closed: false, done: new Promise(done => { resolve = done; }) };
  const close = () => { owned.closed = true; resolve(); };
  owned.child = { stdin: { end() { calls.push('EOF'); if (eofCloses) close(); } }, kill(signal) { calls.push(signal); if (signalCloses) close(); } };
  return { owned, calls };
}
test('failed server close still settles the original child and cannot certify server release', async () => {
  const f = child();
  const result = await settleFixtureRootLease({ close: async () => { throw Error('synthetic guard failure'); } }, [f.owned]);
  assert.deepEqual(f.calls, ['EOF']); assert.equal(result.originalChildrenClosed, true); assert.equal(result.serverReleaseVerified, false);
  assert.deepEqual(result.failures, ['ROOT_SERVER_RELEASE_UNVERIFIED']);
});
test('an EOF timeout attempts a bounded local signal and still fails the fixture', async () => {
  const f = child({ eofCloses: false });
  const result = await settleFixtureRootLease({ close: async () => ({ ownedBackendGone: true }) }, [f.owned], { timeoutMs: 5 });
  assert.deepEqual(f.calls, ['EOF', 'SIGTERM']); assert.equal(result.originalChildrenClosed, true);
  assert.deepEqual(result.failures, ['ORIGINAL_CHILD_EOF_NOT_SETTLED']);
});
test('a surviving original child leaves explicit debt after both deadlines', async () => {
  const f = child({ eofCloses: false, signalCloses: false });
  const result = await settleFixtureRootLease({ close: async () => { throw Error('synthetic failure'); } }, [f.owned], { timeoutMs: 5 });
  assert.equal(result.originalChildrenClosed, false);
  assert.deepEqual(result.failures, ['ROOT_SERVER_RELEASE_UNVERIFIED', 'ORIGINAL_CHILD_EOF_NOT_SETTLED', 'ORIGINAL_CHILD_CLOSE_UNVERIFIED']);
});
test('normal verified EOF requires exactly one registered original child', async () => {
  const f = child();
  const result = await settleFixtureRootLease({ close: async () => ({ ownedBackendGone: true }) }, [f.owned]);
  assert.deepEqual(result.failures, []); assert.equal(result.serverReleaseVerified, true); assert.equal(result.originalChildrenClosed, true);
  assert.deepEqual((await settleFixtureRootLease({ close: async () => ({ ownedBackendGone: true }) }, [])).failures, ['EXACT_ORIGINAL_CHILD_COUNT_UNVERIFIED']);
});
test('an outer failure record cannot overwrite the independent child-debt artifact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-erp-binding-debt-'));
  const resources = path.join(root, 'resources.json'); let file;
  try {
    const capsule = { root, sourceSha: 'a'.repeat(40), record(extra) { fs.writeFileSync(resources, JSON.stringify(extra)); } };
    file = persistRootBindingFailure(capsule, 16, { serverReleaseVerified: false, failures: ['ROOT_SERVER_RELEASE_UNVERIFIED'] },
      [{ child: { pid: 12345 }, closed: false }]);
    capsule.record({ outcome: 'FAIL', failureCode: 'outer-sanitized-error' });
    const debt = JSON.parse(fs.readFileSync(file));
    assert.equal(debt.result, 'FAIL'); assert.equal(debt.productionReceipt, false);
    assert.deepEqual(debt.originalChildren, [{ pid: 12345, closeEventObserved: false }]);
    assert.deepEqual(debt.cleanup.failures, ['ROOT_SERVER_RELEASE_UNVERIFIED']);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.throws(() => persistRootBindingFailure(capsule, 16, {}, []), { code: 'EEXIST' });
  } finally { if (file && fs.existsSync(file)) fs.unlinkSync(file); if (fs.existsSync(resources)) fs.unlinkSync(resources); fs.rmdirSync(root); }
});
function shutdownFixture() {
  const before = { Id: '1'.repeat(64), Image: 'sha256:' + '2'.repeat(64), RestartCount: 0, State: { StartedAt: '2026-10-18T00:00:00Z', Running: true, OOMKilled: false } };
  const afterTerm = structuredClone(before), stopped = structuredClone(before); stopped.State.Running = false; stopped.State.ExitCode = 137;
  const control = { connected: false, broken: true, sessionPid: 123, backendStartedAtUs: '2026-10-18T00:00:00.123456Z', applicationName: 'phoenix-fence:fixture-only' };
  const evidence = { signals: ['SIGTERM', 'SIGKILL'], markersBeforeTerm: 0, markersAfterTerm: 1,
    status: { phase: 'HOLD', poisoned: true, stopping: true, bootId: 'fixture-only', controlSession: structuredClone(control) },
    expectedBootId: 'fixture-only', expectedControl: control, deniedStatus: 503, rootOriginalChildrenClosed: true };
  return { before, afterTerm, stopped, evidence };
}
test('intentional fault teardown is HOLD/UNSUPPORTED and can never become drain or production proof', () => {
  const f = shutdownFixture(), result = validateExpectedFaultShutdown(f.before, f.afterTerm, f.stopped, f.evidence);
  assert.equal(result.shutdownOutcome, 'HOLD'); assert.equal(result.legacyDrainResult, 'UNSUPPORTED'); assert.equal(result.productionReceipt, false);
});
for (const fault of ['missing-marker', 'old-marker', 'not-poisoned', 'admitted', 'not-settled', 'exited-early', 'identity-drift', 'not-stopped', 'oom', 'wrong-signal', 'boot-drift', 'control-drift']) {
  test(`fault teardown refuses ${fault}`, () => {
    const f = shutdownFixture();
    if (fault === 'missing-marker') f.evidence.markersAfterTerm = 0;
    if (fault === 'old-marker') f.evidence.markersBeforeTerm = 1;
    if (fault === 'not-poisoned') f.evidence.status.poisoned = false;
    if (fault === 'admitted') f.evidence.deniedStatus = 200;
    if (fault === 'not-settled') f.evidence.rootOriginalChildrenClosed = false;
    if (fault === 'exited-early') f.afterTerm.State.Running = false;
    if (fault === 'identity-drift') f.stopped.Id = '3'.repeat(64);
    if (fault === 'not-stopped') f.stopped.State.Running = true;
    if (fault === 'oom') f.stopped.State.OOMKilled = true;
    if (fault === 'wrong-signal') f.evidence.signals = ['SIGTERM', 'SIGTERM'];
    if (fault === 'boot-drift') f.evidence.status.bootId = 'replacement';
    if (fault === 'control-drift') f.evidence.status.controlSession.backendStartedAtUs = '2026-10-18T00:00:00.123457Z';
    assert.throws(() => validateExpectedFaultShutdown(f.before, f.afterTerm, f.stopped, f.evidence));
  });
}
for (const fault of ['runtime', 'boot', 'control', 'hold', 'marker', 'settlement']) {
  test(`SIGKILL is never sent after pre-kill ${fault} drift`, () => {
    const f = shutdownFixture(); f.evidence.signals = ['SIGTERM']; let calls = 0;
    if (fault === 'runtime') f.afterTerm.RestartCount++;
    if (fault === 'boot') f.evidence.status.bootId = 'replacement';
    if (fault === 'control') f.evidence.status.controlSession.sessionPid++;
    if (fault === 'hold') f.evidence.status.phase = 'OPEN';
    if (fault === 'marker') f.evidence.markersAfterTerm = 0;
    if (fault === 'settlement') f.evidence.rootOriginalChildrenClosed = false;
    assert.throws(() => performExpectedFaultKill(f.before, f.afterTerm, f.evidence, () => calls++));
    assert.equal(calls, 0);
  });
}
test('only the fully checked original fault incarnation reaches SIGKILL', () => {
  const f = shutdownFixture(); f.evidence.signals = ['SIGTERM']; let calls = 0;
  performExpectedFaultKill(f.before, f.afterTerm, f.evidence, () => calls++); assert.equal(calls, 1);
});
for (const fault of ['runtime', 'boot', 'control', 'not-poisoned']) {
  test(`SIGTERM is never sent to a changed ${fault} fault target`, () => {
    const f = shutdownFixture(), binding = { apiRuntime: structuredClone(f.before), result: 'PROBES_VERIFIED_PENDING_FAULT_TEARDOWN',
      originalChildrenClosed: true, finalApiStatus: structuredClone(f.evidence.status) };
    f.evidence.status.stopping = false; let calls = 0;
    if (fault === 'runtime') f.before.RestartCount++;
    if (fault === 'boot') f.evidence.status.bootId = 'replacement';
    if (fault === 'control') f.evidence.status.controlSession.sessionPid++;
    if (fault === 'not-poisoned') f.evidence.status.poisoned = false;
    assert.throws(() => performExpectedFaultTerm(f.before, binding, f.evidence.status, 0, () => calls++)); assert.equal(calls, 0);
  });
}
