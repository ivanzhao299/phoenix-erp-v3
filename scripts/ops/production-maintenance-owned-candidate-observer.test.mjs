/** Real owned Node root child; synthetic API/Docker/catalog/authority ONLY.
 * These tests do not prove a real PG/candidate/continuous-ingress full lease. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseFixture } from '../ci/maintenance-owned-candidate.fixture.mjs';
import { now } from '../ci/maintenance-transition-fixture.mjs';
import { collectCandidateLeaseBinding } from './production-maintenance-candidate-binding.mjs';
import { OwnedCandidateBindingObserver } from './production-maintenance-owned-candidate-observer.mjs';
const hold = /OWNED_CANDIDATE_HOLD=/;
async function using(action, make = () => ({})) {
  const f = await phaseFixture(); let observer;
  try {
    observer = new OwnedCandidateBindingObserver({ context: f.h.context, replacementEvidence: f.request('PRE_ADOPTION').replacementEvidence, rootLease: f.root },
      { bindingDependencies: f.dependencies, now: () => now, ...make(f) });
    const req = (mode = 'PRE_ADOPTION', extra = {}) => ({ expectedStateDigest: f.h.store.readState().stateDigest, mode, ...extra });
    return await action({ ...f, observer, req });
  } finally {
    await observer?.close().catch(() => undefined);
    await f.close(); // Fixture-only manual cleanup, not a production observer receipt.
  }
}
const immediate = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { const end = performance.now() + 2000; while (performance.now() < end) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 3)); } assert.fail('OWNED_FIXTURE_DID_NOT_ENTER'); }

test('original held root is unique; steady and real committed adopted observations keep one identity', () => using(async f => {
  const first = await f.observer.observe(f.req());
  assert.equal(first.result, 'OBSERVATION_ONLY'); assert.equal(first.fullCandidateLease, false);
  assert.equal(first.continuousIngressProof, false); assert.equal(first.registryInstalled, false);
  assert.equal(first.originalChildPid, f.root.session.child.pid);
  assert.throws(() => new OwnedCandidateBindingObserver({ context: f.h.context, replacementEvidence: f.request('PRE_ADOPTION').replacementEvidence, rootLease: f.root }), /UNIQUE_ORIGINAL_ROOT/);
  await f.verify(); const next = await f.observer.observe(f.req('ADOPTED'));
  assert.notEqual(first.stateDigest, next.stateDigest); assert.equal(next.authorizationCandidateStateDigest, first.authorizationCandidateStateDigest);
  const closing = f.observer.close(); assert.equal(f.observer.close(), closing);
  const released = await closing; assert.equal(released.result, 'ORIGINAL_ROOT_RELEASE_OBSERVED'); assert.equal(released.pendingReads, 0);
  assert.equal(released.rootRelease.localClientClosed, true); assert.equal(released.rootRelease.ownedBackendGone, true);
  assert.equal(released.allOtherOwnedChildren, 'NOT_EVALUATED'); assert.equal(released.productionReleaseAuthorized, false);
  await assert.rejects(f.observer.observe(f.req('ADOPTED')), /CLOSING/);
}));
test('refused adopted operation remains poisoned even after genuine later VERIFY', () => using(async f => {
  await assert.rejects(f.observer.observe(f.req('ADOPTED')), hold);
  await f.verify(); await assert.rejects(f.observer.observe(f.req('ADOPTED')), hold);
}));
test('adoption mode cannot go backwards', () => using(async f => {
  await f.verify(); await f.observer.observe(f.req('ADOPTED'));
  await assert.rejects(f.observer.observe(f.req('PRE_ADOPTION')), /CONCURRENT_OR_DOWNGRADED/);
  await assert.rejects(f.observer.observe(f.req('ADOPTED')), hold);
}));
for (const field of ['script', 'url', 'approval', 'continuousIngress', 'rootLease']) test(`request cannot introduce ${field} capability`, () => using(async f => {
  await assert.rejects(f.observer.observe({ ...f.req(), [field]: 'untrusted' }), /FIXED_OBSERVATION_REQUIRED/);
  await assert.rejects(f.observer.observe(f.req()), hold);
}));
for (const change of ['boot', 'rawUS', 'runtime', 'database', 'rootDatabase', 'floor', 'anchor']) test(`accepted ${change} identity can never drift back into a good observation`, () => {
  let alter = false;
  return using(async f => {
    await f.observer.observe(f.req()); alter = true;
    await assert.rejects(f.observer.observe(f.req()), /OBSERVATION_FAILED/);
    alter = false; await assert.rejects(f.observer.observe(f.req()), hold);
  }, f => ({ collect: async (request, deps) => {
    const v = await collectCandidateLeaseBinding(request, deps);
    if (alter) {
      if (change === 'boot') v.status.bootId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      if (change === 'rawUS') v.status.controlSession.backendStartedAtUs = v.status.controlSession.backendStartedAtUs.replace('456Z', '457Z');
      if (change === 'runtime') v.runtime.api.startedAt = '2026-10-17T00:00:00.000Z';
      if (change === 'database') v.database.binding.candidate.sessionPid++;
      if (change === 'rootDatabase') v.rootBefore.database.databaseOid++;
      if (change === 'floor') v.approvedRuntimeContractSha256 = 'd'.repeat(64);
      if (change === 'anchor') v.authorizationCandidateStateDigest = 'e'.repeat(64);
    }
    return v;
  } }));
});
test('an ignored timeout retains actual pending debt and refuses root release', () => {
  let release, entered = false;
  return using(async f => {
    const observing = f.observer.observe(f.req('PRE_ADOPTION', { timeoutMs: 1000 }));
    const denied = assert.rejects(observing, hold);
    await until(() => entered); await denied;
    assert.equal(f.root.session.child.exitCode, null);
    const closing = f.observer.close({ timeoutMs: 10 }); await assert.rejects(closing, /CLEANUP_UNVERIFIED_MANUAL_RECOVERY/);
    assert.equal(f.root.session.child.exitCode, null); assert.equal(f.observer.close(), closing);
    release(); await immediate();
    await assert.rejects(f.observer.observe(f.req()), hold);
    await assert.rejects(f.observer.close(), /CLEANUP_UNVERIFIED_MANUAL_RECOVERY/);
  }, f => ({ collect: async (request, deps) => {
    const value = await collectCandidateLeaseBinding(request, deps);
    return new Promise(resolve => { entered = true; release = () => resolve(value); });
  } }));
});
test('close aborts and joins a cooperative active read before releasing the original root', () => {
  let entered = false, settled = false;
  return using(async f => {
    const observing = f.observer.observe(f.req()), denied = assert.rejects(observing, hold);
    await until(() => entered); const released = await f.observer.close(); await denied;
    assert.equal(settled, true); assert.equal(released.pendingReads, 0); assert.equal(released.rootRelease.ownedBackendGone, true);
  }, () => ({ collect: request => new Promise((_, reject) => {
    entered = true; request.signal.addEventListener('abort', () => { settled = true; reject(new Error('OWNED_FIXTURE_ABORTED')); }, { once: true });
  }) }));
});
test('concurrent read poisons both; late successful results cannot rehabilitate the lease', () => {
  let release, entered = false;
  return using(async f => {
    const first = f.observer.observe(f.req()), denied = assert.rejects(first, hold);
    await until(() => entered); await assert.rejects(f.observer.observe(f.req()), /CONCURRENT_OR_DOWNGRADED/); await denied;
    release(); await immediate(); await assert.rejects(f.observer.observe(f.req()), hold);
  }, f => ({ collect: async (request, deps) => {
    const value = await collectCandidateLeaseBinding(request, deps);
    return new Promise(resolve => { entered = true; release = () => resolve(value); });
  } }));
});
test('external abort refuses even a later valid response, and cleanup joins it', () => {
  let release, entered = false;
  return using(async f => {
    const controller = new AbortController(), first = f.observer.observe(f.req('PRE_ADOPTION', { signal: controller.signal })), denied = assert.rejects(first, hold);
    await until(() => entered); controller.abort(); await denied;
    const closing = f.observer.close(); release(); const result = await closing;
    assert.equal(result.pendingReads, 0); await assert.rejects(f.observer.observe(f.req()), hold);
  }, f => ({ collect: async (request, deps) => {
    const value = await collectCandidateLeaseBinding(request, deps);
    return new Promise(resolve => { entered = true; release = () => resolve(value); });
  } }));
});
test('original child EOF permanently denies new observations while preserving verified cleanup', () => using(async f => {
  const child = f.root.session.child, close = new Promise(resolve => child.once('close', resolve));
  child.stdin.end(); await close;
  await assert.rejects(f.observer.observe(f.req()), /ORIGINAL_TRANSPORT_LOST/);
  const released = await f.observer.close(); assert.equal(released.rootRelease.ownedBackendGone, true);
}));
test('mutable caller request cannot redirect a pending fixed read', () => {
  let entered = false, release;
  return using(async f => {
    const req = f.req(), observing = f.observer.observe(req);
    await until(() => entered); req.mode = 'ADOPTED'; req.expectedStateDigest = 'e'.repeat(64); req.signal = new AbortController().signal;
    release(); const value = await observing; assert.equal(value.mode, 'PRE_ADOPTION');
  }, f => ({ collect: async (request, deps) => {
    const value = await collectCandidateLeaseBinding(request, deps);
    return new Promise(resolve => { entered = true; release = () => resolve(value); });
  } }));
});
for (const kind of ['wall', 'monotonic']) test(`${kind} rollback cannot return an accepted observation`, () => {
  let wall = now, mono = 100;
  return using(async f => {
    await assert.rejects(f.observer.observe(f.req()), hold); await assert.rejects(f.observer.observe(f.req()), hold);
  }, () => ({ now: () => wall, monotonicNow: () => mono, collect: async () => {
    if (kind === 'wall') wall--; else mono--; return {};
  } }));
});
test('invalid close budget never closes the root or consumes its one valid cleanup', () => using(async f => {
  await assert.rejects(f.observer.close({ timeoutMs: 0 }), /CLEANUP_BUDGET_REQUIRED/);
  assert.equal(f.root.session.child.exitCode, null); const released = await f.observer.close(); assert.equal(released.rootRelease.ownedBackendGone, true);
}));

test('cached concurrent root close cannot escape the observer cleanup deadline or erase late debt', () => using(async f => {
  const child = f.root.session.child, originalEnd = child.stdin.end.bind(child.stdin); let eofRequested = false, rawSettled = false;
  child.stdin.end = () => { eofRequested = true; return child.stdin; };
  let raw;
  try {
    raw = f.root.close({ timeoutMs: 5000 }); raw.finally(() => { rawSettled = true; }).catch(() => undefined);
    assert.equal(eofRequested, true);
    const closing = f.observer.close({ timeoutMs: 10 });
    let timer;
    try { await Promise.race([assert.rejects(closing, /CLEANUP_UNVERIFIED_MANUAL_RECOVERY/),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OUTER_CLOSE_DID_NOT_BOUND_CACHED_ROOT')), 1000); })]); }
    finally { clearTimeout(timer); }
    assert.equal(rawSettled, false); assert.equal(f.observer.cleanupDebt().rootClosePending, true);
    assert.equal(f.observer.close(), closing);
    child.stdin.end = originalEnd; originalEnd(); await raw; await immediate();
    assert.equal(f.observer.cleanupDebt().rootCloseState, 'SETTLED_RESULT_UNVERIFIED');
    assert.equal(f.observer.cleanupDebt().manualRecoveryRequired, true);
    await assert.rejects(f.observer.close(), /CLEANUP_UNVERIFIED_MANUAL_RECOVERY/);
  } finally { child.stdin.end = originalEnd; originalEnd(); await raw?.catch(() => undefined); }
}));
