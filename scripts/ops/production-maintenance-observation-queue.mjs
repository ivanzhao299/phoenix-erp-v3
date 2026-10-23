/** Serialize fixed observations of one original owned root. This is not a
 * candidate lease, admission proof or installed production factory. No result
 * caching/coalescing; queue wait consumes the caller's original deadline. */
import { performance } from 'node:perf_hooks';
import { OwnedCandidateBindingObserver } from './production-maintenance-owned-candidate-observer.mjs';
import { HASH } from './production-maintenance-receipts.mjs';
const claimed = new WeakSet();
const failure = code => new Error('OBSERVATION_QUEUE_HOLD=' + code);
const validMs = (value, maximum) => Number.isSafeInteger(value) && value > 0 && value <= maximum;

export class OwnedCandidateObservationQueue {
  #observer; #wall; #mono; #tail = Promise.resolve(); #pending = new Set();
  #fatal = null; #closing = false; #closeTask = null;
  constructor(observer, dependencies = {}) {
    if (!(observer instanceof OwnedCandidateBindingObserver) || claimed.has(observer)
      || Object.keys(dependencies).some(key => !['now', 'monotonicNow'].includes(key))
      || (dependencies.now && typeof dependencies.now !== 'function')
      || (dependencies.monotonicNow && typeof dependencies.monotonicNow !== 'function')) throw failure('UNIQUE_OWNED_OBSERVER_REQUIRED');
    this.#observer = observer; this.#wall = dependencies.now || Date.now;
    this.#mono = dependencies.monotonicNow || (() => performance.now());
    claimed.add(observer); // A failed/closed queue cannot transfer its root to another queue.
  }
  #poison(code) {
    this.#fatal ||= failure(code);
    for (const entry of this.#pending) entry.controller.abort();
    return this.#fatal;
  }
  #budget(timeoutMs, signal) {
    const wall = this.#wall(), mono = this.#mono(); let lastWall = wall, lastMono = mono;
    return () => {
      const at = this.#wall(), mt = this.#mono();
      if (![wall, mono, at, mt].every(Number.isFinite) || at < lastWall || mt < lastMono
        || at - wall >= timeoutMs || mt - mono >= timeoutMs || signal?.aborted) throw failure('DEADLINE_OR_ABORT');
      lastWall = at; lastMono = mt;
      return Math.max(1, Math.floor(Math.min(timeoutMs - (at - wall), timeoutMs - (mt - mono))));
    };
  }
  observe(request) { return this.#enqueue(request, false); }
  observeHealth(request) { return this.#enqueue(request, true); }
  async #enqueue(request, health) {
    if (this.#fatal) throw this.#fatal;
    if (this.#closing) throw failure('CLOSING');
    if (this.#pending.size >= 64) throw this.#poison('QUEUE_CAPACITY');
    const allowed = health ? ['expectedStateDigest', 'timeoutMs', 'signal'] : ['expectedStateDigest', 'mode', 'timeoutMs', 'signal'];
    if (!request || Object.getPrototypeOf(request) !== Object.prototype || Object.keys(request).some(key => !allowed.includes(key))
      || !HASH.test(request.expectedStateDigest || '') || (!health && !['PRE_ADOPTION', 'ADOPTED'].includes(request.mode))
      || (request.timeoutMs !== undefined && !validMs(request.timeoutMs, 30000))
      || (request.signal && !(request.signal instanceof AbortSignal))) throw this.#poison('FIXED_REQUEST_REQUIRED');
    const { signal, expectedStateDigest, mode } = request; const timeoutMs = request.timeoutMs ?? 30000;
    const remaining = this.#budget(timeoutMs, signal), controller = new AbortController();
    const entry = { controller, work: null, started: false }, previous = this.#tail;
    let timer, abortResult;
    const aborted = () => {
      if (this.#closing) { controller.abort(); abortResult?.(failure('CLOSING')); }
      else { const error = this.#poison('ABORTED'); abortResult?.(error); }
    };
    try {
      remaining(); this.#pending.add(entry);
      const cancelled = new Promise((_, reject) => {
        abortResult = reject;
        controller.signal.addEventListener('abort', () => reject(this.#fatal || failure(this.#closing ? 'CLOSING' : 'ABORTED')), { once: true });
        signal?.addEventListener('abort', aborted, { once: true });
        timer = setTimeout(() => reject(this.#poison('DEADLINE')), remaining());
      });
      entry.work = previous.then(async () => {
        // An expired queued call must never start a new native read later.
        if (this.#fatal) throw this.#fatal;
        if (this.#closing || controller.signal.aborted) throw failure('CLOSING_OR_ABORTED');
        const budget = remaining(); entry.started = true;
        const fixed = { expectedStateDigest, timeoutMs: budget, signal: controller.signal, ...(health ? {} : { mode }) };
        const method = health ? OwnedCandidateBindingObserver.prototype.observeHealth : OwnedCandidateBindingObserver.prototype.observe;
        const value = await method.call(this.#observer, fixed);
        remaining(); if (this.#fatal) throw this.#fatal;
        if (this.#closing) throw failure('CLOSING');
        return value; // Never mint, rename or upgrade the observation envelope.
      }).catch(error => {
        // Poison before resolving the serialization tail; a queued sibling
        // cannot slip into a native read between failure and caller delivery.
        if (this.#closing) throw failure('CLOSING');
        const queueFailure = this.#poison(error?.message === 'OBSERVATION_QUEUE_HOLD=DEADLINE_OR_ABORT' ? 'DEADLINE_OR_ABORT' : 'OBSERVATION_FAILED');
        // Redacted diagnostic only: the wrapped observation's message.
        queueFailure.observationUnderlying ??= String(error?.message ?? error).slice(0, 200);
        if (error && typeof error === 'object') { queueFailure.ownedUnderlying ??= error.ownedUnderlying ?? null;
          queueFailure.healthUnderlying ??= error.healthUnderlying ?? null; }
        throw queueFailure;
      });
      // A rejected observer method can still own abort-ignoring inner reads.
      // That debt stays in the observer and is independently joined by close().
      this.#tail = entry.work.then(() => undefined, () => undefined);
      entry.work.then(() => this.#pending.delete(entry), () => this.#pending.delete(entry));
      return await Promise.race([entry.work, cancelled]);
    } catch (error) {
      if (this.#closing) throw failure('CLOSING');
      throw this.#poison(error?.message === 'OBSERVATION_QUEUE_HOLD=DEADLINE_OR_ABORT' ? 'DEADLINE_OR_ABORT' : 'OBSERVATION_FAILED');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', aborted); }
  }
  cleanupDebt() {
    const inner = OwnedCandidateBindingObserver.prototype.cleanupDebt.call(this.#observer);
    return { scope: 'SERIALIZED_ORIGINAL_ROOT_OBSERVATIONS_ONLY', queued: [...this.#pending].filter(v => !v.started).length,
      active: [...this.#pending].filter(v => v.started).length, observer: inner,
      manualRecoveryRequired: this.#fatal !== null || inner.manualRecoveryRequired,
      fullCandidateLease: false, registryInstalled: false, productionReleaseAuthorized: false };
  }
  close({ timeoutMs = 10000 } = {}) {
    if (this.#closeTask) return this.#closeTask;
    if (!validMs(timeoutMs, 10000)) return Promise.reject(failure('CLEANUP_BUDGET_REQUIRED'));
    this.#closing = true;
    return this.#closeTask = (async () => {
      const remaining = this.#budget(timeoutMs); let timer;
      try {
        for (const entry of this.#pending) entry.controller.abort();
        await Promise.race([Promise.allSettled([...this.#pending].map(v => v.work)), new Promise((_, reject) => {
          timer = setTimeout(() => reject(failure('QUEUE_DEBT_UNSETTLED')), remaining());
        })]);
        clearTimeout(timer); remaining();
        if (this.#pending.size) throw failure('QUEUE_DEBT_UNSETTLED');
        const release = OwnedCandidateBindingObserver.prototype.close.call(this.#observer, { timeoutMs: remaining() });
        const value = await Promise.race([release, new Promise((_, reject) => {
          timer = setTimeout(() => reject(failure('ROOT_DEBT_UNSETTLED')), remaining());
        })]);
        remaining(); return value; // Scoped original-root release, never all resources.
      } catch { this.#poison('CLEANUP_UNVERIFIED_MANUAL_RECOVERY_REQUIRED'); throw failure('CLEANUP_UNVERIFIED_MANUAL_RECOVERY_REQUIRED'); }
      finally { clearTimeout(timer); }
    })();
  }
}
