import { assertAdmissionSchemaApplied } from './chanjet-admission-schema-receipt.mjs';
import { validatePolicyTransition } from './chanjet-readonly-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CONTRACT, secureJson, assertStateVersion, verifyContext, guardProduction, migrationScope, git, rollbackEligibility, assertTransactionOwnership } from './production-config-guard.mjs';
import { assertModernReleaseAdmission, assertLegacyMaintenanceAdmission } from './production-maintenance-admission.mjs';
import { MaintenanceReceiptStore, validateMaintenanceContext, validateMaintenanceEvidence, validateRuntimePin, bindingDigest, same, HASH, hold } from './production-maintenance-receipts.mjs';
import { EVIDENCE_SCHEMA, MODE_EVIDENCE_SCHEMA, verifyEvidenceFiles, verifyLiveSnapshot } from './production-deployment-evidence.mjs';
import { assertContained, readPinnedFile } from './production-trusted-paths.mjs';
import { captureRuntime, executionEnv, IMAGE_ID, REVISION } from './capture-production-runtime.mjs';
import { atomicState } from './production-atomic-state.mjs';
export { atomicState } from './production-atomic-state.mjs';
export function deploymentMode({ mode, buildApi, buildWeb }) {
  if (!['api', 'web', 'full'].includes(mode) || buildApi !== ['api', 'full'].includes(mode) || buildWeb !== ['web', 'full'].includes(mode)) throw new Error('STATE_HOLD=DEPLOY_MODE');
  return mode;
}
export function beginState({ previous, configSha, target, scope, floor, evidence, mode }) {
  if (mode !== undefined && !['api', 'web', 'full'].includes(mode)) throw new Error('STATE_HOLD=DEPLOY_MODE');
  if (configSha !== target || !REVISION.test(configSha) || !REVISION.test(target) || scope.baseline !== previous.api.revision || scope.target !== target) throw new Error('STATE_HOLD=BASELINE');
  return { ...(mode ? { deployMode: mode } : {}), expiresAt: new Date(Date.now() + CONTRACT.maximumTransitionMs).toISOString(), version: CONTRACT.version, configSha, target, floorSha: floor.floorSha, previous, active: previous, candidates: {}, switched: { api: false, web: false }, outcome: 'PREPARED', migrationBaseline: previous.api.revision, migrationPaths: scope.changed, protectedImages: [previous.api.imageId, previous.web.imageId], evidence };
}
export function rollbackPlan(state, eligible) {
  // DB/schema-changing releases use the separate controlled migration authority.
  if (state.migrationPaths.length) throw new Error('ROLLBACK_HOLD=SCHEMA_COMPATIBILITY');
  const services = [];
  for (const service of ['api', 'web']) {
    if (!state.switched[service]) continue;
    if (service === 'api' && !eligible.allowed) throw new Error(`ROLLBACK_API_IMAGE_ALLOWED=NO:${eligible.reason}`);
    services.push({ service, ...state.previous[service] });
  }
  return services;
}
export function requireFirstTransition({ legacyApi, floor, proof, composeBytes, mode, buildApi, buildWeb, authorized, rotateCredentials }) {
  if (!legacyApi) return;
  if (!authorized || mode !== 'full' || !buildApi || !buildWeb || rotateCredentials || !proof
    || proof.version !== CONTRACT.version || proof.executionUid !== CONTRACT.executionUid || proof.archiveDirectory !== CONTRACT.archiveDirectory
    || proof.target !== floor.floorSha || proof.compositionEquivalent !== true || proof.archiveVerified !== true
    || proof.composeDuringIntermediateStateAllowed !== false || !/^[a-f0-9]{64}$/.test(proof.backupSha256 || '')
    || proof.composeSha256 !== createHash('sha256').update(composeBytes).digest('hex')) throw new Error('STATE_HOLD=ONE_TIME_TRANSITION_AUTHORIZATION_AND_C3_PROOF_REQUIRED');
}
export function transactionFile(directory = CONTRACT.stateDirectory, runId = process.env.DEPLOY_RUN_ID) {
  if (!/^\d+(?:-\d+)?$/.test(runId || '')) throw new Error('STATE_HOLD=RUN_ID');
  return path.join(directory, `deploy-${runId}.json`);
}
export function inspectCandidate(ref, target, run = args => execFileSync('docker', args, { env: executionEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()) {
  const imageId = run(['image', 'inspect', ref, '--format', '{{.Id}}']);
  const revision = run(['image', 'inspect', imageId, '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}']);
  if (!IMAGE_ID.test(imageId) || !REVISION.test(revision) || revision !== target) throw new Error('STATE_HOLD=CANDIDATE_REVISION');
  return { imageId, revision };
}
function legacyFiles(directory, owner) {
  return Object.fromEntries(['pre', 'post', 'log'].map(kind => [kind, path.join(directory, `maintenance-formal-${kind}-${owner}.json`)]));
}
/** Shared read/admission seam for the two typed legacy cores. This is not an
 * authority capability: every exported mutator invokes it internally again.
 * No admission function or affirmative plan boolean can replace the real gate. */
export async function assertLegacyMaintenanceStateCore(request, operation, dependencies = {}) {
  // Ordinary release and read-only diagnostic CLI paths must not initialize the
  // separate legacy protocol graph. No top-level await or duplicated validator.
  const { validateStoppedLegacy, validateIngressFence } = await import('./production-maintenance-transition.mjs');
  const { LEGACY_EVIDENCE_DOMAINS } = await import('./background-control-legacy-transition.mjs');
  validateMaintenanceContext(request?.context);
  if (!['PREPARE_PROMOTION', 'VERIFY_CANDIDATE'].includes(operation)
    || Object.keys(request).some(key => !['root', 'context', 'contextDigest', 'state', 'approval', 'files', 'isolation', 'bootstrap', 'controlLease', 'signal', 'operation'].includes(key))
    || (request.operation !== undefined && request.operation !== operation)
    || ['admit', 'skipAdmission', 'approved', 'maintenanceAdmission'].some(key => Object.hasOwn(dependencies, key))) hold('LEGACY_TYPED_STATE_REQUEST_REQUIRED');
  const context = structuredClone(request.context), directory = dependencies.directory || CONTRACT.stateDirectory;
  const root = request.root || CONTRACT.repository, now = dependencies.now || Date.now, env = dependencies.env || process.env;
  if (env.DEPLOY_RUN_ID !== context.owner || env.TARGET_SHA !== context.targetSha
    || (request.contextDigest !== undefined && request.contextDigest !== bindingDigest(context))) hold('LEGACY_WORKFLOW_BINDING');
  for (const [key, expected] of Object.entries({ DEPLOY_MODE: 'api', BUILD_API: 'true', BUILD_WEB: 'false', RUN_MIG: 'false',
    ROTATE_CHANJET_CREDENTIALS: 'false', ONE_TIME_CONFIG_FLOOR_TRANSITION: 'false', APPROVED_CONFIG_FLOOR_SHA: context.targetSha,
    APPROVED_PREVIOUS_FLOOR_SHA: context.previousFloorSha })) if (env[key] !== undefined && env[key] !== expected) hold('LEGACY_API_ONLY_HOLD_SCOPE');
  const files = legacyFiles(directory, context.owner);
  if (request.files !== undefined && !same(request.files, files)) hold('LEGACY_FIXED_EVIDENCE_PATHS_REQUIRED');
  const admissionDependencies = { ...dependencies.admissionDependencies, now,
    verifyAuthority: dependencies.verifyAuthority || (async () => false) };
  if (!admissionDependencies.guard) admissionDependencies.guard = () => verifyContext(root, directory);
  const admit = async () => {
    if (request.signal?.aborted) hold('LEGACY_STATE_OPERATION_ABORTED');
    await assertLegacyMaintenanceAdmission({ directory, context, approval: request.approval, operation,
      expectedPhase: request.state?.phase, expectedStateDigest: request.state?.stateDigest, requiredBudgetMs: 60000 }, admissionDependencies);
    if (request.signal?.aborted) hold('LEGACY_STATE_OPERATION_ABORTED');
  };
  await admit();
  const store = new MaintenanceReceiptStore(context, { directory, guard: admissionDependencies.guard,
    inspectDirectory: admissionDependencies.inspectDirectory, expectedUid: admissionDependencies.expectedUid });
  const state = store.readState();
  if (!state || !same(state, request.state)) hold('LEGACY_STATE_NOT_CURRENT');
  const evidence = async (envelope, kind) => {
    const body = validateMaintenanceEvidence(envelope, kind, context, now());
    if (await (dependencies.verifyEvidence || (async () => false))(envelope, { kind, context, bindingDigest: bindingDigest(context) }) !== true) hold('LEGACY_STATE_EVIDENCE_UNVERIFIED');
    if (request.signal?.aborted) hold('LEGACY_STATE_OPERATION_ABORTED');
    return body;
  };
  const receipt = kind => {
    const reference = [...state.receipts].reverse().find(ref => store.readReceipt(ref).kind === kind);
    if (!reference) hold('LEGACY_STATE_PREREQUISITE_REQUIRED'); return store.readReceipt(reference).payload;
  };
  const ingressEnvelope = receipt('INGRESS_FENCE'), stoppedEnvelope = receipt('STOP_LEGACY');
  const ingress = await evidence(ingressEnvelope, 'INGRESS_FENCE'); validateIngressFence(ingress, context, now());
  validateStoppedLegacy(await evidence(stoppedEnvelope, 'STOP_LEGACY'), context, ingressEnvelope.evidenceSha256, now());
  const reconciled = await evidence(receipt('RECONCILIATION'), 'RECONCILIATION');
  if (!same(receipt('MAINTENANCE_AUTHORITY'), request.approval) || reconciled.approvedScopeDigest !== request.approval.payloadSha256
    || !Array.isArray(reconciled.domains) || reconciled.domains.length !== LEGACY_EVIDENCE_DOMAINS.length
    || LEGACY_EVIDENCE_DOMAINS.some(domain => {
      const items = reconciled.domains.filter(item => item.domain === domain); const item = items[0];
      return items.length !== 1 || item.disposition !== 'RECONCILED' || item.unknownEffects !== 0 || item.pendingWrites !== 0
        || item.requiresReplay !== false || item.requiresBusinessMutation !== false;
    })) hold('LEGACY_STATE_RECONCILIATION_REQUIRED');
  if (operation === 'PREPARE_PROMOTION') {
    // A promotion/state writer can perform several slow schema, Git and main
    // reads between admissions. The compiled factory may freshly observe the
    // same owned isolation at EACH admission; never extend an old receipt's
    // timestamp or its five-second validity. JSON plans cannot provide code.
    if (dependencies.captureLegacyIsolation !== undefined && typeof dependencies.captureLegacyIsolation !== 'function') hold('LEGACY_FIXED_ISOLATION_CAPTURE_REQUIRED');
    const isolationEnvelope = dependencies.captureLegacyIsolation
      ? await dependencies.captureLegacyIsolation({ context: structuredClone(context), state: structuredClone(state), expectedStateDigest: state.stateDigest,
        operation, signal: request.signal }) : request.isolation;
    const isolation = await evidence(isolationEnvelope, 'INGRESS_FENCE'); validateIngressFence(isolation, context, now());
    if (now() - Date.parse(isolation.lastVerifiedAt) > 5000) hold('LEGACY_STATE_ISOLATION_STALE');
    const bootstrap = await evidence(request.bootstrap, 'LEGACY_PUBLIC_FENCED');
    if (bootstrap.owner !== context.owner || bootstrap.phase !== 'FENCED' || bootstrap.generation !== 1
      || !Array.isArray(bootstrap.participants) || bootstrap.participants.length !== 0 || bootstrap.legacyDrainResult !== 'UNSUPPORTED'
      || !HASH.test(bootstrap.privateRecordSha256) || !HASH.test(bootstrap.publicManifestSha256)) hold('LEGACY_EMPTY_PUBLIC_FENCE_REQUIRED');
  } else {
    const candidate = await evidence(receipt('CANDIDATE_FENCED'), 'CANDIDATE_FENCED');
    validateRuntimePin(candidate.api, { revision: true, healthy: true });
    const lease = await evidence(request.controlLease, 'CANDIDATE_CONTROL_LEASE');
    if (candidate.api.imageId !== context.candidate.imageId || candidate.api.revision !== context.targetSha
      || context.executors.some(old => old.id === candidate.api.id)
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(candidate.bootId || '')
      || now() - Date.parse(request.controlLease.capturedAt) > 5000 || !same(lease.api, candidate.api) || lease.bootId !== candidate.bootId
      || lease.owner !== context.owner || lease.phase !== 'FENCED' || lease.admissionExclusive !== true || lease.executionExclusive !== true
      || lease.connected !== true || lease.admissionState !== 'DENIED' || lease.inFlight !== 0 || lease.pendingChildren !== 0 || lease.taskGraphs !== 0
      || lease.poisoned !== false || lease.stopping !== false || lease.continuousIngress !== true || lease.unknownExecutors !== 0
      || !same(lease.controlSession, candidate.controlSession)) hold('LEGACY_CANDIDATE_CONTROL_REQUIRED');
  }
  await admit();
  return { root, directory, context, files, state, admit, receipt };
}
function present(file) { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
function legacyPrevious(context) {
  return Object.fromEntries(['api', 'web'].map(service => [service, { imageId: context.preSnapshot[service].imageId, revision: context.preSnapshot[service].revision }]));
}
function assertLegacyDeploymentRecord(state, context, files) {
  if (!state.maintenance || !same(state.maintenance, { protocol: 'STOP_AND_RECONCILE', owner: context.owner, contextDigest: bindingDigest(context) })
    || state.deployMode !== 'api' || state.target !== context.targetSha || state.configSha !== context.targetSha || state.floorSha !== context.targetSha
    || !Array.isArray(state.migrationPaths) || state.migrationPaths.length || state.switched.web !== false
    || !same(state.previous, legacyPrevious(context)) || !same(state.active.web, state.previous.web)
    || !same(state.evidence, files)) hold('LEGACY_DEPLOYMENT_RECORD_MISMATCH');
}
function assertLegacyFloor(floor, context) {
  if (floor.version !== 3 || floor.floorSha !== context.targetSha || floor.chanjetPolicy !== 'HOLD' || floor.readonlyApproval !== null
    || floor.operationalTuple?.CHANJET_READONLY_SYNC_ENABLED !== 'false' || floor.operationalTuple?.CHANJET_ERP_INBOUND_SYNC_ENABLED !== 'false') hold('LEGACY_FLOOR_API_HOLD_REQUIRED');
}
function assertLegacyPre(pre, context) {
  if (pre.schema !== MODE_EVIDENCE_SCHEMA || pre.deployMode !== 'api' || pre.phase !== 'PRE_SNAPSHOT' || pre.deployRunId !== context.owner
    || pre.deployRunAttempt !== Number(context.owner.split('-').at(-1)) || pre.targetSha !== context.targetSha || pre.configFloorSha !== context.targetSha) hold('LEGACY_FORMAL_PRE_BINDING');
  for (const service of ['api', 'web', 'db']) {
    const pin = context.preSnapshot[service], actual = pre.containers?.[service];
    if (!actual || actual.id !== pin.id || actual.image !== pin.imageId || actual.startedAt !== pin.startedAt || actual.restartCount !== pin.restartCount
      || actual.running !== true || actual.health !== 'healthy' || (service !== 'db' && actual.ociRevision !== pin.revision)) hold('LEGACY_FORMAL_PRE_RUNTIME');
  }
}
async function deploymentOperationCore({ root, directory, operation, input, value, env, legacy }, dependencies, admit) {
  const read = dependencies.readState || secureJson, write = dependencies.atomicState || atomicState;
  const capture = dependencies.captureRuntime || captureRuntime, guard = dependencies.guardProduction || guardProduction;
  const getGit = dependencies.git || git, getScope = dependencies.migrationScope || migrationScope;
  const candidateInspector = dependencies.inspectCandidate || inspectCandidate, schemaCheck = dependencies.assertAdmissionSchemaApplied || assertAdmissionSchemaApplied;
  const eligibility = dependencies.rollbackEligibility || rollbackEligibility;
  const file = transactionFile(directory, env.DEPLOY_RUN_ID); let state, completedActive;
  if (operation === 'begin') {
    if (present(file) || present(path.join(directory, 'transaction.json'))) throw new Error('STATE_HOLD=RUN_ALREADY_EXISTS_OR_UNFINISHED');
    const previous = legacy ? legacyPrevious(legacy.context) : read(input); const actual = capture();
    if (JSON.stringify(previous) !== JSON.stringify(actual)) throw new Error('STATE_HOLD=RUNTIME_CHANGED');
    const active = assertStateVersion(read(path.join(directory, 'active.json')));
    if (JSON.stringify(active.active) !== JSON.stringify(actual)) throw new Error('STATE_HOLD=ACTIVE_PINS_DRIFT');
    const floor = guard(root, directory, previous);
    if (legacy) { assertLegacyFloor(floor, legacy.context); assertLegacyPre(read(legacy.files.pre), legacy.context); }
    const target = env.TARGET_SHA;
    const legacyApi = !eligibility(root, floor, previous.api).allowed;
    const policyPath = path.join(directory, 'policy-transition.json');
    const promotion = present(policyPath) ? read(policyPath) : undefined;
    if (legacy && (!promotion || promotion.previousFloorSha !== legacy.context.previousFloorSha)) hold('LEGACY_PROMOTION_REQUIRED');
    if (promotion) {
      validatePolicyTransition(promotion, { runId: env.DEPLOY_RUN_ID, target, actual, now: (dependencies.now || Date.now)() });
      if (promotion.operation !== 'CODE_HOLD' || env.DEPLOY_MODE !== 'api' || env.BUILD_API !== 'true' || env.BUILD_WEB !== 'false' || env.ROTATE_CHANJET_CREDENTIALS === 'true') throw new Error('STATE_HOLD=PROMOTION_SCOPE');
    }
    const proof = legacyApi && !promotion ? assertStateVersion(read(path.join(directory, 'transition-proof.json'))) : undefined;
    if (proof) {
      assertContained(proof.archiveBackup, CONTRACT.archiveDirectory);
      if (createHash('sha256').update(readPinnedFile(proof.archiveBackup, { contract: CONTRACT })).digest('hex') !== proof.backupSha256) throw new Error('STATE_HOLD=C3_ARCHIVE_CHANGED');
    }
    requireFirstTransition({ legacyApi: legacyApi && !promotion, floor, proof, composeBytes: fs.readFileSync(path.join(root, 'docker-compose.yml')),
      mode: env.DEPLOY_MODE, buildApi: env.BUILD_API === 'true', buildWeb: env.BUILD_WEB === 'true',
      authorized: env.ONE_TIME_CONFIG_FLOOR_TRANSITION === 'true', rotateCredentials: env.ROTATE_CHANJET_CREDENTIALS === 'true' });
    const scope = getScope(root, previous.api.revision, target);
    if (legacy && scope.changed.length !== 0) hold('LEGACY_MIGRATION_PATH_CHANGED');
    const evidence = env.DEPLOYMENT_EVIDENCE_PRE && env.DEPLOYMENT_EVIDENCE_POST && env.DEPLOYMENT_EVIDENCE_LOG
      ? { pre: env.DEPLOYMENT_EVIDENCE_PRE, post: env.DEPLOYMENT_EVIDENCE_POST, log: env.DEPLOYMENT_EVIDENCE_LOG } : undefined;
    if (!evidence) throw new Error('STATE_HOLD=DEPLOYMENT_EVIDENCE_BINDING');
    const schemaApplied = scope.changed.length ? schemaCheck(root, scope) : false;
    if (scope.changed.length && !schemaApplied) throw new Error('MIGRATION_SCOPE=HOLD:CONTROLLED_SCHEMA_RELEASE_REQUIRED');
    const mode = deploymentMode({ mode: env.DEPLOY_MODE, buildApi: env.BUILD_API === 'true', buildWeb: env.BUILD_WEB === 'true' });
    state = beginState({ mode, previous, configSha: getGit(root, ['rev-parse', 'HEAD']), target, scope, floor, evidence });
    if (legacy) state.maintenance = { protocol: 'STOP_AND_RECONCILE', owner: legacy.context.owner, contextDigest: bindingDigest(legacy.context) };
    await admit();
    write(file, state);
    write(path.join(directory, 'transaction.json'), { version: CONTRACT.version, runId: env.DEPLOY_RUN_ID, phase: 'IN_PROGRESS', target, configSha: state.configSha });
    if (scope.changed.length) console.log('CONTROLLED_ADMISSION_SCHEMA=APPLIED;AUTOMATIC_ROLLBACK=HOLD');
    return state;
  } else {
    if (!assertTransactionOwnership(directory, env.DEPLOY_RUN_ID, { readState: read })) throw new Error('STATE_HOLD=TRANSACTION_MARKER_REQUIRED');
    state = assertStateVersion(read(file));
    // Historical transactions predate mode binding and remain API-only.
    const mode = state.deployMode ?? 'api';
    if (!['api', 'web', 'full'].includes(mode) || (env.DEPLOY_MODE && env.DEPLOY_MODE !== mode)) throw new Error('STATE_HOLD=DEPLOY_MODE');
    if (legacy) {
      assertLegacyDeploymentRecord(state, legacy.context, legacy.files);
      const transaction = read(path.join(directory, 'transaction.json'));
      if (transaction.target !== legacy.context.targetSha || transaction.configSha !== legacy.context.targetSha) hold('LEGACY_DEPLOYMENT_TRANSACTION_MISMATCH');
    }
    const floor = guard(root, directory, state.active);
    if (legacy) {
      assertLegacyFloor(floor, legacy.context);
      const promotion = read(path.join(directory, 'policy-transition.json'));
      validatePolicyTransition(promotion, { runId: env.DEPLOY_RUN_ID, target: legacy.context.targetSha, actual: state.active, now: (dependencies.now || Date.now)() });
      if (promotion.operation !== 'CODE_HOLD' || promotion.runId !== env.DEPLOY_RUN_ID || promotion.target !== legacy.context.targetSha
        || promotion.previousFloorSha !== legacy.context.previousFloorSha) hold('LEGACY_PROMOTION_REQUIRED');
    }
    if (operation === 'candidate') {
      if (!(mode === 'full' ? ['api', 'web'] : [mode]).includes(input) || value !== (legacy ? legacy.context.candidate.imageId : `ghcr.io/ivanzhao299/phoenix-erp-v3/${input}:sha-${state.target}`)) throw new Error('STATE_HOLD=CANDIDATE_REF');
      if (legacy && (input !== 'api' || state.candidates.api)) hold('LEGACY_CANDIDATE_ALREADY_RECORDED');
      state.candidates[input] = candidateInspector(value, state.target);
      if (legacy && !same(state.candidates.api, legacy.context.candidate)) hold('LEGACY_CANDIDATE_PIN_MISMATCH');
      await admit();
      const promotionPath = path.join(directory, 'policy-transition.json');
      if (present(promotionPath)) {
        if (input !== 'api') throw new Error('STATE_HOLD=PROMOTION_API_ONLY');
        const promotion = read(promotionPath); promotion.candidateApi = state.candidates.api; write(promotionPath, promotion);
      }
      state.protectedImages = [...new Set([...state.protectedImages, state.candidates[input].imageId])];
    } else if (operation === 'switch') {
      if (!(mode === 'full' ? ['api', 'web'] : [mode]).includes(input) || !state.candidates[input]) throw new Error('STATE_HOLD=NO_CANDIDATE');
      if (legacy && (input !== 'api' || state.switched.api)) hold('LEGACY_LOGICAL_SWITCH_ALREADY_RECORDED');
      state.switched[input] = true; state.active[input] = state.candidates[input]; state.outcome = 'SWITCHING';
    } else if (operation === 'rollback-plan') {
      return rollbackPlan(state, eligibility(root, floor, state.previous.api));
    } else if (operation === 'rollback-pin') {
      if (!['api', 'web'].includes(input)) throw new Error('STATE_HOLD=SERVICE');
      rollbackPlan(state, eligibility(root, floor, state.previous.api));
      state.active[input] = state.previous[input]; state.outcome = 'ROLLING_BACK';
    } else if (operation === 'complete' || operation === 'rolled-back') {
      if (operation === 'complete' && (!state.evidence?.pre || !state.evidence?.post || !state.evidence?.log)) throw new Error('STATE_HOLD=DEPLOYMENT_EVIDENCE_REQUIRED');
      const actual = capture();
      if (JSON.stringify(actual) !== JSON.stringify(state.active)) throw new Error('STATE_HOLD=POST_SWITCH_IDENTITY');
      if (operation === 'complete') {
        if (legacy) assertLegacyPre(read(state.evidence.pre), legacy.context);
        const post = read(state.evidence.post);
        if (legacy) {
          const api = post.containers?.api, controlled = legacy.receipt('CANDIDATE_FENCED').body.api;
          if (!api || api.id !== controlled.id || api.image !== controlled.imageId || api.ociRevision !== controlled.revision
            || api.startedAt !== controlled.startedAt || api.restartCount !== controlled.restartCount) hold('LEGACY_POST_CONTROL_IDENTITY');
        }
        const binding = { runId: env.DEPLOY_RUN_ID, runAttempt: env.DEPLOY_RUN_ATTEMPT || String(env.GITHUB_RUN_ATTEMPT || '1'), targetSha: state.target, configFloorSha: state.floorSha, deployMode: mode, evidenceSchema: state.deployMode ? MODE_EVIDENCE_SCHEMA : EVIDENCE_SCHEMA };
        verifyEvidenceFiles(state.evidence.pre, state.evidence.post, state.evidence.log, binding);
        verifyLiveSnapshot(post, binding, dependencies.dockerRead);
      }
      if (legacy && (!state.switched.api || state.switched.web || !same(state.active.api, legacy.context.candidate))) hold('LEGACY_COMPLETE_API_SCOPE');
      state.outcome = operation === 'complete' ? 'SUCCESS' : 'ROLLED_BACK';
      completedActive = { version: CONTRACT.version, configSha: state.configSha, floorSha: state.floorSha, active: state.active, protectedImages: state.protectedImages, outcome: state.outcome, migrationBaseline: state.active.api.revision };
    } else throw new Error('STATE_HOLD=OPERATION');
    await admit();
    // Admission can await an independent authority transport. Reinspect after
    // that wait; no asynchronous boundary may separate final live proof from
    // the SUCCESS records and closure of this deployment's own markers.
    if (legacy && completedActive) {
      if (!same(capture(), state.active)) hold('LEGACY_POST_SWITCH_IDENTITY');
      const binding = { runId: env.DEPLOY_RUN_ID, runAttempt: env.DEPLOY_RUN_ATTEMPT, targetSha: state.target, configFloorSha: state.floorSha, deployMode: mode, evidenceSchema: state.deployMode ? MODE_EVIDENCE_SCHEMA : EVIDENCE_SCHEMA };
      verifyLiveSnapshot(read(state.evidence.post), binding, dependencies.dockerRead);
    }
    if (completedActive) write(path.join(directory, 'active.json'), completedActive);
    write(file, state);
    if (state.outcome === 'SUCCESS' && present(path.join(directory, 'policy-transition.json'))) {
      const promotion = read(path.join(directory, 'policy-transition.json'));
      if (promotion.operation !== 'CODE_HOLD' || promotion.runId !== env.DEPLOY_RUN_ID) throw new Error('STATE_HOLD=PROMOTION_COMPLETION');
      fs.unlinkSync(path.join(directory, 'policy-transition.json'));
    }
    if (['SUCCESS', 'ROLLED_BACK'].includes(state.outcome)) fs.unlinkSync(path.join(directory, 'transaction.json'));
    return state;
  }
}
async function legacyStateOperation(operation, request, dependencies) {
  const maintenanceOperation = operation === 'complete' ? 'VERIFY_CANDIDATE' : 'PREPARE_PROMOTION';
  const admitted = await assertLegacyMaintenanceStateCore(request, maintenanceOperation, dependencies);
  const env = { DEPLOY_RUN_ID: admitted.context.owner, DEPLOY_RUN_ATTEMPT: admitted.context.owner.split('-').at(-1), TARGET_SHA: admitted.context.targetSha,
    DEPLOY_MODE: 'api', BUILD_API: 'true', BUILD_WEB: 'false', RUN_MIG: 'false', ROTATE_CHANJET_CREDENTIALS: 'false', ONE_TIME_CONFIG_FLOOR_TRANSITION: 'false',
    DEPLOYMENT_EVIDENCE_PRE: admitted.files.pre, DEPLOYMENT_EVIDENCE_POST: admitted.files.post, DEPLOYMENT_EVIDENCE_LOG: admitted.files.log };
  const admit = async () => { await assertLegacyMaintenanceStateCore(request, maintenanceOperation, dependencies); };
  return deploymentOperationCore({ root: admitted.root, directory: admitted.directory, operation, input: operation === 'begin' ? undefined : 'api',
    value: admitted.context.candidate.imageId, env, legacy: admitted }, dependencies, admit);
}
export const beginLegacyMaintenanceDeployment = (request, dependencies = {}) => legacyStateOperation('begin', request, dependencies);
export const recordLegacyMaintenanceCandidate = (request, dependencies = {}) => legacyStateOperation('candidate', request, dependencies);
export const switchLegacyMaintenanceDeployment = (request, dependencies = {}) => legacyStateOperation('switch', request, dependencies);
export const completeLegacyMaintenanceDeployment = (request, dependencies = {}) => legacyStateOperation('complete', request, dependencies);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [operation, input, value] = process.argv.slice(2), directory = CONTRACT.stateDirectory;
    const root = fs.realpathSync(process.cwd()); verifyContext(root, directory);
    const admit = () => assertModernReleaseAdmission({ directory }, { guard: () => verifyContext(root, directory) });
    if (['begin', 'candidate', 'switch', 'rollback-pin', 'complete', 'rolled-back'].includes(operation)) admit();
    const state = await deploymentOperationCore({ root, directory, operation, input, value, env: process.env }, {}, operation === 'rollback-plan' ? () => {} : admit);
    if (operation === 'rollback-plan') console.log(JSON.stringify(state));
    else if (operation === 'begin') console.log(`PREV_API_REVISION=${state.previous.api.revision}\nPREV_WEB_REVISION=${state.previous.web.revision}\nRUN_MIG=false`);
    else console.log(`DEPLOYMENT_STATE=${state.outcome}`);
  } catch (error) { console.error(/^(STATE_HOLD|CONFIG_HOLD|MIGRATION_SCOPE|ROLLBACK_|MAINTENANCE_HOLD)/.test(error.message) ? error.message : 'STATE_HOLD=VALIDATION_FAILED'); process.exitCode = 1; }
}
