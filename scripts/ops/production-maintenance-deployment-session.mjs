/** Fixed legacy release orchestrator. No stdin, shell body, adapter module path,
 * environment approval, retry, rollback or modern DRAINED conversion. The
 * production producer registry is deliberately NOT installed yet. */
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ChildProcess, spawn } from 'node:child_process';
import { CONTRACT, verifyContext, secureJson, git } from './production-config-guard.mjs';
import { assertModernReleaseAdmission, assertLegacyMaintenanceAdmission } from './production-maintenance-admission.mjs';
import { MaintenanceReceiptStore, validateMaintenanceContext, validateMaintenanceEvidence, canonicalDigest,
  bindingDigest, same, hold, HASH, MAINTENANCE_EVIDENCE_SCHEMA, iso } from './production-maintenance-receipts.mjs';
import { LegacyMaintenanceTransition, MAINTENANCE_OPERATIONS, validateRecoveryMaterial } from './production-maintenance-transition.mjs';
import { LegacyMaintenancePublicControl } from './production-maintenance-public-control.mjs';
import { ControlledComposeReplacement, validateCandidateReplacement, DockerReplacementEvents, replacementEventFormat } from './production-maintenance-replacement.mjs';
import { verifyCompletedDeployment, DockerPostgresControlSession } from './background-control-coordinator.mjs';
import { MODE_EVIDENCE_SCHEMA, verifyEvidenceFiles, verifyLiveSnapshot } from './production-deployment-evidence.mjs';

export const RELEASE_SCOPE = Object.freeze({ mode: 'api', buildApi: true, buildWeb: false, runMigration: false,
  chanjetPolicy: 'HOLD', readonlySync: false, inboundSync: false, rotateCredentials: false, automaticRollback: false });
export const SESSION_STEPS = Object.freeze(['PREFLIGHT', 'CAPTURE_HEALTHY_PRE', 'PREFLIGHT_HANDOFF', 'PREPARE', 'FENCE_INGRESS', 'STOP_LEGACY', 'RECONCILE',
  'PREPARE_PROMOTION', 'REPLACE_CANDIDATE', 'START_CANDIDATE', 'VERIFY_CANDIDATE', 'READ_FORMAL_COMPLETION', 'OPEN_CANDIDATE']);
export const REQUIRED_PRODUCERS = Object.freeze(['assertReady', 'capturePre', 'captureRecovery', 'fenceIngress', 'stopLegacy', 'collectReconciliation',
  'preparePromotion', 'captureReplacementIsolation', 'verifyEmptyPublicFence', 'registerStartedCandidate', 'collectAdoption',
  'capturePostAndStartup', 'completeFormalDeployment', 'collectVerifiedCandidate', 'readFormalCompletion', 'publishOpen', 'abortAndJoin']);
const runtimeSame = (a, b) => ['id', 'imageId', 'revision', 'startedAt', 'restartCount'].every(key => a?.[key] === b?.[key]);
const uninstalledRegistries = new WeakSet();

/** Only a reviewed, compiled factory can install producers. A JSON plan cannot
 * supply functions, command text, module paths or an installation bypass. */
export function unavailableProductionProducers() {
  const registry = Object.fromEntries(REQUIRED_PRODUCERS.map(name => [name, async () => hold(`SESSION_PRODUCER_${name.replace(/[A-Z]/g, c => '_' + c).toUpperCase()}_UNIMPLEMENTED`)]));
  uninstalledRegistries.add(registry); return registry;
}
export function formalEvidencePaths(directory, owner) {
  if (!path.isAbsolute(directory) || !/^\d+-\d+$/.test(owner)) hold('SESSION_EVIDENCE_PATH_BINDING');
  return Object.fromEntries(['pre', 'post', 'log'].map(kind => [kind, path.join(directory, `maintenance-formal-${kind}-${owner}.json`)]));
}
export function validateReleasePlan(plan) {
  validateMaintenanceContext(plan?.context);
  if (plan.schema !== 'phoenix.legacy-maintenance-release-plan/v1' || !same(plan.scope, RELEASE_SCOPE)
    || plan.approvedPreviousFloorSha !== plan.context.previousFloorSha || plan.approvedFloorSha !== plan.context.targetSha
    || !HASH.test(plan.context.replacement?.composeFileSha256 || '') || !/^phoenix[a-z0-9_-]{1,63}$/.test(plan.context.replacement?.project || '')
    || Object.keys(plan).some(key => !['schema', 'context', 'scope', 'approvedPreviousFloorSha', 'approvedFloorSha', 'approval', 'recoveryPlan'].includes(key))) hold('SESSION_EXACT_API_ONLY_PLAN_REQUIRED');
  validateRecoveryMaterial(plan.recoveryPlan, plan.context);
  return plan;
}

/** This function verifies existing formal evidence; it does not mint SUCCESS.
 * Protected readers pin the JSON before/after the legacy verifier's own reads. */
export function verifySessionFormalEvidence({ context, files }, dependencies = {}) {
  const guard = dependencies.guard || (() => verifyContext(CONTRACT.repository, CONTRACT.stateDirectory));
  const read = dependencies.read || secureJson; guard();
  const before = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
  const binding = { runId: context.owner, runAttempt: context.owner.split('-').at(-1), targetSha: context.targetSha,
    configFloorSha: context.targetSha, deployMode: 'api', evidenceSchema: MODE_EVIDENCE_SCHEMA };
  const result = verifyEvidenceFiles(files.pre, files.post, files.log, binding);
  const live = verifyLiveSnapshot(before.post, binding, dependencies.dockerRead);
  for (const [key, file] of Object.entries(files)) if (!same(before[key], read(file))) hold('SESSION_FORMAL_EVIDENCE_CHANGED');
  if (before.pre.containers.api.ociRevision !== context.previousApiSha || before.pre.containers.web.ociRevision !== context.previousWebSha
    || before.pre.containers.api.id !== context.preSnapshot.api.id || before.pre.containers.web.id !== context.preSnapshot.web.id
    || before.pre.containers.db.id !== context.preSnapshot.db.id) hold('SESSION_PRE_NOT_AUTHORIZED_RUNTIME');
  guard();
  return { result, live, snapshots: before, digests: Object.fromEntries(Object.entries(before).map(([key, value]) => [key, canonicalDigest(value)])) };
}

export class LegacyMaintenanceDeploymentSession {
  #controlRegistrations = new WeakSet();
  #phaseCommit = null;
  constructor({ plan }, dependencies = {}) {
    validateReleasePlan(plan); this.plan = structuredClone(plan); this.context = this.plan.context;
    this.rawStore = dependencies.store || new MaintenanceReceiptStore(this.context);
    const mutations = new Set(['immutable', 'writeState', 'appendReceipt', 'claimCurrent', 'beginMarker', 'finishMarker', 'finishCurrent']);
    this.store = new Proxy(this.rawStore, { get: (target, key) => {
      const value = Reflect.get(target, key);
      if (typeof value !== 'function') return value;
      return (...args) => { if (mutations.has(key) && this.fatal) throw this.fatal; return value.apply(target, args); };
    } });
    this.guard = dependencies.guard || (() => verifyContext(CONTRACT.repository, CONTRACT.stateDirectory));
    this.checkMain = dependencies.checkMain || (() => {
      if (git(CONTRACT.repository, ['rev-parse', 'origin/main']) !== this.context.targetSha
        || git(CONTRACT.repository, ['ls-remote', 'origin', 'refs/heads/main'], { timeoutMs: 10000 }) !== `${this.context.targetSha}\trefs/heads/main`) hold('SESSION_REMOTE_MAIN_CHANGED');
    });
    this.now = dependencies.now || Date.now;
    this.verifyAuthority = dependencies.verifyAuthority || (async () => false);
    this.verifyEvidence = dependencies.verifyEvidence || (async () => false);
    this.modernAdmission = dependencies.modernAdmission || (() => assertModernReleaseAdmission());
    this.admit = dependencies.admit || (options => assertLegacyMaintenanceAdmission(options, { verifyAuthority: this.verifyAuthority }));
    this.producers = dependencies.producers || unavailableProductionProducers();
    for (const name of REQUIRED_PRODUCERS) if (typeof this.producers[name] !== 'function') hold('SESSION_TYPED_PRODUCER_MISSING');
    this.publicControl = dependencies.publicControl || new LegacyMaintenancePublicControl({ context: this.context }, {
      store: this.store, verifyAuthority: this.verifyAuthority, verifyEvidence: this.verifyEvidence });
    this.makeReplacement = dependencies.makeReplacement || (options => new ControlledComposeReplacement(options, { store: this.store,
      verifyAuthority: this.verifyAuthority, verifyEvidence: this.verifyEvidence,
      verifyPublicFence: request => this.producer('verifyEmptyPublicFence', request),
      events: new DockerReplacementEvents({ registerChild: child => this.registerObserverChild(child) }) }));
    this.files = formalEvidencePaths(this.store.directory, this.context.owner);
    this.verifyFormalFiles = dependencies.verifyFormalFiles || (() => verifySessionFormalEvidence({ context: this.context, files: this.files }));
    this.verifyFormalCompletion = dependencies.verifyFormalCompletion || ((candidate, participants) => verifyCompletedDeployment({ owner: this.context.owner,
      previousFloorSha: this.context.previousFloorSha, targetSha: this.context.targetSha }, participants));
    this.readFormalState = dependencies.readFormalState || (() => secureJson(path.join(this.store.directory, `deploy-${this.context.owner}.json`)));
    this.used = false; this.lease = null; this.pendingLease = null; this.fatal = null; this.activeController = null; this.monitor = null; this.monitorBusy = false;
    this.monitorTask = null; this.monitorStopUnknown = false; this.monitorGeneration = 0;
    this.lifecycleStarted = false; this.completedResult = null;
    this.pendingReads = new Set(); this.readTimeoutMs = dependencies.readTimeoutMs ?? 10000;
    if (!Number.isSafeInteger(this.readTimeoutMs) || this.readTimeoutMs < 1 || this.readTimeoutMs > 10000) hold('SESSION_READ_TIMEOUT_REQUIRED');
    this.cleanupTimeoutMs = dependencies.cleanupTimeoutMs ?? 10000; this.stepTimeoutMs = dependencies.stepTimeoutMs ?? CONTRACT.maximumTransitionMs;
    if (!Number.isSafeInteger(this.cleanupTimeoutMs) || this.cleanupTimeoutMs < 1 || this.cleanupTimeoutMs > 10000
      || !Number.isSafeInteger(this.stepTimeoutMs) || this.stepTimeoutMs < 1 || this.stepTimeoutMs > CONTRACT.maximumTransitionMs) hold('SESSION_OPERATION_TIMEOUT_REQUIRED');
    this.actions = new Set(); this.children = new Set(); this.controlSessions = new Set(); this.controlChildren = new Map(); this.closingControls = false; this.reservation = null;
    this.pollMs = dependencies.pollMs ?? 2000;
    if (!Number.isSafeInteger(this.pollMs) || this.pollMs < 1 || this.pollMs > 5000) hold('SESSION_MONITOR_INTERVAL_REQUIRED');
    this.stage = 'NOT_STARTED';
    this.engine = new LegacyMaintenanceTransition({ context: this.context }, { store: this.store, verifyAuthority: this.verifyAuthority,
      verifyEvidence: this.verifyEvidence, now: this.now, adapters: this.adapters() });
  }
  async checked() {
    if (this.fatal) throw this.fatal;
    this.guard(); this.engine.checkWindow(); this.assertControlSessionsLive(); await this.boundedRead('EXACT_MAIN', options => this.checkMain(options));
    this.guard(); this.engine.checkWindow();
    if (this.fatal) throw this.fatal; this.assertControlSessionsLive();
  }
  async boundedRead(kind, action) {
    const controller = new AbortController(), entry = { kind, controller };
    this.pendingReads.add(entry);
    const work = Promise.resolve().then(() => action({ signal: controller.signal, timeoutMs: this.readTimeoutMs })); entry.work = work;
    work.then(() => this.pendingReads.delete(entry), () => this.pendingReads.delete(entry));
    let timer;
    try {
      return await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('MAINTENANCE_HOLD=SESSION_READ_PROBE_TIMEOUT'); this.fatal ||= error;
          controller.abort(); this.activeController?.abort(); reject(error);
        }, Math.max(1, Math.min(this.readTimeoutMs, Date.parse(this.context.window.end) - this.now())));
      })]);
    } finally { clearTimeout(timer); }
  }
  track(kind, action) {
    const entry = { kind }; this.actions.add(entry); entry.work = Promise.resolve().then(action);
    entry.work.then(() => this.actions.delete(entry), () => this.actions.delete(entry)); return entry.work;
  }
  registerOwnedChild(child) { return this.#registerChild(child, false); }
  #registerChild(child, observer) {
    // Registration is bookkeeping, never permission to launch a command. The
    // compiled typed producer still must perform real operation admission.
    if (!(child instanceof ChildProcess) || !Number.isSafeInteger(child.pid) || child.pid < 1 || child.exitCode !== null || child.signalCode !== null || this.fatal) hold('SESSION_OWNED_CHILD_REGISTRATION_REQUIRED');
    if ([...this.children].some(entry => entry.child === child) || [...this.controlChildren.values()].some(entry => entry.child === child)) hold('SESSION_DUPLICATE_CHILD_REGISTRATION');
    const entry = { child, pid: child.pid, observer, work: null };
    // Exit alone does not settle inherited stdout/stderr held by descendants.
    // Register while the original child is live and retain debt through close.
    // An error or an exit code cannot prove a previously missed close event.
    entry.work = new Promise(resolve => child.once('close', resolve)); this.children.add(entry);
    entry.work.then(() => this.children.delete(entry));
    return { pid: child.pid, registered: true };
  }
  registerObserverChild(child) {
    const args = child.spawnargs;
    if (!Array.isArray(args) || args.length !== 6 || args[0] !== '/usr/bin/docker' || args[1] !== 'events'
      || args[2] !== '--since' || !iso(args[3]) || args[4] !== '--format' || args[5] !== replacementEventFormat) hold('SESSION_FIXED_OBSERVER_REQUIRED');
    return this.#registerChild(child, true);
  }
  producer(name, request) {
    if (this.fatal) throw this.fatal;
    return this.track(`PRODUCER_${name}`, async () => {
      const registration = { active: true, name, stateDigest: request.state?.stateDigest, lease: null };
      if (name === 'registerStartedCandidate') this.#controlRegistrations.add(registration);
      try {
        const result = await this.producers[name]({ ...request, registerOwnedChild: child => this.registerOwnedChild(child),
          ...(name === 'registerStartedCandidate' ? { registerControlSession: (session, lease) => this.registerControlSession(session, lease, registration) } : {}) });
        if (registration.lease && result?.lease !== registration.lease) hold('SESSION_CONTROL_LEASE_HANDOFF_CHANGED');
        this.assertNoActiveChildren({ allowObservers: true }); return result;
      } finally { registration.active = false; this.#controlRegistrations.delete(registration); }
    });
  }
  registerControlSession(session, lease, registration) {
    if (!(session instanceof DockerPostgresControlSession) || session.handshakeVerified !== true || !session.connected() || !(session.child instanceof ChildProcess)
      || !Number.isSafeInteger(session.child.pid) || session.child.pid < 1 || session.child.exitCode !== null
      || session.child.signalCode !== null || session.child.killed || this.fatal) hold('SESSION_REAL_CONTROL_SESSION_REQUIRED');
    if (this.stage !== 'START_CANDIDATE' || this.closingControls || this.controlSessions.size
      || !this.#controlRegistrations.has(registration) || registration?.active !== true || registration.name !== 'registerStartedCandidate'
      || !lease || typeof lease.observe !== 'function' || typeof lease.close !== 'function') hold('SESSION_CONTROL_HANDOFF_PHASE_OR_DUPLICATE');
    this.rawStore.assertCurrent(); const state = this.rawStore.readState();
    if (state?.phase !== 'CANDIDATE_REPLACED' || state.stateDigest !== registration.stateDigest) hold('SESSION_CONTROL_HANDOFF_STATE_CHANGED');
    this.rawStore.assertOwnedIntent('START_CANDIDATE', 'CANDIDATE_REPLACED', state.stateDigest);
    const child = session.child;
    const pending = [...this.children].filter(entry => entry.child === child && entry.observer === false);
    if (pending.length !== 1) hold('SESSION_PENDING_CONTROL_CHILD_REQUIRED');
    // Transfer ownership, never drop it: handshake work starts in the ordinary
    // child set; the connected lease keeps its original child and close waiter.
    const entry = { child, pid: child.pid, work: new Promise(resolve => child.once('close', resolve)) };
    this.controlChildren.set(session, entry); this.children.delete(pending[0]);
    registration.lease = lease; this.pendingLease = lease;
    this.controlSessions.add(session);
    const lost = () => {
      if (!this.closingControls) { this.fatal ||= new Error('MAINTENANCE_HOLD=SESSION_CONTROL_PROCESS_LOST'); this.activeController?.abort(); }
    };
    child.once('exit', lost); child.once('error', lost);
  }
  assertNoActiveChildren({ allowObservers = false } = {}) {
    if ([...this.children].some(child => !allowObservers || !child.observer)) hold('SESSION_ACTIVE_EFFECT_CHILD');
    this.assertControlSessionsLive();
  }
  assertControlSessionsLive() {
    for (const session of this.controlSessions) {
      const original = this.controlChildren.get(session);
      if (!this.closingControls && (!original || session.child !== original.child || original.child.killed
        || original.child.exitCode !== null || original.child.signalCode !== null || !session.connected())) hold('SESSION_CONTROL_PROCESS_LOST');
    }
  }
  async boundedCleanup(action) {
    const controller = new AbortController(); let timer;
    try { return await Promise.race([Promise.resolve().then(() => action({ signal: controller.signal, timeoutMs: this.cleanupTimeoutMs })),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('MAINTENANCE_HOLD=SESSION_CLEANUP_TIMEOUT')); }, this.cleanupTimeoutMs); })]); }
    finally { clearTimeout(timer); }
  }
  async knownWorkSettled() {
    await this.boundedCleanup(() => Promise.allSettled([...this.actions, ...this.pendingReads, ...this.children].map(entry => entry.work)));
    if (this.actions.size || this.pendingReads.size || this.children.size) hold('SESSION_KNOWN_WORK_NOT_SETTLED');
  }
  async evidence(envelope, kind, options = {}) {
    const body = validateMaintenanceEvidence(envelope, kind, this.context, this.now());
    if (await this.verifyEvidence(envelope, { ...options, kind, context: this.context, bindingDigest: bindingDigest(this.context) }) !== true) hold('SESSION_EVIDENCE_UNVERIFIED');
    return body;
  }
  async cleanupEvidence(envelope, kind) {
    // Termination/release proof may arrive after the maintenance deadline. It
    // grants no business effect, OPEN, rollback or future release permission.
    const { evidenceSha256, ...content } = envelope || {};
    if (content.schema !== MAINTENANCE_EVIDENCE_SCHEMA || content.kind !== kind || content.bindingDigest !== bindingDigest(this.context)
      || !HASH.test(evidenceSha256 || '') || canonicalDigest(content) !== evidenceSha256 || !iso(content.capturedAt)
      || Date.parse(content.capturedAt) < Date.parse(this.context.window.start) || Date.parse(content.capturedAt) > this.now()
      || await this.boundedCleanup(options => this.verifyEvidence(envelope, { ...options, kind, context: this.context, purpose: 'OWNED_RESOURCE_CLEANUP_ONLY' })) !== true) hold('SESSION_CLEANUP_PROOF_UNVERIFIED');
    return content.body;
  }
  async assertJoined(envelope) {
    const joined = await this.cleanupEvidence(envelope, 'SESSION_CHILDREN_JOINED');
    if (joined.owner !== this.context.owner || joined.stage !== this.stage || joined.allOwnedChildrenObserved !== true
      || joined.activeMutators !== 0 || joined.activeReadProbes !== 0 || joined.outstandingChildren !== 0 || joined.detachedEffects !== false || !HASH.test(joined.childInventorySha256 || '')) hold('SESSION_CHILDREN_NOT_JOINED');
    return joined;
  }
  incident(kind, details) {
    if (!this.rawStore.assertCurrent({ allowAbsent: true })) {
      if (this.reservation) {
        const marker = this.rawStore.read(this.rawStore.markerFile);
        if (!same(marker, this.reservation)) hold('SESSION_INCIDENT_OWNER_UNVERIFIED');
      } else {
        const state = this.rawStore.readState();
        if (state?.phase !== 'COMPLETED_OPEN' || state.status !== 'SUCCESS') hold('SESSION_INCIDENT_OWNER_UNVERIFIED');
        const archived = this.rawStore.read(path.join(this.rawStore.directory, `maintenance-owner-${this.context.owner}-${state.stateDigest}.json`));
        if (archived.owner !== this.context.owner || archived.contextDigest !== bindingDigest(this.context)) hold('SESSION_INCIDENT_OWNER_UNVERIFIED');
      }
    }
    this.rawStore.immutable(path.join(this.rawStore.directory, `maintenance-session-${kind.toLowerCase().replaceAll('_', '-')}-${this.context.owner}.json`), {
      schema: 'phoenix.maintenance-session-incident/v1', kind, owner: this.context.owner, contextDigest: bindingDigest(this.context),
      stage: this.stage, capturedAt: new Date(this.now()).toISOString(), automaticRecoveryAttempted: false,
      recovery: 'INDEPENDENT_READONLY_REINSPECT_AND_MANUAL_CONTROLLED_RECOVERY', ...details });
  }
  async step(name, action) {
    this.stage = name; await this.checked(); this.assertNoActiveChildren();
    const controller = new AbortController(); this.activeController = controller;
    const remaining = Math.min(this.stepTimeoutMs, Date.parse(this.context.window.end) - this.now()); let timer;
    try {
      const result = await Promise.race([this.track(`STEP_${name}`, () => action(controller.signal)), new Promise((_, reject) => {
        timer = setTimeout(() => { const error = new Error('MAINTENANCE_HOLD=SESSION_WINDOW_TIMEOUT'); this.fatal ||= error; controller.abort(); reject(error); }, Math.max(1, remaining));
      })]); await this.checked(); this.assertNoActiveChildren(); return result;
    }
    finally { clearTimeout(timer); if (this.activeController === controller) this.activeController = null; }
  }
  async admission(request, budget = 60000) {
    await this.checked();
    return this.admit({ context: this.context, approval: this.plan.approval, operation: request.operation,
      expectedPhase: request.state.phase, expectedStateDigest: request.state.stateDigest, requiredBudgetMs: budget });
  }
  async verifyLease() {
    this.assertControlSessionsLive();
    if (!this.lease || typeof this.lease.observe !== 'function' || typeof this.lease.close !== 'function') hold('SESSION_PERSISTENT_CANDIDATE_LEASE_REQUIRED');
    // Observe + structural validation + independent verification form ONE owned
    // probe. A hung verifier remains registered after its deadline; a zero-child
    // receipt cannot erase it or permit lease release.
    return this.boundedRead('CANDIDATE_LEASE_PROBE', async options => {
      const proof = await this.lease.observe(options);
      const body = await this.evidence(proof, 'CANDIDATE_CONTROL_LEASE', options);
      const candidate = this.engine.receipt(this.store.readState(), 'CANDIDATE_FENCED').body;
      if (!runtimeSame(body.api, candidate.api) || body.bootId !== candidate.bootId || body.owner !== this.context.owner
        || body.phase !== 'FENCED' || body.admissionExclusive !== true || body.executionExclusive !== true || body.connected !== true
        || body.admissionState !== 'DENIED' || body.inFlight !== 0 || body.pendingChildren !== 0 || body.taskGraphs !== 0
        || body.poisoned !== false || body.stopping !== false || body.continuousIngress !== true || body.unknownExecutors !== 0
        || !same(body.controlSession, candidate.controlSession)) hold('SESSION_CANDIDATE_LEASE_LOST');
      this.assertControlSessionsLive(); return proof;
    });
  }
  startMonitor() {
    if (this.monitor || this.monitorBusy || this.#phaseCommit || this.fatal) hold('SESSION_MONITOR_START_STATE');
    const generation = ++this.monitorGeneration;
    this.monitor = setInterval(() => {
      if (!this.monitor || generation !== this.monitorGeneration || this.monitorBusy || this.fatal) return; this.monitorBusy = true;
      this.monitorTask = this.track('MONITOR_PROBE', async () => {
        try { await this.checked(); if (this.lease) await this.verifyLease(); }
        catch (error) { this.fatal ||= error; this.activeController?.abort(); }
        finally { this.monitorBusy = false; }
      });
    }, this.pollMs); this.monitor.unref();
  }
  async stopMonitor() {
    ++this.monitorGeneration;
    if (this.monitor) clearInterval(this.monitor); this.monitor = null;
    // An in-progress read/lease probe must finish before a deliberate OPEN.
    if (this.monitorBusy) {
      try {
        if (!this.monitorTask) hold('SESSION_MONITOR_TASK_UNREGISTERED');
        await this.boundedCleanup(() => this.monitorTask);
      } catch {
        this.monitorStopUnknown = true;
        this.fatal ||= new Error('MAINTENANCE_HOLD=SESSION_MONITOR_STOP_UNVERIFIED');
        for (const read of this.pendingReads) read.controller.abort(); this.activeController?.abort();
        throw this.fatal;
      }
    }
    if (this.fatal) throw this.fatal;
  }
  async pauseMonitorForPhaseCommit({ from, to, expectedStateDigest }) {
    if (this.#phaseCommit || !this.monitor || !this.lease || !HASH.test(expectedStateDigest || '')
      || !((from === 'CANDIDATE_FENCED' && to === 'VERIFIED_FENCED') || (from === 'VERIFIED_FENCED' && to === 'COMPLETED_OPEN'))) hold('SESSION_PHASE_COMMIT_REQUEST');
    const before = this.rawStore.readState();
    if (before?.phase !== from || before.status !== 'FENCED' || before.stateDigest !== expectedStateDigest) hold('SESSION_PHASE_COMMIT_STATE');
    let operationIntent = null;
    if (from === 'CANDIDATE_FENCED') {
      const marker = this.rawStore.assertOwnedIntent('VERIFY_CANDIDATE', from, expectedStateDigest);
      const fields = ['schema', 'owner', 'contextDigest', 'operation', 'from', 'to', 'previousStateDigest', 'startedAt'];
      if (marker.to !== to || !same(Object.keys(marker).sort(), fields.sort()) || !iso(marker.startedAt)
        || Date.parse(marker.startedAt) < Date.parse(before.updatedAt) || Date.parse(marker.startedAt) >= Date.parse(this.context.window.end)) hold('SESSION_PHASE_COMMIT_INTENT');
      operationIntent = marker;
    } else this.rawStore.assertNoPending();
    const token = Object.freeze({});
    const barrier = { token, from, to, before, operationIntent, lease: this.lease, generation: null };
    this.#phaseCommit = barrier;
    await this.stopMonitor();
    await this.checked(); await this.verifyLease(); await this.checked();
    const currentIntent = fs.existsSync(this.rawStore.markerFile) ? this.rawStore.read(this.rawStore.markerFile) : null;
    if (this.lease !== barrier.lease || !same(this.rawStore.readState(), before) || !same(currentIntent, operationIntent)
      || this.monitor || this.monitorBusy) hold('SESSION_PHASE_COMMIT_CHANGED');
    barrier.generation = this.monitorGeneration;
    return token;
  }
  async resumeMonitorAfterPhaseCommit(token) {
    const barrier = this.#phaseCommit;
    if (!barrier || barrier.token !== token || barrier.from !== 'CANDIDATE_FENCED' || barrier.to !== 'VERIFIED_FENCED'
      || barrier.generation !== this.monitorGeneration || this.monitor || this.monitorBusy || this.lease !== barrier.lease) hold('SESSION_PHASE_COMMIT_RESUME');
    await this.checked(); this.rawStore.assertNoPending();
    const after = this.rawStore.readState();
    if (after?.phase !== barrier.to || after.status !== 'FENCED' || after.receipts.length !== barrier.before.receipts.length + 1
      || !same(after.receipts.slice(0, -1), barrier.before.receipts)) hold('SESSION_PHASE_COMMIT_RESULT');
    const intent = this.rawStore.read(path.join(this.rawStore.directory, `maintenance-intent-${this.context.owner}-${after.stateDigest}.json`));
    if (!same(intent, barrier.operationIntent) || intent.schema !== 'phoenix.maintenance-intent/v1' || intent.owner !== this.context.owner || intent.contextDigest !== bindingDigest(this.context)
      || intent.operation !== 'VERIFY_CANDIDATE' || intent.from !== barrier.from || intent.to !== barrier.to
      || intent.previousStateDigest !== barrier.before.stateDigest || this.rawStore.readReceipt(after.receipts.at(-1)).kind !== 'VERIFIED_FENCED') hold('SESSION_PHASE_COMMIT_ARCHIVE');
    // This still requires the actual lease implementation to support the new
    // committed phase; a missing composite bridge must HOLD, never be bypassed.
    await this.verifyLease(); await this.checked(); this.rawStore.assertNoPending();
    if (this.#phaseCommit !== barrier || !same(this.rawStore.readState(), after) || this.lease !== barrier.lease
      || this.monitor || this.monitorBusy || barrier.generation !== this.monitorGeneration) hold('SESSION_PHASE_COMMIT_CHANGED');
    this.#phaseCommit = null; this.startMonitor();
  }
  assertOpenCommitBarrier(request) {
    const barrier = this.#phaseCommit;
    if (!barrier || barrier.from !== 'VERIFIED_FENCED' || barrier.to !== 'COMPLETED_OPEN' || barrier.generation !== this.monitorGeneration
      || this.monitor || this.monitorBusy || this.lease !== barrier.lease) hold('SESSION_OPEN_COMMIT_BARRIER');
    const marker = this.rawStore.assertOwnedEffectState('OPEN_CANDIDATE', request.state);
    if (!same(marker.previousState, barrier.before) || marker.previousStateDigest !== barrier.before.stateDigest) hold('SESSION_OPEN_COMMIT_BARRIER');
  }
  adapters() {
    return {
      fenceIngress: async request => { await this.admission(request); const result = await this.producer('fenceIngress', { ...request, signal: this.activeController?.signal }); await this.checked(); return result; },
      stopLegacy: async request => { await this.admission(request); const result = await this.producer('stopLegacy', { ...request, signal: this.activeController?.signal }); await this.checked(); return result; },
      preparePromotion: async request => {
        await this.admission(request); const bootstrap = await this.publicControl.bootstrap(); await this.evidence(bootstrap, 'LEGACY_PUBLIC_FENCED');
        await this.admission(request);
        const result = await this.producer('preparePromotion', { ...request, files: this.files, bootstrap, signal: this.activeController?.signal }); await this.checked(); return result;
      },
      replaceCandidate: async request => {
        await this.admission(request);
        const isolation = await this.producer('captureReplacementIsolation', request); await this.evidence(isolation, 'INGRESS_FENCE');
        const prerequisites = { stopped: this.engine.receipt(request.state, 'STOP_LEGACY'), reconciliation: this.engine.receipt(request.state, 'RECONCILIATION'),
          recovery: this.engine.receipt(request.state, 'RECOVERY_MATERIAL'), isolation };
        const replacement = this.makeReplacement({ context: this.context, approval: this.plan.approval, state: request.state,
          project: this.context.replacement.project, prerequisites });
        const envelope = await replacement.replace(); await this.checked(); validateCandidateReplacement(envelope, this.context, { now: this.now() });
        return envelope;
      },
      startCandidate: async request => {
        await this.admission(request); const replacement = this.engine.receipt(request.state, 'CANDIDATE_REPLACEMENT');
        const result = await this.producer('registerStartedCandidate', { ...request, replacement, signal: this.activeController?.signal });
        if (!result?.lease || typeof result.lease.observe !== 'function' || typeof result.lease.close !== 'function') hold('SESSION_PERSISTENT_CANDIDATE_LEASE_REQUIRED');
        this.pendingLease = result.lease; await this.evidence(result.evidence, 'CANDIDATE_FENCED'); await this.checked(); return result.evidence;
      },
      verifyCandidate: async request => {
        await this.admission(request); await this.verifyLease();
        const adoption = await this.producer('collectAdoption', request);
        const adopted = await this.publicControl.adoptCandidate(adoption); await this.evidence(adopted, 'CANDIDATE_PUBLIC_ADOPTED');
        await this.verifyLease(); await this.admission(request);
        await this.producer('capturePostAndStartup', { ...request, files: this.files, signal: this.activeController?.signal });
        const formal = await this.verifyFormalFiles(); await this.verifyLease(); await this.admission(request);
        await this.producer('completeFormalDeployment', { ...request, files: this.files, formal, signal: this.activeController?.signal });
        const candidate = this.engine.receipt(request.state, 'CANDIDATE_FENCED').body;
        if (await this.verifyFormalCompletion(candidate, adoption.participants) !== true) hold('SESSION_FORMAL_SUCCESS_REQUIRED');
        await this.verifyLease();
        const result = await this.producer('collectVerifiedCandidate', { ...request, formal, adopted, signal: this.activeController?.signal });
        const body = await this.evidence(result, 'VERIFIED_FENCED');
        if (body.startupEvidenceSha256 !== formal.digests.log || body.preSnapshotSha256 !== formal.digests.pre || body.postSnapshotSha256 !== formal.digests.post) hold('SESSION_VERIFIED_ARTIFACT_BINDING');
        await this.checked();
        await this.pauseMonitorForPhaseCommit({ from: 'CANDIDATE_FENCED', to: 'VERIFIED_FENCED', expectedStateDigest: request.state.stateDigest });
        return result;
      },
      openCandidate: async request => {
        request = { ...request, operation: 'OPEN_CANDIDATE' };
        this.assertOpenCommitBarrier(request); await this.admission(request); await this.verifyLease();
        const candidate = this.engine.receipt(request.state, 'CANDIDATE_FENCED').body;
        const expectedParticipants = [{ containerId: candidate.api.id, revision: this.context.targetSha, bootId: candidate.bootId, allowedKinds: ['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION'] }];
        this.assertNoActiveChildren();
        if (await this.verifyFormalCompletion(candidate, expectedParticipants) !== true) hold('SESSION_FORMAL_SUCCESS_REQUIRED');
        let checkedAtPublication = false;
        const published = await this.producer('publishOpen', { ...request, signal: this.activeController?.signal, verifySuccess: async participants => {
          if (!same(participants, expectedParticipants)) hold('SESSION_OPEN_PARTICIPANTS_CHANGED');
          await this.checked(); await this.admission(request); await this.verifyLease();
          checkedAtPublication = await this.verifyFormalCompletion(candidate, participants) === true; this.assertNoActiveChildren(); return checkedAtPublication;
        } });
        if (!checkedAtPublication) hold('SESSION_OPEN_VERIFIER_NOT_CONSUMED');
        await this.checked(); this.assertNoActiveChildren(); return published;
      },
    };
  }
  async run() {
    if (this.used) hold('SESSION_ALREADY_USED'); this.used = true;
    let succeeded = false, childrenJoined = true;
    try {
      await this.checked(); this.modernAdmission();
      await this.boundedRead('INDEPENDENT_AUTHORITY', () => this.engine.approval(this.plan.approval, 'MAINTENANCE', payload => payload.protocol === 'STOP_AND_RECONCILE'
        && same(payload.operations, MAINTENANCE_OPERATIONS) && payload.recoveryPlanDigest === canonicalDigest(this.plan.recoveryPlan)
        && payload.preSnapshotDigest === canonicalDigest(this.context.preSnapshot)));
      if (uninstalledRegistries.has(this.producers)) hold('SESSION_PRODUCTION_REGISTRY_UNINSTALLED');
      // Reserve the existing durable transaction namespace BEFORE any producer
      // can launch a read helper. Ordinary releases already reject this marker.
      this.rawStore.beginMarker({ from: null, to: 'PREPARED', operation: 'SESSION_PREFLIGHT', previousStateDigest: null, startedAt: new Date(this.now()).toISOString() });
      this.reservation = this.rawStore.read(this.rawStore.markerFile); this.lifecycleStarted = true;
      await this.step('PREFLIGHT', async signal => {
        const evidence = await this.producer('assertReady', { context: this.context, scope: RELEASE_SCOPE, files: this.files, signal });
        const ready = await this.evidence(evidence, 'SESSION_PRODUCERS_READY');
        if (!same(ready.scope, RELEASE_SCOPE) || !same(ready.operations, MAINTENANCE_OPERATIONS)
          || ready.sourceHelperSha256 !== this.context.sourceHelperSha256 || ready.detachedEffects !== false) hold('SESSION_PRODUCER_INSTALLATION_UNPROVEN');
      });
      const pre = await this.step('CAPTURE_HEALTHY_PRE', async signal => ({ preEvidence: await this.producer('capturePre', { context: this.context, files: this.files, signal }),
        recoveryEvidence: await this.producer('captureRecovery', { context: this.context, recoveryPlan: this.plan.recoveryPlan, signal }) }));
      await this.step('PREFLIGHT_HANDOFF', async signal => {
        const envelope = await this.boundedCleanup(options => this.producers.abortAndJoin({ ...options, context: this.context, stage: this.stage, signal,
          pendingReadProbes: [...this.pendingReads].map(read => read.kind) }));
        await this.assertJoined(envelope); // All known work except this handoff itself is settled.
        if (this.children.size || this.pendingReads.size || [...this.actions].some(a => a.kind !== 'STEP_PREFLIGHT_HANDOFF')) hold('SESSION_PREFLIGHT_CHILDREN_REMAIN');
        const handoff = { schema: 'phoenix.maintenance-preflight-handoff/v1', owner: this.context.owner, contextDigest: bindingDigest(this.context), joined: envelope };
        this.store.immutable(path.join(this.store.directory, `maintenance-preflight-handoff-${this.context.owner}.json`), handoff);
        this.store.finishMarker({ stateDigest: canonicalDigest(handoff) }); this.reservation = null;
      });
      await this.step('PREPARE', () => this.engine.prepare({ ...pre, approval: this.plan.approval, recoveryPlan: this.plan.recoveryPlan }));
      this.startMonitor();
      await this.step('FENCE_INGRESS', () => this.engine.fenceIngress());
      await this.step('STOP_LEGACY', () => this.engine.stopLegacy());
      await this.step('RECONCILE', async signal => {
        const result = await this.producer('collectReconciliation', { context: this.context, state: this.store.readState(), signal });
        return this.engine.reconcile(result);
      });
      await this.step('PREPARE_PROMOTION', () => this.engine.preparePromotion());
      await this.step('REPLACE_CANDIDATE', () => this.engine.replaceCandidate());
      if (this.children.size) hold('SESSION_REPLACEMENT_CHILD_NOT_JOINED');
      await this.step('START_CANDIDATE', () => this.engine.startCandidate()); this.lease = this.pendingLease; this.pendingLease = null; await this.verifyLease();
      await this.step('VERIFY_CANDIDATE', () => this.engine.verifyCandidate());
      await this.resumeMonitorAfterPhaseCommit(this.#phaseCommit?.token);
      const completion = await this.step('READ_FORMAL_COMPLETION', async signal => {
        const envelope = await this.producer('readFormalCompletion', { context: this.context, state: this.store.readState(), signal });
        const body = await this.evidence(envelope, 'COMPLETION'); const formal = this.readFormalState();
        if (formal.outcome !== 'SUCCESS' || formal.target !== this.context.targetSha || formal.floorSha !== this.context.targetSha
          || body.successReceiptSha256 !== canonicalDigest(formal)) hold('SESSION_COMPLETION_NOT_FORMAL_RECEIPT');
        return envelope;
      });
      await this.pauseMonitorForPhaseCommit({ from: 'VERIFIED_FENCED', to: 'COMPLETED_OPEN', expectedStateDigest: this.rawStore.readState().stateDigest });
      const state = await this.step('OPEN_CANDIDATE', () => this.engine.complete({ completionEvidence: completion }));
      if (state.phase !== 'COMPLETED_OPEN' || state.status !== 'SUCCESS') hold('SESSION_NOT_COMPLETED');
      succeeded = true;
      this.completedResult = { schema: 'phoenix.legacy-maintenance-session-result/v1', owner: this.context.owner, contextDigest: bindingDigest(this.context),
        maintenanceStateDigest: state.stateDigest, formalDeploymentOutcome: 'SUCCESS', floorSha: this.context.targetSha,
        chanjetPolicy: 'HOLD', runMigration: false, webSwitched: false, legacyDrainResult: 'UNSUPPORTED', controlLeaseRelease: 'UNVERIFIED' };
      return this.completedResult;
    } catch (error) {
      this.fatal ||= error; this.activeController?.abort();
      for (const read of this.pendingReads) read.controller.abort();
      // A timed-out or failed child must be joined; no subsequent action is
      // issued. This typed producer cannot delete/clear/rollback any marker.
      if (this.lifecycleStarted || this.lease || this.pendingLease) {
        childrenJoined = false;
        try {
          const envelope = await this.boundedCleanup(options => this.producers.abortAndJoin({ ...options, context: this.context, stage: this.stage,
            pendingReadProbes: [...this.pendingReads].map(read => read.kind) }));
          await this.assertJoined(envelope); await this.knownWorkSettled();
          childrenJoined = true;
        } catch {}
        try { this.incident(childrenJoined ? 'HOLD' : 'CHILDREN_UNVERIFIED', { outcome: 'HOLD',
          childrenState: childrenJoined ? 'VERIFIED_JOINED' : 'UNKNOWN', leaseRelease: childrenJoined ? 'PENDING' : 'NOT_ATTEMPTED',
          actualLockState: 'UNKNOWN_REQUIRES_READONLY_REINSPECT', publicState: 'REQUIRES_READONLY_REINSPECT',
          requiredSafety: 'DURABLE_PUBLIC_DENY_AND_INDEPENDENT_EXTERNAL_ISOLATION',
          // Session locks may disappear on process/host crash. Never promise
          // continued ownership or protection from that unverified condition.
          locksSurviveProcessCrash: false }); } catch {}
      }
      if (!childrenJoined) hold('SESSION_CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED');
      throw error;
    } finally {
      try { await this.stopMonitor(); } catch {}
      if (this.monitorStopUnknown) {
        childrenJoined = false;
        try { this.incident('MONITOR_UNVERIFIED', { outcome: 'HOLD', childrenState: 'UNKNOWN', leaseRelease: 'NOT_ATTEMPTED',
          actualLockState: 'UNKNOWN_REQUIRES_READONLY_REINSPECT', publicState: 'REQUIRES_READONLY_REINSPECT' }); } catch {}
        hold('SESSION_CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED');
      }
      // Closing SQL locks never opens public control. Any unsuccessful result
      // retains public deny and immutable operation/maintenance evidence.
      if (succeeded || childrenJoined) {
        this.closingControls = true;
        for (const lease of [...new Set([this.lease, this.pendingLease].filter(Boolean))]) {
          try {
            const released = await this.cleanupEvidence(await this.boundedCleanup(options => lease.close({ ...options, succeeded })), 'CANDIDATE_CONTROL_RELEASED');
            if (released.owner !== this.context.owner || released.connected !== false || released.admissionExclusive !== false
              || released.executionExclusive !== false || released.ownedBackendGone !== true || !HASH.test(released.serverObservationSha256 || '')) hold('SESSION_LEASE_RELEASE_UNVERIFIED');
          } catch {
            // SUCCESS/public OPEN may already exist. Retain them truthfully;
            // append an incident instead of silently rewriting release history.
            try { this.incident('LEASE_RELEASE_UNVERIFIED', { formalDeploymentOutcome: succeeded ? 'SUCCESS' : 'NOT_COMPLETED',
              publicState: succeeded ? 'OPEN_ALREADY_PUBLISHED' : 'REQUIRES_READONLY_REINSPECT', leaseRelease: 'UNKNOWN',
              actualLockState: 'UNKNOWN_REQUIRES_READONLY_REINSPECT', outcome: 'MANUAL_RECOVERY_REQUIRED' }); } catch {}
            hold(succeeded ? 'SESSION_FORMAL_SUCCESS_LEASE_RELEASE_INCIDENT' : 'SESSION_HOLD_LEASE_RELEASE_INCIDENT');
          }
        }
        try {
          await this.boundedCleanup(() => Promise.all([...this.controlChildren.values()].map(entry => entry.work)));
        } catch {
          try { this.incident('CONTROL_CLIENTS_UNSETTLED', { formalDeploymentOutcome: succeeded ? 'SUCCESS' : 'NOT_COMPLETED',
            outcome: 'MANUAL_RECOVERY_REQUIRED', clientLifecycle: 'UNVERIFIED',
            serverReleaseEvidence: 'DOES_NOT_PROVE_CLIENT_SETTLEMENT' }); } catch {}
          hold(succeeded ? 'SESSION_FORMAL_SUCCESS_CONTROL_CLIENT_INCIDENT' : 'SESSION_HOLD_CONTROL_CLIENT_INCIDENT');
        }
        if (succeeded && this.completedResult) this.completedResult.controlLeaseRelease = 'VERIFIED_RELEASED';
      }
    }
  }
}

/** The only production entry reads one fixed root plan, not a caller's path.
 * It remains HOLD until the reviewed producer registry is implemented. */
export async function runProtectedMaintenanceSession() {
  verifyContext(CONTRACT.repository, CONTRACT.stateDirectory);
  if (!/^\d+-\d+$/.test(process.env.DEPLOY_RUN_ID || '')) hold('SESSION_OWNER_REQUIRED');
  const plan = secureJson(path.join(CONTRACT.stateDirectory, `maintenance-release-plan-${process.env.DEPLOY_RUN_ID}.json`));
  if (plan.context?.owner !== process.env.DEPLOY_RUN_ID) hold('SESSION_PLAN_OWNER_MISMATCH');
  return new LegacyMaintenanceDeploymentSession({ plan }).run();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== 'run') hold('SESSION_FIXED_COMMAND_REQUIRED');
    await runProtectedMaintenanceSession(); console.log('MAINTENANCE_SESSION=SUCCESS');
  } catch (error) {
    console.error(/^MAINTENANCE_HOLD=[A-Z0-9_]+$/.test(error.message) ? error.message : 'MAINTENANCE_HOLD=SESSION_VALIDATION_FAILED'); process.exitCode = 1;
    if (/SESSION_CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED|SESSION_(?:FORMAL_SUCCESS|HOLD)_(?:LEASE_RELEASE|CONTROL_CLIENT)_INCIDENT/.test(error.message)) {
      // Preserve this controller/FD9 for operator recovery. A process/host crash
      // can still release locks: durable markers/deny and external isolation
      // must be independently re-inspected, never assumed from this timer.
      console.error('MAINTENANCE_CONTROLLER=RETAINED_FOR_MANUAL_RECOVERY');
      setInterval(() => {}, 1000);
    }
  }
}
