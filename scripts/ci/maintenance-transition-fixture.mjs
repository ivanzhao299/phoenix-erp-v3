/** Actual local receipt/transition files with synthetic authority/evidence only. Not production permission. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LegacyMaintenanceTransition, validateRecoveryMaterial, MAINTENANCE_OPERATIONS } from '../ops/production-maintenance-transition.mjs';
import { MaintenanceReceiptStore, createMaintenanceEvidence, bindingDigest, canonicalDigest, MAINTENANCE_CONTEXT_SCHEMA, MAINTENANCE_AUTHORITY_SCHEMA } from '../ops/production-maintenance-receipts.mjs';
import { LEGACY_EVIDENCE_DOMAINS } from '../ops/background-control-legacy-transition.mjs';
const now = Date.parse('2026-10-18T01:10:00.000Z'); const time = ms => new Date(now + ms).toISOString();
const hash = n => n.repeat(64); const sha = n => n.repeat(40);
const operations = MAINTENANCE_OPERATIONS;
function pin(n, revision = sha('a')) { return { id: hash(n), imageId: `sha256:${hash(n)}`, revision, startedAt: time(-86400000), restartCount: 0, running: true, health: 'healthy' }; }
function fixture() {
  const api = pin('1'); const web = pin('2', sha('c')); const db = { ...pin('3'), mountsSha256: hash('4') }; delete db.revision;
  const context = { schema: MAINTENANCE_CONTEXT_SCHEMA, protocolVersion: 1, owner: '123456-1', previousFloorSha: sha('a'), previousApiSha: sha('a'), previousWebSha: sha('c'), targetSha: sha('b'),
    window: { start: time(-600000), end: time(600000) }, candidate: { revision: sha('b'), imageId: `sha256:${hash('5')}` }, sourceHelperSha256: hash('6'), schemaEvidenceSha256: hash('7'), migrationPaths: [], preSnapshot: { api, web, db }, executors: [api], replacement: { project: 'phoenix-test', composeFileSha256: hash('f') } };
  const digest = bindingDigest(context); const evidence = (kind, body) => createMaintenanceEvidence(kind, context, body, { capturedAt: time(0) });
  const approval = (purpose, payload) => ({ schema: MAINTENANCE_AUTHORITY_SCHEMA, bindingDigest: digest, purpose, decision: 'APPROVED', payload, payloadSha256: canonicalDigest(payload),
    serverRecord: { id: 42, kind: 'GITHUB_REVIEW', state: 'APPROVED', reviewer: 'independent-owner', author: 'code-author', permission: 'ADMIN', commitId: context.targetSha, submittedAt: time(-5000), rawRecordSha256: hash('8') } });
  const recoveryPlan = { bindingDigest: digest, strategy: 'COMPATIBLE_CANDIDATE_OR_HOLD', automaticOldRuntimeRollback: false, automaticDatabaseRestore: false, businessReplay: false,
    responsibleOperator: 'human-on-call', procedureSha256: hash('9'), stopConditions: ['INGRESS_LOST', 'UNKNOWN_SIDE_EFFECTS', 'CANDIDATE_FAILED', 'FLOOR_STATE_INCONSISTENT'],
    materials: [{ kind: 'CANDIDATE_IMAGE', sha256: hash('5'), imageId: context.candidate.imageId, revision: context.targetSha }, { kind: 'SOURCE_HELPERS', sha256: context.sourceHelperSha256 },
      { kind: 'PRE_SNAPSHOT', sha256: canonicalDigest(context.preSnapshot) }, { kind: 'RECOVERY_PROCEDURE', sha256: hash('9') }] };
  const auth = approval('MAINTENANCE', { protocol: 'STOP_AND_RECONCILE', operations, recoveryPlanDigest: canonicalDigest(recoveryPlan), preSnapshotDigest: canonicalDigest(context.preSnapshot) });
  const material = { approval: auth, recoveryPlan, preEvidence: evidence('PRE', { healthy: true, runtime: context.preSnapshot, schemaEvidenceSha256: context.schemaEvidenceSha256, migrationPaths: [], unfinishedTransaction: false,
    chanjetPolicy: 'HOLD', readonlySync: false, inboundSync: false, inventory: { hostInventoryComplete: true, unaccountedExecutors: 0, dockerExecutorIds: [api.id], allDockerIds: [api.id, web.id, db.id], classifiedNonExecutorIds: [web.id, db.id] } }),
    recoveryEvidence: evidence('RECOVERY_MATERIAL', { planDigest: canonicalDigest(recoveryPlan), materialsAvailable: true, compatibleCandidateImageId: context.candidate.imageId, procedureSha256: recoveryPlan.procedureSha256, operatorConfirmed: recoveryPlan.responsibleOperator }) };
  const ingress = evidence('INGRESS_FENCE', { state: 'FROZEN', continuous: true, enforcedAt: time(-5000), lastVerifiedAt: time(0), leaseExpiresAt: time(300000), mechanismId: 'protected-ingress-v1',
    revival: { state: 'ENFORCED', restartPolicy: 'no', orchestratorsDisabled: true, executorIds: [api.id] } });
  const stopped = evidence('STOP_LEGACY', { protocol: 'STOP_AND_RECONCILE', legacyDrainResult: 'UNSUPPORTED', ingressFenceDigest: ingress.evidenceSha256,
    executors: [{ id: api.id, before: api, first: { ...api, running: false, pid: 0, status: 'exited', restarting: false, dead: false, exitCode: 143, oomKilled: false, checkedAt: time(-2000) },
      second: { ...api, running: false, pid: 0, status: 'exited', restarting: false, dead: false, exitCode: 143, oomKilled: false, checkedAt: time(-1000) } }],
    database: { remainingConnections: 0, openTransactions: 0, preparedTransactions: 0, persistentRunning: 0, persistentQueued: 0, ownershipComplete: true } });
  const reconciliation = evidence('RECONCILIATION', { domains: LEGACY_EVIDENCE_DOMAINS.map(domain => ({ domain, disposition: 'RECONCILED', unknownEffects: 0, pendingWrites: 0, requiresReplay: false, requiresBusinessMutation: false })), approvedScopeDigest: auth.payloadSha256 });
  const candidate = { api: { ...pin('a', context.targetSha), imageId: context.candidate.imageId, startedAt: time(-1000), pid: 100, restarting: false, dead: false }, bootId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner: context.owner,
    admissionState: 'DENIED', inFlight: 0, pendingChildren: 0, taskGraphs: 0, poisoned: false, stopping: false,
    controlSession: { connected: true, broken: false, sessionPid: 123, databaseOid: 456, backendStartedAt: time(-1000) }, chanjetPolicy: 'HOLD', readonlySync: false, inboundSync: false, web, db };
  const completion = evidence('COMPLETION', { outcome: 'SUCCESS', owner: context.owner, floorSha: context.targetSha, api: candidate.api, bootId: candidate.bootId, successReceiptSha256: hash('d'),
    publicManifestSha256: hash('e'), allowedKinds: ['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION'], chanjetPolicy: 'HOLD', readonlySync: false, inboundSync: false, ingressReleaseAuthorized: true });
  const calls = [];
  let replacementEnvelope;
  const adapters = {
    fenceIngress: async () => { calls.push('FENCE'); return ingress; }, stopLegacy: async () => { calls.push('STOP'); return stopped; },
    preparePromotion: async () => evidence('PROMOTION_PREPARED', { previousFloorSha: context.previousFloorSha, floorSha: context.targetSha, floorVersion: 3, phase: 'CODE_HOLD', owner: context.owner, chanjetPolicy: 'HOLD', readonlySync: false, inboundSync: false, runMigration: false, webSwitched: false, promotionRecordSha256: hash('d') }),
    replaceCandidate: async ({ operationIntent }) => {
      replacementEnvelope = evidence('CANDIDATE_REPLACEMENT', { protocol: 'CONTROLLED_COMPOSE_REPLACEMENT', legacyDrainResult: 'UNSUPPORTED', oldDisposition: 'REMOVED_BY_CONTROLLED_REPLACEMENT', owner: context.owner,
        oldExecutor: api, candidate: { ...candidate.api, restartPolicy: 'no', service: 'api', project: context.replacement.project }, project: context.replacement.project,
        replacementIntentSha256: hash('d'), operationIntentSha256: canonicalDigest(operationIntent), stoppedEvidenceSha256: stopped.evidenceSha256, reconciliationEvidenceSha256: reconciliation.evidenceSha256,
        isolationEvidenceSha256: ingress.evidenceSha256, recoveryEvidenceSha256: material.recoveryEvidence.evidenceSha256, recoveryMaterialsSha256: hash('e'), composeFileSha256: context.replacement.composeFileSha256,
        overrideSha256: hash('e'), commandSha256: hash('e'), eventsSha256: hash('e'), preInventorySha256: hash('e'), postInventorySha256: hash('e'), unexpectedExecutors: 0, oldImageRetained: true, webDbUnchanged: true,
        runMigration: false, webSwitched: false, coverageScope: 'FIXED_REPLACEMENT_INTERVAL_ONLY', postReplacementState: 'HOLD_CANDIDATE_REVALIDATION_REQUIRED',
        candidatePublicMount: { source: '/var/lib/phoenix-background-control', destination: '/run/phoenix-background-control', type: 'bind', readOnly: true }, interval: { start: time(-2000), end: time(-500) },
        lifecycle: { oldDestroy: hash('e'), candidateCreate: hash('e'), candidateStart: hash('e') } }); return replacementEnvelope;
    },
    startCandidate: async () => evidence('CANDIDATE_FENCED', { ...candidate, candidateReplacementSha256: replacementEnvelope.evidenceSha256, registrationOnly: true, runtimeCreated: false, runtimeRestarted: false }),
    verifyCandidate: async () => evidence('VERIFIED_FENCED', { api: candidate.api, bootId: candidate.bootId, admissionState: 'DENIED', inFlight: 0, pendingChildren: 0, taskGraphs: 0, poisoned: false, stopping: false,
      controlSession: candidate.controlSession, apiReadiness: 'PASS', webHttpSmoke: 'PASS', liveReinspect: 'PASS', startupEvidenceSha256: hash('e'), preSnapshotSha256: hash('f'), postSnapshotSha256: hash('d'), web, db, unfinishedTransaction: false, runMigration: false }),
    openCandidate: async ({ state }) => { assert.equal(state.phase, 'COMPLETED_OPEN'); assert.equal(state.status, 'OPEN_COMMIT_PENDING'); calls.push('OPEN'); return evidence('OPEN_PUBLISHED', { publicManifestSha256: hash('e'), owner: context.owner, bootId: candidate.bootId, phase: 'OPEN', ingressReleased: true, chanjetPolicy: 'HOLD' }); }
  };
  return { context, evidence, approval, material, ingress, stopped, reconciliation, candidate, completion, adapters, calls };
}
function harness(f = fixture(), overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-maintenance-test-')); fs.chmodSync(directory, 0o700);
  const inspectDirectory = () => { const s = fs.lstatSync(directory); return { dev: s.dev, ino: s.ino, uid: s.uid, mode: s.mode }; };
  const store = new MaintenanceReceiptStore(f.context, { directory, guard: () => {}, inspectDirectory, expectedUid: process.getuid() });
  const dependencies = { store, verifyAuthority: async () => true, verifyEvidence: async () => true, adapters: f.adapters, now: () => now, ...overrides };
  return { ...f, store, directory, dependencies, engine: new LegacyMaintenanceTransition({ context: f.context }, dependencies) };
}
async function toStopped(h) { await h.engine.prepare(h.material); await h.engine.fenceIngress(); await h.engine.stopLegacy(); }
async function toVerified(h) { await toStopped(h); await h.engine.reconcile({ evidence: h.reconciliation }); await h.engine.preparePromotion(); await h.engine.replaceCandidate(); await h.engine.startCandidate(); await h.engine.verifyCandidate(); }

export { fixture, harness, toStopped, toVerified, now, time, hash, sha, operations, pin };
