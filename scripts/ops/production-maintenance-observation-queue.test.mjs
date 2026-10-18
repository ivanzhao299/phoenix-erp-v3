/** Actual owned Node child and private phase files; Docker/PG/authority/health
 * observations are synthetic. This is scheduler/lifecycle evidence only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseFixture } from '../ci/maintenance-owned-candidate.fixture.mjs';
import { now } from '../ci/maintenance-transition-fixture.mjs';
import { collectCandidateLeaseBinding } from './production-maintenance-candidate-binding.mjs';
import { OwnedCandidateBindingObserver } from './production-maintenance-owned-candidate-observer.mjs';
import { OwnedCandidateObservationQueue } from './production-maintenance-observation-queue.mjs';
const immediate = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function until(predicate) { const end = performance.now() + 2000; while (!predicate()) { assert.ok(performance.now() < end); await new Promise(r => setTimeout(r, 2)); } }
async function using(action, additions = () => ({}), clocks = {}) {
  const f = await phaseFixture(); let observer, queue;
  try {
    observer = new OwnedCandidateBindingObserver({ context: f.h.context, replacementEvidence: f.request('PRE_ADOPTION').replacementEvidence, rootLease: f.root },
      { bindingDependencies: f.dependencies, now: () => now, ...additions(f) });
    queue = new OwnedCandidateObservationQueue(observer, clocks);
    const request = (extra = {}) => ({ expectedStateDigest: f.h.store.readState().stateDigest, mode: 'PRE_ADOPTION', timeoutMs: 2000, ...extra });
    return await action({ ...f, observer, queue, req: request });
  } finally {
    await queue?.close().catch(() => undefined);
    await observer?.close().catch(() => undefined);
    await f.close(); // Fixture manual cleanup is not a successful queue release.
  }
}
test('concurrent binding reads serialize without cache and retain scoped observation truth', () => {
  let active = 0, maximum = 0, count = 0; const order = [];
  return using(async f => {
    const values = await Promise.all([10000, 20000, 30000].map(timeoutMs => f.queue.observe(f.req({ timeoutMs }))));
    assert.equal(count, 3); assert.equal(maximum, 1); assert.deepEqual(order, [1, 2, 3]);
    for (const value of values) { assert.equal(value.originalChildPid, f.root.session.child.pid); assert.equal(value.fullCandidateLease, false); assert.equal(value.continuousIngressProof, false); }
    assert.equal(f.queue.cleanupDebt().active, 0); assert.equal(f.queue.cleanupDebt().queued, 0);
    const close = f.queue.close(); assert.equal(f.queue.close(), close); assert.equal((await close).rootRelease.ownedBackendGone, true);
    await assert.rejects(f.queue.observe(f.req()), /CLOSING/);
    assert.throws(() => new OwnedCandidateObservationQueue(f.observer), /UNIQUE_OWNED_OBSERVER/);
  }, () => ({ collect: async (...args) => { order.push(Math.ceil(args[0].timeoutMs / 10000)); count++; active++; maximum = Math.max(maximum, active);
    try { await immediate(); return await collectCandidateLeaseBinding(...args); } finally { active--; } } }));
});
test('queue wait consumes the original budget rather than resetting at dispatch', () => {
  const gate = deferred(); let count = 0, wall = 0, mono = 0, secondBudget;
  return using(async f => {
    const first = f.queue.observe(f.req({ timeoutMs: 30000 })); await until(() => count === 1);
    // Advance the synthetic scheduler clock by60% of the second budget. Keep
    // real collector CPU time separate from the deterministic queue-wait test.
    const second = f.queue.observe(f.req({ timeoutMs: 10000 })); wall = mono = 6000; gate.resolve(); await Promise.all([first, second]);
    // The underlying observer additionally subtracts its own dispatch time.
    assert.ok(secondBudget > 0 && secondBudget <= 4000, 'remaining budget must not reset to10000');
  }, () => ({ collect: async (request, deps) => { if (++count === 1) await gate.promise; else secondBudget = request.timeoutMs; return collectCandidateLeaseBinding(request, deps); } }), { now: () => wall, monotonicNow: () => mono });
});
test('expired queued call never starts later and permanently fences siblings', () => {
  const gate = deferred(); let count = 0, clock = 0;
  return using(async f => {
    const first = f.queue.observe(f.req({ timeoutMs: 1000 })); await until(() => count === 1);
    const second = f.queue.observe(f.req({ timeoutMs: 100 })), rejected = assert.rejects(second, /QUEUE_HOLD=/);
    clock = 150; gate.resolve(); await first; await rejected; assert.equal(count, 1);
    await assert.rejects(f.queue.observe(f.req()), /QUEUE_HOLD=/);
  }, () => ({ collect: async (...args) => { count++; await gate.promise; return collectCandidateLeaseBinding(...args); } }), { now: () => clock, monotonicNow: () => clock });
});
test('a first read failure poisons before the serialization tail can admit its sibling', () => {
  const gate = deferred(); let count = 0;
  return using(async f => {
    const first = f.queue.observe(f.req()), failed = assert.rejects(first, /QUEUE_HOLD=/); await until(() => count === 1);
    const second = f.queue.observe(f.req()), refused = assert.rejects(second, /QUEUE_HOLD=/);
    gate.resolve(); await Promise.all([failed, refused]); assert.equal(count, 1);
  }, () => ({ collect: async () => { count++; await gate.promise; throw Error('SYNTHETIC_READ_FAILURE'); } }));
});
test('abort while queued cancels every admission and preserves abort-ignoring observer debt', () => {
  const gate = deferred(); let entered = false, count = 0;
  return using(async f => {
    const first = f.queue.observe(f.req()), failed = assert.rejects(first, /QUEUE_HOLD=/); await until(() => entered);
    const controller = new AbortController(), second = f.queue.observe(f.req({ signal: controller.signal })), refused = assert.rejects(second, /QUEUE_HOLD=/);
    controller.abort(); await Promise.all([failed, refused]); assert.equal(count, 1);
    assert.equal(f.queue.cleanupDebt().observer.pendingReads, 1); assert.equal(f.root.session.child.exitCode, null);
    const close = f.queue.close({ timeoutMs: 20 }); await assert.rejects(close, /CLEANUP_UNVERIFIED/); assert.equal(f.root.session.child.exitCode, null);
    gate.resolve(); await immediate(); assert.equal(f.queue.close(), close); await assert.rejects(f.queue.close(), /CLEANUP_UNVERIFIED/);
  }, () => ({ collect: async (request, deps) => { count++; const value = await collectCandidateLeaseBinding(request, deps); entered = true; await gate.promise; return value; } }));
});
test('close stops queued work, aborts cooperative active read, joins it and releases only original root', () => {
  let entered = false, settled = false, count = 0;
  return using(async f => {
    const first = f.queue.observe(f.req()), refused = assert.rejects(first, /CLOSING/); await until(() => entered);
    const second = f.queue.observe(f.req()), queued = assert.rejects(second, /CLOSING/);
    const result = await f.queue.close(); await Promise.all([refused, queued]); assert.equal(count, 1); assert.equal(settled, true);
    assert.equal(result.rootRelease.localClientClosed, true); assert.equal(result.allOtherOwnedChildren, 'NOT_EVALUATED');
  }, () => ({ collect: request => new Promise((_, reject) => { count++; entered = true; request.signal.addEventListener('abort', () => { settled = true; reject(Error('COOPERATIVE_ABORT')); }, { once: true }); }) }));
});
test('queued request fields are captured before caller mutation', () => {
  const gate = deferred(); let count = 0, observed;
  return using(async f => {
    const first = f.queue.observe(f.req()); await until(() => count === 1);
    const request = f.req(), expected = request.expectedStateDigest, second = f.queue.observe(request);
    request.expectedStateDigest = 'e'.repeat(64); request.mode = 'ADOPTED'; request.timeoutMs = 1; request.url = 'untrusted';
    gate.resolve(); await Promise.all([first, second]); assert.equal(observed.expectedStateDigest, expected); assert.equal(observed.mode, 'PRE_ADOPTION');
  }, () => ({ collect: async (request, deps) => { if (++count === 1) await gate.promise; else observed = request; return collectCandidateLeaseBinding(request, deps); } }));
});
test('phase changed behind a queued observation is refused, never coalesced into an earlier result', () => {
  const gate = deferred(); let count = 0, captured = false;
  return using(async f => {
    const first = f.queue.observe(f.req()); await until(() => captured);
    const second = f.queue.observe(f.req()), refused = assert.rejects(second, /QUEUE_HOLD=/);
    await f.verify(); gate.resolve(); await first; await refused; assert.equal(count, 2);
  }, () => ({ collect: async (request, deps) => { const number = ++count, value = await collectCandidateLeaseBinding(request, deps); if (number === 1) { captured = true; await gate.promise; } return value; } }));
});
test('binding and synthetic health share the same FIFO and original adopted root', () => {
  let active = 0, maximum = 0, healthCalls = 0; const order = [];
  const inside = async action => { active++; maximum = Math.max(maximum, active); try { await immediate(); return await action(); } finally { active--; } };
  return using(async f => {
    const original = f.h.adapters.verifyCandidate;
    f.h.adapters.verifyCandidate = async request => {
      f.adopt(); const req = f.req({ mode: 'ADOPTED' }); await f.queue.observe(req);
      const { mode, ...health } = req;
      const results = await Promise.all([f.queue.observeHealth(health), f.queue.observe(req)]);
      assert.equal(results[0].fullCandidateLease, false); assert.equal(results[0].originalChildPid, results[1].originalChildPid);
      return original(request);
    };
    await f.h.engine.verifyCandidate(); assert.equal(maximum, 1); assert.equal(healthCalls, 1); assert.deepEqual(order, ['binding','health','binding']);
  }, () => ({ collect: (...args) => inside(() => { order.push('binding'); return collectCandidateLeaseBinding(...args); }),
    collectHealth: request => inside(() => { order.push('health'); healthCalls++; return { schema: 'phoenix.candidate-health-observation/v1', result: 'OBSERVATION_ONLY',
      contextDigest: request.rootLease.contextDigest, stateDigest: request.expectedStateDigest, registryInstalled: false, continuousIngressProof: false,
      productionMutation: false, admissionOrApprovalGranted: false, rawOutput: false, outerProcessSupervisionRequired: true }; }) }));
});
for (const request of [{ mode: 'PRE_ADOPTION', timeoutMs: 30001 }, { mode: 'PRE_ADOPTION', skipGuard: true }, { mode: 'ADOPTED', signal: {} }, { mode: 'OTHER' }]) test('fixed request validation retains default denial '+JSON.stringify(request), () => using(async f => {
  await assert.rejects(f.queue.observe({ ...f.req(), ...request }), /FIXED_REQUEST_REQUIRED/);
  await assert.rejects(f.queue.observe(f.req()), /QUEUE_HOLD=/);
}));
test('clock rollback cannot return an otherwise successful observation', () => {
  let clock = 100;
  return using(async f => { await assert.rejects(f.queue.observe(f.req()), /QUEUE_HOLD=/); },
    () => ({ collect: async (...args) => { const value = await collectCandidateLeaseBinding(...args); clock = 99; return value; } }), { now: () => clock, monotonicNow: () => clock });
});
test('actual queued timeout retains inner work and never admits the expired read', () => {
  const gate = deferred(); let entered = false, count = 0;
  return using(async f => {
    const first = f.queue.observe(f.req()), failed = assert.rejects(first, /QUEUE_HOLD=/); await until(() => entered);
    const second = f.queue.observe(f.req({ timeoutMs: 30 })), timedOut = assert.rejects(second, /QUEUE_HOLD=/);
    await Promise.all([failed, timedOut]); assert.equal(count, 1); assert.equal(f.queue.cleanupDebt().observer.pendingReads, 1);
    gate.resolve(); await until(() => f.queue.cleanupDebt().observer.pendingReads === 0);
    assert.equal((await f.queue.close()).rootRelease.ownedBackendGone, true);
  }, () => ({ collect: async (...args) => { count++; const value = await collectCandidateLeaseBinding(...args); entered = true; await gate.promise; return value; } }));
});
test('bounded queue saturation rejects new work and fences all existing callers', () => {
  const gate = deferred(); let entered = false, count = 0;
  return using(async f => {
    const first = f.queue.observe(f.req()), refusals = [assert.rejects(first, /QUEUE_HOLD=/)]; await until(() => entered);
    for (let i = 0; i < 63; i++) refusals.push(assert.rejects(f.queue.observe(f.req()), /QUEUE_HOLD=/));
    assert.equal(f.queue.cleanupDebt().queued, 63);
    await assert.rejects(f.queue.observe(f.req()), /QUEUE_CAPACITY/); await Promise.all(refusals); assert.equal(count, 1);
    assert.equal(f.queue.cleanupDebt().observer.pendingReads, 1); gate.resolve();
    await until(() => f.queue.cleanupDebt().observer.pendingReads === 0);
  }, () => ({ collect: async (...args) => { count++; const value = await collectCandidateLeaseBinding(...args); entered = true; await gate.promise; return value; } }));
});
test('serialization never rehabilitates an adopted-to-pre-adoption downgrade', () => using(async f => {
  await f.verify(); await f.queue.observe(f.req({ mode: 'ADOPTED' }));
  await assert.rejects(f.queue.observe(f.req()), /QUEUE_HOLD=/);
  await assert.rejects(f.queue.observe(f.req({ mode: 'ADOPTED' })), /QUEUE_HOLD=/);
}));
test('health abort keeps actual inner debt and prevents early root release', () => {
  const gate = deferred(); let entered = false;
  return using(async f => {
    f.h.adapters.verifyCandidate = async () => {
      f.adopt(); await f.queue.observe(f.req({ mode: 'ADOPTED' }));
      const { mode, ...request } = f.req(), controller = new AbortController();
      const active = f.queue.observeHealth({ ...request, signal: controller.signal }), refused = assert.rejects(active, /QUEUE_HOLD=/);
      await until(() => entered); controller.abort(); await refused;
      assert.equal(f.queue.cleanupDebt().observer.pendingReads, 1);
      await assert.rejects(f.queue.close({ timeoutMs: 20 }), /CLEANUP_UNVERIFIED/); assert.equal(f.root.session.child.exitCode, null);
      gate.resolve(); await until(() => f.queue.cleanupDebt().observer.pendingReads === 0);
      await assert.rejects(f.queue.close(), /CLEANUP_UNVERIFIED/);
      throw Error('EXPECTED_HEALTH_ABORT');
    };
    await assert.rejects(f.h.engine.verifyCandidate(), /EXPECTED_HEALTH_ABORT/);
  }, () => ({ collectHealth: async request => { entered = true; await gate.promise;
    return { schema: 'phoenix.candidate-health-observation/v1', result: 'OBSERVATION_ONLY', contextDigest: request.rootLease.contextDigest,
      stateDigest: request.expectedStateDigest, registryInstalled: false, continuousIngressProof: false,
      productionMutation: false, admissionOrApprovalGranted: false, rawOutput: false, outerProcessSupervisionRequired: true };
  } }));
});
test('existing longer observer close cannot extend queue close or rehabilitate its late refusal', () => using(async f => {
  const gate = deferred(), close = f.root.session.close.bind(f.root.session); let entered = false;
  f.root.session.close = async () => { entered = true; await gate.promise; return close(); };
  const existing = f.observer.close({ timeoutMs: 1000 });
  try {
    await until(() => entered);
    const queuedClose = f.queue.close({ timeoutMs: 30 }); await assert.rejects(queuedClose, /CLEANUP_UNVERIFIED/);
    assert.equal(f.queue.close(), queuedClose); gate.resolve(); await existing;
    assert.equal(f.queue.cleanupDebt().observer.rootCloseState, 'RELEASE_VERIFIED');
    assert.equal(f.queue.cleanupDebt().manualRecoveryRequired, true); await assert.rejects(f.queue.close(), /CLEANUP_UNVERIFIED/);
  } finally { gate.resolve(); await existing.catch(() => undefined); }
}));
