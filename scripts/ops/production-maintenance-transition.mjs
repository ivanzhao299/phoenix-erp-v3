/** Separate legacy bootstrap protocol. It must NEVER be converted into the
 * modern coordinator's DRAINED receipt or passed to that coordinator as one. */
import { LEGACY_EVIDENCE_DOMAINS } from './background-control-legacy-transition.mjs';
import { MaintenanceReceiptStore, bindingDigest, canonicalDigest, same, hold, iso, HASH,
  validateMaintenanceContext, validateMaintenanceEvidence, validateRuntimePin, MAINTENANCE_AUTHORITY_SCHEMA } from './production-maintenance-receipts.mjs';

export const MAINTENANCE_PHASES = ['PREPARED', 'INGRESS_FENCED', 'STOPPING_LEGACY', 'STOPPED_UNRECONCILED', 'LEGACY_RECONCILED',
  'PROMOTION_PREPARED', 'CANDIDATE_REPLACED', 'CANDIDATE_FENCED', 'VERIFIED_FENCED', 'COMPLETED_OPEN'];
export const MAINTENANCE_OPERATIONS = ['FENCE_INGRESS', 'DISABLE_RESTART_POLICY', 'DISCONNECT_LEGACY_NETWORKS', 'STOP_LEGACY', 'RECONCILE', 'PREPARE_PROMOTION', 'REPLACE_CANDIDATE', 'START_CANDIDATE', 'VERIFY_CANDIDATE', 'OPEN_CANDIDATE'];
const OPERATIONS = MAINTENANCE_OPERATIONS;
const ids = pins => pins.map(p => p.id).sort();
const sameIds = (a, b) => same(ids(a), ids(b));
const zero = n => Number.isSafeInteger(n) && n === 0;
const sameRuntimeIdentity = (a, b) => ['id', 'imageId', 'revision', 'startedAt', 'restartCount'].every(key => a?.[key] === b?.[key]);
function validateCandidateBackground(body) {
  const session = body?.controlSession;
  if (![body?.inFlight, body?.pendingChildren, body?.taskGraphs].every(zero) || body.poisoned !== false || body.stopping !== false
    || !session || session.connected !== true || session.broken !== false || !iso(session.backendStartedAt)
    || ![session.sessionPid, session.databaseOid].every(value => Number.isSafeInteger(value) && value > 0)) hold('CANDIDATE_BACKGROUND_GRAPH_OR_SESSION_NOT_QUIESCENT');
}

export function validateRecoveryMaterial(plan, context) {
  if (!plan || plan.bindingDigest !== bindingDigest(context) || plan.strategy !== 'COMPATIBLE_CANDIDATE_OR_HOLD'
    || plan.automaticOldRuntimeRollback !== false || plan.automaticDatabaseRestore !== false || plan.businessReplay !== false
    || typeof plan.responsibleOperator !== 'string' || !plan.responsibleOperator.trim() || !HASH.test(plan.procedureSha256)
    || !Array.isArray(plan.materials) || !plan.materials.length || plan.materials.some(m => !HASH.test(m.sha256) || !['CANDIDATE_IMAGE', 'SOURCE_HELPERS', 'PRE_SNAPSHOT', 'RECOVERY_PROCEDURE'].includes(m.kind))
    || !['CANDIDATE_IMAGE', 'SOURCE_HELPERS', 'PRE_SNAPSHOT', 'RECOVERY_PROCEDURE'].every(kind => plan.materials.some(m => m.kind === kind))
    || !plan.materials.some(m => m.kind === 'CANDIDATE_IMAGE' && m.imageId === context.candidate.imageId && m.revision === context.targetSha)
    || !plan.materials.some(m => m.kind === 'SOURCE_HELPERS' && m.sha256 === context.sourceHelperSha256)
    || !plan.materials.some(m => m.kind === 'PRE_SNAPSHOT' && m.sha256 === canonicalDigest(context.preSnapshot))
    || !plan.materials.some(m => m.kind === 'RECOVERY_PROCEDURE' && m.sha256 === plan.procedureSha256)
    || !Array.isArray(plan.stopConditions) || !['INGRESS_LOST', 'UNKNOWN_SIDE_EFFECTS', 'CANDIDATE_FAILED', 'FLOOR_STATE_INCONSISTENT'].every(x => plan.stopConditions.includes(x))) hold('RECOVERY_MATERIAL_REQUIRED_BEFORE_STOP');
  return plan;
}
export function validateHealthyPre(body, context) {
  if (!body || body.healthy !== true || !same(body.runtime, context.preSnapshot)
    || body.schemaEvidenceSha256 !== context.schemaEvidenceSha256 || !Array.isArray(body.migrationPaths) || body.migrationPaths.length
    || body.unfinishedTransaction !== false || body.chanjetPolicy !== 'HOLD' || body.readonlySync !== false || body.inboundSync !== false) hold('HEALTHY_PRE_AND_SCHEMA_REQUIRED');
  for (const service of ['api', 'web', 'db']) validateRuntimePin(body.runtime[service], { revision: service !== 'db', healthy: true });
  const inventory = body.inventory;
  if (!inventory || inventory.hostInventoryComplete !== true || !zero(inventory.unaccountedExecutors)
    || !Array.isArray(inventory.dockerExecutorIds) || !same([...inventory.dockerExecutorIds].sort(), ids(context.executors))
    || !Array.isArray(inventory.allDockerIds) || !Array.isArray(inventory.classifiedNonExecutorIds)
    || inventory.allDockerIds.some(id => !HASH.test(id)) || inventory.classifiedNonExecutorIds.some(id => !HASH.test(id))
    || new Set(inventory.allDockerIds).size !== inventory.allDockerIds.length
    || !same([...inventory.allDockerIds].sort(), [...inventory.dockerExecutorIds, ...inventory.classifiedNonExecutorIds].sort())) hold('COMPLETE_EXECUTOR_INVENTORY_REQUIRED');
}
export function validateIngressFence(body, context, now) {
  if (!body || body.state !== 'FROZEN' || body.continuous !== true || !iso(body.enforcedAt) || !iso(body.lastVerifiedAt)
    || !iso(body.leaseExpiresAt) || Date.parse(body.enforcedAt) < Date.parse(context.window.start)
    || Date.parse(body.lastVerifiedAt) < Date.parse(body.enforcedAt) || Date.parse(body.lastVerifiedAt) > now || Date.parse(body.leaseExpiresAt) <= now
    || Date.parse(body.leaseExpiresAt) > Date.parse(context.window.end) || !/^[A-Za-z0-9_.:-]{1,160}$/.test(body.mechanismId || '')
    || body.revival?.state !== 'ENFORCED' || body.revival.restartPolicy !== 'no' || body.revival.orchestratorsDisabled !== true
    || !Array.isArray(body.revival.executorIds) || !same([...body.revival.executorIds].sort(), ids(context.executors))) hold('CONTINUOUS_INGRESS_AND_NO_REVIVAL_REQUIRED');
}
export function validateStoppedLegacy(body, context, ingressDigest, now) {
  if (!body || body.protocol !== 'STOP_AND_RECONCILE' || body.legacyDrainResult !== 'UNSUPPORTED' || body.ingressFenceDigest !== ingressDigest
    || !Array.isArray(body.executors) || !sameIds(body.executors, context.executors)) hold('LEGACY_STOP_PROOF_REQUIRED');
  for (const p of body.executors) {
    const before = context.executors.find(x => x.id === p.id);
    if (!same(p.before, before)) hold('LEGACY_EXECUTOR_CHANGED');
    for (const sample of [p.first, p.second]) {
      validateRuntimePin(sample);
      if (sample.id !== before.id || sample.imageId !== before.imageId || sample.revision !== before.revision || sample.startedAt !== before.startedAt
        || sample.restartCount !== before.restartCount || sample.running !== false || sample.pid !== 0 || sample.status !== 'exited'
        || sample.restarting !== false || sample.dead !== false || !Number.isSafeInteger(sample.exitCode) || typeof sample.oomKilled !== 'boolean'
        || !iso(sample.checkedAt) || Date.parse(sample.checkedAt) < Date.parse(context.window.start) || Date.parse(sample.checkedAt) > now) hold('STOPPED_IDENTITY_OR_NO_REVIVAL_REQUIRED');
    }
    if (Date.parse(p.second.checkedAt) - Date.parse(p.first.checkedAt) < 1000) hold('STOP_OBSERVATION_INTERVAL_REQUIRED');
  }
  const db = body.database;
  if (!db || db.ownershipComplete !== true || ![db.remainingConnections, db.openTransactions, db.preparedTransactions, db.persistentRunning, db.persistentQueued].every(zero)) hold('DATABASE_AND_PERSISTENT_TASKS_NOT_QUIESCENT');
}

/** This engine persists intent before every effect. Any interrupted effect leaves
 * the marker in place; there is no timeout, restart, retry or automatic unfence. */
export class LegacyMaintenanceTransition {
  constructor({ context }, dependencies = {}) {
    validateMaintenanceContext(context); this.context = structuredClone(context); this.digest = bindingDigest(context);
    this.store = dependencies.store || new MaintenanceReceiptStore(context);
    this.verifyAuthority = dependencies.verifyAuthority || (async () => false);
    this.verifyEvidence = dependencies.verifyEvidence || (async () => false);
    this.adapters = dependencies.adapters || {}; this.now = dependencies.now || Date.now;
    this.failurePoint = dependencies.failurePoint || (() => {});
  }
  checkWindow() { const now = this.now(); if (now < Date.parse(this.context.window.start) || now >= Date.parse(this.context.window.end)) hold('MAINTENANCE_WINDOW_CLOSED'); return now; }
  async approval(approval, purpose, payloadCheck) {
    const r = approval?.serverRecord;
    if (approval?.schema !== MAINTENANCE_AUTHORITY_SCHEMA || approval.bindingDigest !== this.digest || approval.purpose !== purpose
      || approval.decision !== 'APPROVED' || !HASH.test(approval.payloadSha256) || canonicalDigest(approval.payload) !== approval.payloadSha256
      || !r || r.state !== 'APPROVED' || r.commitId !== this.context.targetSha || !iso(r.submittedAt)
      || Date.parse(r.submittedAt) > this.now() || typeof r.reviewer !== 'string' || !r.reviewer || typeof r.author !== 'string' || !r.author
      || r.reviewer.toLowerCase() === r.author.toLowerCase() || !HASH.test(r.rawRecordSha256)
      || !payloadCheck(approval.payload) || await this.verifyAuthority(approval, { purpose, bindingDigest: this.digest, targetSha: this.context.targetSha, context: this.context }) !== true) hold('INDEPENDENT_AUTHORITY_UNIMPLEMENTED_OR_REJECTED');
    return approval;
  }
  async evidence(envelope, kind) {
    const body = validateMaintenanceEvidence(envelope, kind, this.context, this.now());
    if (await this.verifyEvidence(envelope, { kind, bindingDigest: this.digest, context: this.context }) !== true) hold('INDEPENDENT_EVIDENCE_UNIMPLEMENTED_OR_REJECTED');
    return body;
  }
  state(phase) {
    this.checkWindow(); this.store.assertNoPending(); this.store.assertCurrent(); const state = this.store.readState();
    if (!state || state.phase !== phase || !MAINTENANCE_PHASES.includes(state.phase) || state.status === 'SUCCESS') hold('PHASE_OR_RESUME_MISMATCH');
    return state;
  }
  receipt(state, kind) { const ref = [...state.receipts].reverse().find(ref => this.store.readReceipt(ref).kind === kind); if (!ref) hold('PRIOR_RECEIPT_REQUIRED'); return this.store.readReceipt(ref).payload; }
  async authorityStillValid(state) {
    const a = this.receipt(state, 'MAINTENANCE_AUTHORITY');
    await this.approval(a, 'MAINTENANCE', p => p.protocol === 'STOP_AND_RECONCILE' && same(p.operations, OPERATIONS)
      && p.recoveryPlanDigest === state.recoveryPlanDigest && p.preSnapshotDigest === canonicalDigest(this.context.preSnapshot));
  }
  async prepare({ approval, preEvidence, recoveryPlan, recoveryEvidence }) {
    this.checkWindow(); this.store.assertNoPending(); if (this.store.readState()) hold('MAINTENANCE_RUN_REUSED');
    validateRecoveryMaterial(recoveryPlan, this.context); const recoveryPlanDigest = canonicalDigest(recoveryPlan);
    await this.approval(approval, 'MAINTENANCE', p => p.protocol === 'STOP_AND_RECONCILE' && same(p.operations, OPERATIONS)
      && p.recoveryPlanDigest === recoveryPlanDigest && p.preSnapshotDigest === canonicalDigest(this.context.preSnapshot));
    validateHealthyPre(await this.evidence(preEvidence, 'PRE'), this.context);
    const recovery = await this.evidence(recoveryEvidence, 'RECOVERY_MATERIAL');
    if (recovery.planDigest !== recoveryPlanDigest || recovery.materialsAvailable !== true || recovery.compatibleCandidateImageId !== this.context.candidate.imageId
      || recovery.procedureSha256 !== recoveryPlan.procedureSha256 || recovery.operatorConfirmed !== recoveryPlan.responsibleOperator) hold('RECOVERY_MATERIAL_NOT_INDEPENDENTLY_VERIFIED');
    this.checkWindow(); this.store.claimCurrent(new Date(this.now()).toISOString());
    this.store.beginMarker({ from: null, to: 'PREPARED', operation: 'PREPARE', previousStateDigest: null, startedAt: new Date(this.now()).toISOString() });
    this.failurePoint('AFTER_INTENT');
    let state = { schema: 'phoenix.legacy-maintenance-state/v1', context: this.context, contextDigest: this.digest, phase: 'PREPARED', status: 'FENCED_PREPARATION',
      legacyDrainResult: 'UNSUPPORTED', recoveryPlanDigest, receipts: [], updatedAt: new Date(this.now()).toISOString() };
    for (const [kind, payload] of [['MAINTENANCE_AUTHORITY', approval], ['RECOVERY_PLAN', recoveryPlan], ['PRE', preEvidence], ['RECOVERY_MATERIAL', recoveryEvidence]]) {
      state.receipts.push(this.store.appendReceipt(kind, payload, state, state.updatedAt));
    }
    state = this.store.writeState(state); this.failurePoint('AFTER_COMMIT'); this.store.finishMarker(state); return state;
  }
  async effect({ from, to, operation, method, kind, validate, status = 'FENCED', effectPhase, precondition }) {
    let state = this.state(from); await this.authorityStillValid(state);
    if (typeof this.adapters[method] !== 'function') hold(`ADAPTER_${operation}_UNIMPLEMENTED`);
    if (precondition) await precondition(state);
    this.checkWindow();
    this.store.beginMarker({ from, to, operation, previousStateDigest: state.stateDigest, ...(effectPhase ? { effectPhase } : {}), startedAt: new Date(this.now()).toISOString() });
    const operationIntent = this.store.assertOwnedIntent(operation, from, state.stateDigest);
    this.failurePoint('AFTER_INTENT');
    this.checkWindow();
    const envelope = await this.adapters[method]({ context: structuredClone(this.context), contextDigest: this.digest, state: structuredClone(state), operation, operationIntent: structuredClone(operationIntent) });
    this.failurePoint('AFTER_EFFECT'); this.checkWindow();
    const body = await this.evidence(envelope, kind); await validate(body, state);
    const ref = this.store.appendReceipt(kind, envelope, state, new Date(this.now()).toISOString()); this.failurePoint('AFTER_RECEIPT');
    const { stateDigest, ...content } = state;
    state = this.store.writeState({ ...content, phase: to, status, receipts: [...state.receipts, ref], updatedAt: new Date(this.now()).toISOString() });
    this.failurePoint('AFTER_COMMIT'); this.store.finishMarker(state); return state;
  }
  fenceIngress() { return this.effect({ from: 'PREPARED', to: 'INGRESS_FENCED', operation: 'FENCE_INGRESS', method: 'fenceIngress', kind: 'INGRESS_FENCE', validate: body => validateIngressFence(body, this.context, this.now()) }); }
  stopLegacy() {
    return this.effect({ from: 'INGRESS_FENCED', to: 'STOPPED_UNRECONCILED', effectPhase: 'STOPPING_LEGACY', operation: 'STOP_LEGACY', method: 'stopLegacy', kind: 'STOP_LEGACY', status: 'HOLD_RECONCILIATION_REQUIRED',
      precondition: async state => {
        const ingress = this.receipt(state, 'INGRESS_FENCE'); validateIngressFence(await this.evidence(ingress, 'INGRESS_FENCE'), this.context, this.now());
        const plan = this.receipt(state, 'RECOVERY_PLAN'); validateRecoveryMaterial(plan, this.context);
        await this.evidence(this.receipt(state, 'RECOVERY_MATERIAL'), 'RECOVERY_MATERIAL');
      },
      validate: (body, state) => { const ingress = this.receipt(state, 'INGRESS_FENCE'); validateIngressFence(ingress.body, this.context, this.now()); validateStoppedLegacy(body, this.context, ingress.evidenceSha256, this.now()); } });
  }
  async reconcile({ evidence, unknownApprovals = [] }) {
    const state = this.state('STOPPED_UNRECONCILED'); await this.authorityStillValid(state);
    const body = await this.evidence(evidence, 'RECONCILIATION');
    const authority = this.receipt(state, 'MAINTENANCE_AUTHORITY');
    if (!Array.isArray(body.domains) || body.domains.length !== LEGACY_EVIDENCE_DOMAINS.length || body.approvedScopeDigest !== authority.payloadSha256
      || new Set(body.domains.map(d => d.domain)).size !== LEGACY_EVIDENCE_DOMAINS.length) hold('FIVE_RECONCILIATION_DOMAINS_REQUIRED');
    const consumedApprovals = new Set();
    for (const domain of LEGACY_EVIDENCE_DOMAINS) {
      const entry = body.domains.find(e => e.domain === domain);
      if (!entry || !Number.isSafeInteger(entry.unknownEffects) || entry.unknownEffects < 0 || !zero(entry.pendingWrites)
        || entry.requiresReplay !== false || entry.requiresBusinessMutation !== false) hold(`${domain}_UNRECONCILED`);
      if (entry.unknownEffects === 0) { if (entry.disposition !== 'RECONCILED') hold(`${domain}_UNRECONCILED`); continue; }
      // A global "accept risk" label cannot close unknown external effects.
      if (entry.disposition !== 'SCOPED_NO_REPLAY_ACCEPTED' || !Array.isArray(entry.unknownObjects) || entry.unknownObjects.length !== entry.unknownEffects
        || new Set(entry.unknownObjects).size !== entry.unknownEffects || entry.unknownObjects.some(x => typeof x !== 'string' || !/^[A-Za-z0-9_.:/-]{1,200}$/.test(x))) hold(`${domain}_UNKNOWN_EFFECTS`);
      const approval = unknownApprovals.find(a => a.payload?.domain === domain);
      await this.approval(approval, 'UNKNOWN_EFFECTS', p => p.domain === domain && p.reconciliationEvidenceSha256 === evidence.evidenceSha256
        && same(p.objects, entry.unknownObjects) && p.noReplay === true && p.businessMutation === false && p.scopeDigest === authority.payloadSha256);
      consumedApprovals.add(approval);
    }
    if (consumedApprovals.size !== unknownApprovals.length) hold('UNSCOPED_OR_DUPLICATE_UNKNOWN_APPROVAL');
    this.checkWindow();
    this.store.beginMarker({ from: state.phase, to: 'LEGACY_RECONCILED', operation: 'RECONCILE', previousStateDigest: state.stateDigest, startedAt: new Date(this.now()).toISOString() });
    this.failurePoint('AFTER_INTENT'); const nextRefs = [...state.receipts]; let chainState = { ...state, receipts: nextRefs };
    for (const approval of unknownApprovals) { const ref = this.store.appendReceipt('UNKNOWN_EFFECTS_AUTHORITY', approval, chainState, new Date(this.now()).toISOString()); nextRefs.push(ref); }
    nextRefs.push(this.store.appendReceipt('RECONCILIATION', evidence, chainState, new Date(this.now()).toISOString()));
    const { stateDigest, ...content } = state;
    const next = this.store.writeState({ ...content, receipts: nextRefs, phase: 'LEGACY_RECONCILED', status: 'FENCED', updatedAt: new Date(this.now()).toISOString() });
    this.failurePoint('AFTER_COMMIT'); this.store.finishMarker(next); return next;
  }
  preparePromotion() { return this.effect({ from: 'LEGACY_RECONCILED', to: 'PROMOTION_PREPARED', operation: 'PREPARE_PROMOTION', method: 'preparePromotion', kind: 'PROMOTION_PREPARED', validate: body => {
    if (body.previousFloorSha !== this.context.previousFloorSha || body.floorSha !== this.context.targetSha || body.floorVersion !== 3 || body.phase !== 'CODE_HOLD'
      || body.owner !== this.context.owner || body.chanjetPolicy !== 'HOLD' || body.readonlySync !== false || body.inboundSync !== false
      || body.runMigration !== false || body.webSwitched !== false || !HASH.test(body.promotionRecordSha256)) hold('PROMOTION_NOT_EXACT_API_ONLY_HOLD');
  } }); }
  replaceCandidate() { return this.effect({ from: 'PROMOTION_PREPARED', to: 'CANDIDATE_REPLACED', operation: 'REPLACE_CANDIDATE', method: 'replaceCandidate', kind: 'CANDIDATE_REPLACEMENT', status: 'HOLD_CANDIDATE_REVALIDATION_REQUIRED', validate: (body, state) => {
    const intent = this.store.assertOwnedIntent('REPLACE_CANDIDATE', 'PROMOTION_PREPARED', state.stateDigest);
    const hashes = ['replacementIntentSha256', 'operationIntentSha256', 'stoppedEvidenceSha256', 'reconciliationEvidenceSha256', 'isolationEvidenceSha256',
      'recoveryEvidenceSha256', 'recoveryMaterialsSha256', 'composeFileSha256', 'overrideSha256', 'commandSha256', 'eventsSha256', 'preInventorySha256', 'postInventorySha256'];
    validateRuntimePin(body.candidate);
    if (this.context.executors.length !== 1 || body.protocol !== 'CONTROLLED_COMPOSE_REPLACEMENT' || body.legacyDrainResult !== 'UNSUPPORTED'
      || body.oldDisposition !== 'REMOVED_BY_CONTROLLED_REPLACEMENT' || body.owner !== this.context.owner || !same(body.oldExecutor, this.context.preSnapshot.api)
      || hashes.some(key => !HASH.test(body[key])) || body.operationIntentSha256 !== canonicalDigest(intent)
      || body.stoppedEvidenceSha256 !== this.receipt(state, 'STOP_LEGACY').evidenceSha256
      || body.reconciliationEvidenceSha256 !== this.receipt(state, 'RECONCILIATION').evidenceSha256
      || body.recoveryEvidenceSha256 !== this.receipt(state, 'RECOVERY_MATERIAL').evidenceSha256
      || body.composeFileSha256 !== this.context.replacement?.composeFileSha256 || body.project !== this.context.replacement?.project
      || body.candidate.id === body.oldExecutor.id || body.candidate.imageId !== this.context.candidate.imageId || body.candidate.revision !== this.context.targetSha
      || body.candidate.running !== true || body.candidate.restartPolicy !== 'no' || body.candidate.restartCount !== 0 || body.candidate.service !== 'api'
      || !Number.isSafeInteger(body.candidate.pid) || body.candidate.pid <= 0 || body.candidate.restarting !== false || body.candidate.dead !== false
      || body.candidate.project !== body.project || !/^phoenix[a-z0-9_-]{1,63}$/.test(body.project || '')
      || body.unexpectedExecutors !== 0 || body.oldImageRetained !== true || body.webDbUnchanged !== true || body.runMigration !== false || body.webSwitched !== false
      || body.coverageScope !== 'FIXED_REPLACEMENT_INTERVAL_ONLY' || body.postReplacementState !== 'HOLD_CANDIDATE_REVALIDATION_REQUIRED'
      || !same(body.candidatePublicMount, { source: '/var/lib/phoenix-background-control', destination: '/run/phoenix-background-control', type: 'bind', readOnly: true })
      || !iso(body.interval?.start) || !iso(body.interval?.end) || Date.parse(body.interval.start) < Date.parse(this.context.window.start)
      || Date.parse(body.interval.start) >= Date.parse(body.interval.end) || Date.parse(body.interval.end) > this.now()
      || Date.parse(body.candidate.startedAt) < Date.parse(body.interval.start) || Date.parse(body.candidate.startedAt) >= Date.parse(body.interval.end)
      || !body.lifecycle || ['oldDestroy', 'candidateCreate', 'candidateStart'].some(key => !HASH.test(body.lifecycle[key]))) hold('CONTROLLED_CANDIDATE_REPLACEMENT_REQUIRED');
  } }); }
  /** Registration/read-only verification only. The approved typed Compose
   * replacement already started this exact candidate; do not create/restart it. */
  startCandidate() { return this.effect({ from: 'CANDIDATE_REPLACED', to: 'CANDIDATE_FENCED', operation: 'START_CANDIDATE', method: 'startCandidate', kind: 'CANDIDATE_FENCED', validate: (body, state) => {
    const replacement = this.receipt(state, 'CANDIDATE_REPLACEMENT');
    validateRuntimePin(body.api, { healthy: true });
    validateCandidateBackground(body);
    if (body.candidateReplacementSha256 !== replacement.evidenceSha256 || !sameRuntimeIdentity(body.api, replacement.body.candidate)
      || body.registrationOnly !== true || body.runtimeCreated !== false || body.runtimeRestarted !== false
      || body.api.revision !== this.context.targetSha || body.api.imageId !== this.context.candidate.imageId || body.owner !== this.context.owner
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body.bootId || '') || body.admissionState !== 'DENIED'
      || !zero(body.inFlight) || !zero(body.pendingChildren) || body.chanjetPolicy !== 'HOLD' || body.readonlySync !== false || body.inboundSync !== false
      || !same(body.web, this.context.preSnapshot.web) || !same(body.db, this.context.preSnapshot.db)) hold('CANDIDATE_STARTUP_NOT_FENCED');
  } }); }
  verifyCandidate() { return this.effect({ from: 'CANDIDATE_FENCED', to: 'VERIFIED_FENCED', operation: 'VERIFY_CANDIDATE', method: 'verifyCandidate', kind: 'VERIFIED_FENCED', validate: (body, state) => {
    const candidate = this.receipt(state, 'CANDIDATE_FENCED').body;
    validateCandidateBackground(body);
    if (!same(body.api, candidate.api) || body.bootId !== candidate.bootId || !same(body.controlSession, candidate.controlSession) || body.admissionState !== 'DENIED' || body.apiReadiness !== 'PASS'
      || body.webHttpSmoke !== 'PASS' || body.liveReinspect !== 'PASS' || !HASH.test(body.startupEvidenceSha256) || !HASH.test(body.preSnapshotSha256)
      || !HASH.test(body.postSnapshotSha256) || !same(body.web, this.context.preSnapshot.web) || !same(body.db, this.context.preSnapshot.db)
      || body.unfinishedTransaction !== false || body.runMigration !== false) hold('CANDIDATE_FORMAL_EVIDENCE_REQUIRED');
  } }); }
  async complete({ completionEvidence }) {
    let state = this.state('VERIFIED_FENCED'); await this.authorityStillValid(state);
    const body = await this.evidence(completionEvidence, 'COMPLETION'); const candidate = this.receipt(state, 'CANDIDATE_FENCED').body;
    if (body.outcome !== 'SUCCESS' || body.owner !== this.context.owner || body.floorSha !== this.context.targetSha || !same(body.api, candidate.api)
      || body.bootId !== candidate.bootId || !HASH.test(body.successReceiptSha256) || !HASH.test(body.publicManifestSha256)
      || body.allowedKinds?.some(k => !['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION'].includes(k)) || !Array.isArray(body.allowedKinds)
      || body.chanjetPolicy !== 'HOLD' || body.readonlySync !== false || body.inboundSync !== false || body.ingressReleaseAuthorized !== true) hold('FORMAL_COMPLETION_REQUIRED');
    if (typeof this.adapters.openCandidate !== 'function') hold('ADAPTER_OPEN_CANDIDATE_UNIMPLEMENTED');
    this.checkWindow();
    const commitAt = new Date(this.now()).toISOString();
    this.store.beginMarker({ from: state.phase, to: 'COMPLETED_OPEN', operation: 'OPEN_CANDIDATE', previousStateDigest: state.stateDigest, previousState: structuredClone(state), startedAt: commitAt });
    this.failurePoint('AFTER_INTENT'); const ref = this.store.appendReceipt('COMPLETION', completionEvidence, state, commitAt);
    const { stateDigest, ...content } = state;
    // Root private authority is durable before the adapter may publish OPEN.
    state = this.store.writeState({ ...content, phase: 'COMPLETED_OPEN', status: 'OPEN_COMMIT_PENDING', receipts: [...state.receipts, ref], updatedAt: commitAt });
    this.failurePoint('AFTER_PRIVATE_OPEN_COMMIT');
    this.checkWindow();
    const operationIntent = this.store.assertOwnedEffectState('OPEN_CANDIDATE', state);
    const published = await this.adapters.openCandidate({ context: structuredClone(this.context), contextDigest: this.digest, state: structuredClone(state), completionEvidence, operationIntent });
    this.failurePoint('AFTER_PUBLIC_OPEN'); this.checkWindow(); const opened = await this.evidence(published, 'OPEN_PUBLISHED');
    if (opened.publicManifestSha256 !== body.publicManifestSha256 || opened.owner !== this.context.owner || opened.bootId !== candidate.bootId
      || opened.phase !== 'OPEN' || opened.ingressReleased !== true || opened.chanjetPolicy !== 'HOLD') hold('OPEN_PROJECTION_NOT_VERIFIED');
    const openedRef = this.store.appendReceipt('OPEN_PUBLISHED', published, state, new Date(this.now()).toISOString());
    const { stateDigest: ignored, ...committed } = state;
    state = this.store.writeState({ ...committed, status: 'SUCCESS', receipts: [...state.receipts, openedRef], updatedAt: new Date(this.now()).toISOString() });
    this.failurePoint('AFTER_COMMIT'); this.store.finishMarker(state); this.store.finishCurrent(state); return state;
  }
}
