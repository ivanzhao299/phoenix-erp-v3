/** Own the lifetime of one already-held original root and its binding and health reads.
 * Observations are never CANDIDATE_CONTROL_LEASE, ingress proof or approval.
 * No CLI/factory installs this component; all production admission still denies. */
import { performance } from 'node:perf_hooks';
import { ChildProcess } from 'node:child_process';
import { RootControlLease } from './production-maintenance-root-lease.mjs';
import { collectCandidateLeaseBinding, collectCandidateServerBinding } from './production-maintenance-candidate-binding.mjs';
import { observeCandidateHealthAndStartup } from './production-maintenance-candidate-health.mjs';
import { validateMaintenanceContext, bindingDigest, canonicalDigest, same, HASH } from './production-maintenance-receipts.mjs';
const claimed = new WeakSet();
const error = code => new Error('OWNED_CANDIDATE_HOLD=' + code);
const timeoutValue = (v, max) => Number.isSafeInteger(v) && v > 0 && v <= max;
const frozen = v => { if (v && typeof v === 'object') { for (const c of Object.values(v)) frozen(c); Object.freeze(v); } return v; };
const candidatePin = v => ({ runtime: v.runtime, bootId: v.status.bootId, controlSession: Object.fromEntries(
  ['connected', 'broken', 'sessionPid', 'databaseOid', 'backendStartedAt', 'backendStartedAtUs', 'applicationName'].map(k => [k, v.status.controlSession[k]])),
  database: v.database.binding, rootDatabase: v.rootBefore.database, approvedRuntimeContractSha256: v.approvedRuntimeContractSha256,
  authorizationCandidateStateDigest: v.authorizationCandidateStateDigest });

export class OwnedCandidateBindingObserver {
  #root; #session; #child; #context; #replacement; #collect; #dependencies; #collectHealth; #healthDependencies; #now; #mono;
  #rootCloseWork = null; #rootCloseState = 'NOT_STARTED';
  #pending = new Set(); #fatal = null; #closing = false; #closeTask = null; #pin = null; #adopted = false;
  constructor({ context, replacementEvidence, rootLease }, dependencies = {}) {
    validateMaintenanceContext(context);
    if (!(rootLease instanceof RootControlLease) || !same(context, rootLease.context) || !HASH.test(replacementEvidence?.evidenceSha256 || '')
      || claimed.has(rootLease)) throw error('UNIQUE_ORIGINAL_ROOT_REQUIRED');
    RootControlLease.prototype.assertHeld.call(rootLease);
    const child = rootLease.session?.child;
    if (!(child instanceof ChildProcess) || !Number.isSafeInteger(child.pid) || child.pid < 1 || child.killed || child.exitCode !== null || child.signalCode !== null) throw error('LIVE_ORIGINAL_CHILD_REQUIRED');
    if ((dependencies.collectHealth && typeof dependencies.collectHealth !== 'function') || (dependencies.collect && typeof dependencies.collect !== 'function') || (dependencies.now && typeof dependencies.now !== 'function')
      || (dependencies.monotonicNow && typeof dependencies.monotonicNow !== 'function')) throw error('FIXED_DEPENDENCIES_REQUIRED');
    this.#root = rootLease; this.#session = rootLease.session; this.#child = child;
    this.#context = frozen(structuredClone(context)); this.#replacement = frozen(structuredClone(replacementEvidence));
    this.#collect = dependencies.collect || collectCandidateLeaseBinding;
    this.#dependencies = { ...(dependencies.bindingDependencies || {}) };
    this.#collectHealth = dependencies.collectHealth || observeCandidateHealthAndStartup;
    const healthDependencies = { ...(dependencies.healthDependencies || {}) };
    const healthBinding = healthDependencies.collectBinding || collectCandidateServerBinding;
    if (typeof healthBinding !== 'function') throw error('FIXED_DEPENDENCIES_REQUIRED');
    this.#healthDependencies = { ...healthDependencies, collectBinding: async (request, deps) => {
      this.#assertOriginal();
      const value = await healthBinding(request, deps);
      this.#assertOriginal();
      if (!this.#pin || !same(this.#pin, candidatePin({ ...value, authorizationCandidateStateDigest: value.stateDigest }))) throw this.#poison('CANDIDATE_IDENTITY_CHANGED');
      return value;
    }, bindingDependencies: this.#dependencies };
    this.#now = dependencies.now || Date.now; this.#mono = dependencies.monotonicNow || (() => performance.now());
    claimed.add(rootLease); // Never unclaim a used transport, including after failure/close.
  }
  #poison(code) {
    this.#fatal ||= error(code);
    for (const entry of this.#pending) entry.controller.abort();
    return this.#fatal;
  }
  #assertOriginal() {
    if (this.#root.session !== this.#session || this.#session.child !== this.#child || this.#child.killed
      || this.#child.exitCode !== null || this.#child.signalCode !== null) throw this.#poison('ORIGINAL_TRANSPORT_LOST');
    try { RootControlLease.prototype.assertHeld.call(this.#root); } catch { throw this.#poison('ORIGINAL_ROOT_NOT_HELD'); }
  }
  #budget(timeoutMs, signal, cleanup = false) {
    const wall = this.#now(), mono = this.#mono(); let lastWall = wall, lastMono = mono;
    const check = () => {
      const at = this.#now(), mt = this.#mono();
      if (![wall, mono, at, mt].every(Number.isFinite) || at < lastWall || mt < lastMono || at - wall >= timeoutMs || mt - mono >= timeoutMs
        || signal?.aborted || (!cleanup && (at < Date.parse(this.#context.window.start) || at >= Date.parse(this.#context.window.end)))) throw error('BUDGET_OR_ABORT');
      lastWall = at; lastMono = mt;
    };
    return { check, remaining: () => { check(); return Math.max(1, Math.floor(Math.min(timeoutMs - (lastWall - wall), timeoutMs - (lastMono - mono), cleanup ? Infinity : Date.parse(this.#context.window.end) - lastWall))); } };
  }
  observe(request) { return this.#observe(request, false); }
  observeHealth(request) { return this.#observe(request, true); }
  async #observe(request, health) {
    if (this.#fatal) throw this.#fatal;
    if (this.#closing) throw error('CLOSING');
    if (!request || Object.keys(request).some(k => !(health ? ['expectedStateDigest', 'timeoutMs', 'signal'] : ['expectedStateDigest', 'mode', 'timeoutMs', 'signal']).includes(k))
      || !HASH.test(request.expectedStateDigest || '') || (!health && !['PRE_ADOPTION', 'ADOPTED'].includes(request.mode))
      || (request.timeoutMs !== undefined && !timeoutValue(request.timeoutMs, 30000))
      || (request.signal && !(request.signal instanceof AbortSignal))) throw this.#poison('FIXED_OBSERVATION_REQUIRED');
    if (health && (!this.#adopted || !this.#pin)) throw this.#poison('ADOPTED_BINDING_BEFORE_HEALTH_REQUIRED');
    if (this.#pending.size || (!health && this.#adopted && request.mode !== 'ADOPTED')) throw this.#poison('CONCURRENT_OR_DOWNGRADED_READ');
    const { expectedStateDigest, signal } = request; const mode = health ? 'ADOPTED' : request.mode;
    const timeoutMs = request.timeoutMs ?? 30000, controller = new AbortController(), budget = this.#budget(timeoutMs, signal);
    const onAbort = () => controller.abort(); signal?.addEventListener('abort', onAbort, { once: true });
    const entry = { controller, work: null }; let timer;
    try {
      budget.check(); this.#assertOriginal();
      this.#pending.add(entry);
      entry.work = Promise.resolve().then(() => {
        const fixedRequest = { context: this.#context, expectedStateDigest, replacementEvidence: this.#replacement,
          rootLease: this.#root, signal: controller.signal, timeoutMs: budget.remaining() };
        return health ? this.#collectHealth(fixedRequest, this.#healthDependencies)
          : this.#collect({ ...fixedRequest, mode }, this.#dependencies);
      });
      // Only actual settlement clears debt. A deadline or abort never does.
      entry.work.then(() => this.#pending.delete(entry), () => this.#pending.delete(entry));
      const value = await Promise.race([entry.work, new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(this.#poison('OBSERVATION_TIMEOUT')); }, budget.remaining());
        controller.signal.addEventListener('abort', () => reject(error('OBSERVATION_ABORTED')), { once: true });
      })]);
      budget.check(); if (this.#fatal) throw this.#fatal; if (this.#closing) throw error('CLOSING'); this.#assertOriginal();
      if (health) {
        if (value?.schema !== 'phoenix.candidate-health-observation/v1' || value.result !== 'OBSERVATION_ONLY'
          || value.contextDigest !== bindingDigest(this.#context) || value.stateDigest !== expectedStateDigest
          || value.registryInstalled !== false || value.continuousIngressProof !== false || value.productionMutation !== false
          || value.admissionOrApprovalGranted !== false || value.rawOutput !== false || value.outerProcessSupervisionRequired !== true)
          throw error('FIXED_HEALTH_OBSERVATION_REQUIRED');
        budget.check();
        return { ...structuredClone(value), ownedObservationLifecycle: 'ORIGINAL_ROOT_AND_PENDING_READS_ONLY',
          originalChildPid: this.#child.pid, fullCandidateLease: false };
      }
      if (value?.schema !== 'phoenix.candidate-lease-binding-observation/v1' || value.result !== 'OBSERVATION_ONLY'
        || value.contextDigest !== bindingDigest(this.#context) || value.stateDigest !== expectedStateDigest || value.mode !== mode
        || value.candidateReplacementSha256 !== this.#replacement.evidenceSha256 || value.registryInstalled !== false
        || value.continuousIngressProof !== false || value.persistentOwnershipComplete !== false || value.admissionOrApprovalGranted !== false
        || value.productionMutation !== false) throw error('FIXED_BINDING_OBSERVATION_REQUIRED');
      const pin = candidatePin(value);
      if (this.#pin && !same(this.#pin, pin)) throw error('CANDIDATE_IDENTITY_CHANGED');
      this.#pin ||= frozen(structuredClone(pin)); if (mode === 'ADOPTED') this.#adopted = true;
      budget.check();
      return { ...structuredClone(value), ownedObservationLifecycle: 'ORIGINAL_ROOT_AND_PENDING_READS_ONLY',
        originalChildPid: this.#child.pid, fullCandidateLease: false, continuousIngressProof: false, registryInstalled: false };
    } catch (inner) {
      const failure = this.#poison('OBSERVATION_FAILED');
      // Redacted diagnostic only: the wrapped observation's class.
      failure.ownedUnderlying ??= String(inner?.message ?? inner).slice(0, 200);
      throw failure;
    }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  }
  cleanupDebt() {
    return { result: 'OBSERVATION_ONLY', pendingReads: this.#pending.size, rootCloseState: this.#rootCloseState,
      rootClosePending: this.#rootCloseWork !== null && this.#rootCloseState === 'PENDING',
      manualRecoveryRequired: this.#fatal !== null, allOtherOwnedChildren: 'NOT_EVALUATED', admissionOrApprovalGranted: false };
  }
  close({ timeoutMs = 10000 } = {}) {
    if (this.#closeTask) return this.#closeTask;
    if (!timeoutValue(timeoutMs, 10000)) return Promise.reject(error('CLEANUP_BUDGET_REQUIRED'));
    this.#closing = true;
    return this.#closeTask = (async () => {
      const budget = this.#budget(timeoutMs, undefined, true); let timer;
      try {
        for (const entry of this.#pending) entry.controller.abort();
        // An unresolved or abort-ignoring observer keeps root ownership and HOLD.
        await Promise.race([Promise.allSettled([...this.#pending].map(e => e.work)), new Promise((_, reject) => {
          timer = setTimeout(() => reject(error('READ_DEBT_UNSETTLED')), budget.remaining());
        })]);
        clearTimeout(timer); budget.check(); if (this.#pending.size) throw error('READ_DEBT_UNSETTLED');
        if (this.#root.session !== this.#session || this.#session.child !== this.#child) throw error('ORIGINAL_RESOURCE_CHANGED_BEFORE_CLOSE');
        this.#rootCloseState = 'PENDING';
        this.#rootCloseWork = RootControlLease.prototype.close.call(this.#root, { timeoutMs: budget.remaining() });
        this.#rootCloseWork.then(() => { this.#rootCloseState = 'SETTLED_RESULT_UNVERIFIED'; }, () => { this.#rootCloseState = 'FAILED_UNVERIFIED'; });
        const released = await Promise.race([this.#rootCloseWork, new Promise((_, reject) => {
          timer = setTimeout(() => reject(error('ROOT_CLOSE_DEBT_UNSETTLED')), budget.remaining());
        })]);
        clearTimeout(timer);
        budget.check();
        if (this.#root.session !== this.#session || this.#session.child !== null || released?.schema !== 'phoenix.root-control-release/v1'
          || released.contextDigest !== bindingDigest(this.#context) || released.owner !== this.#context.owner
          || released.localClientClosed !== true || released.ownedBackendGone !== true) throw error('ORIGINAL_RELEASE_UNVERIFIED');
        this.#rootCloseState = 'RELEASE_VERIFIED';
        return { schema: 'phoenix.owned-candidate-binding-release/v1', result: 'ORIGINAL_ROOT_RELEASE_OBSERVED', contextDigest: bindingDigest(this.#context),
          originalChildPid: this.#child.pid, pendingReads: 0, rootReleaseSha256: canonicalDigest(released), rootRelease: structuredClone(released),
          allOtherOwnedChildren: 'NOT_EVALUATED', fullCandidateLease: false, registryInstalled: false, productionReleaseAuthorized: false };
      } catch { this.#poison('CLEANUP_UNVERIFIED_MANUAL_RECOVERY_REQUIRED'); throw error('CLEANUP_UNVERIFIED_MANUAL_RECOVERY_REQUIRED'); }
      finally { clearTimeout(timer); }
    })();
  }
}
