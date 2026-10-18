/** Owned filesystem protocol fixture, NOT a production deployment or ERP image
 * receipt. It runs real immutable store/admission/formal evidence validators. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { LegacyMaintenanceDeploymentSession, RELEASE_SCOPE, validateReleasePlan, verifySessionFormalEvidence } from './production-maintenance-deployment-session.mjs';
import { MaintenanceReceiptStore, canonicalDigest, bindingDigest, createMaintenanceEvidence } from './production-maintenance-receipts.mjs';
import { MAINTENANCE_OPERATIONS } from './production-maintenance-transition.mjs';
import { assertModernReleaseAdmission, assertLegacyMaintenanceAdmission } from './production-maintenance-admission.mjs';
import { MODE_EVIDENCE_SCHEMA, captureSnapshot, summarizeStartupLogs, startupBundle } from './production-deployment-evidence.mjs';
import { beginState } from './production-deployment-state.mjs';
import { LEGACY_EVIDENCE_DOMAINS } from './background-control-legacy-transition.mjs';

const h = c => c.repeat(64), sha = c => c.repeat(40), now = Date.parse('2026-10-18T06:00:00.000Z'), at = offset => new Date(now + offset).toISOString();
const digestText = value => createHash('sha256').update(value).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture() {
  const base = path.resolve('artifacts/maintenance-session'); fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, 'owned-')); fs.chmodSync(directory, 0o700);
  const pin = (c, revision = sha('a')) => ({ id: h(c), imageId: 'sha256:' + h(c), revision, startedAt: at(-100000), restartCount: 0,
    running: true, health: 'healthy', pid: 123, status: 'running', restarting: false, dead: false });
  const api = pin('1'), web = pin('2', sha('c')), db = { ...pin('3'), mountsSha256: h('4') }; delete db.revision;
  const context = { schema: 'phoenix.legacy-maintenance-context/v1', protocolVersion: 1, owner: '23456789-1', previousFloorSha: sha('a'), previousApiSha: sha('a'),
    previousWebSha: sha('c'), targetSha: sha('b'), window: { start: at(-300000), end: at(600000) }, candidate: { imageId: 'sha256:' + h('5'), revision: sha('b') },
    sourceHelperSha256: h('6'), schemaEvidenceSha256: h('7'), migrationPaths: [], preSnapshot: { api, web, db }, executors: [api],
    replacement: { project: 'phoenix-session-owned', composeFileSha256: h('8') } };
  const recoveryPlan = { bindingDigest: bindingDigest(context), strategy: 'COMPATIBLE_CANDIDATE_OR_HOLD', automaticOldRuntimeRollback: false, automaticDatabaseRestore: false,
    businessReplay: false, responsibleOperator: 'fixture-operator', procedureSha256: h('9'),
    materials: [{ kind: 'CANDIDATE_IMAGE', imageId: context.candidate.imageId, revision: context.targetSha, sha256: h('5') },
      { kind: 'SOURCE_HELPERS', sha256: context.sourceHelperSha256 }, { kind: 'PRE_SNAPSHOT', sha256: canonicalDigest(context.preSnapshot) }, { kind: 'RECOVERY_PROCEDURE', sha256: h('9') }],
    stopConditions: ['INGRESS_LOST', 'UNKNOWN_SIDE_EFFECTS', 'CANDIDATE_FAILED', 'FLOOR_STATE_INCONSISTENT'] };
  const payload = { protocol: 'STOP_AND_RECONCILE', operations: MAINTENANCE_OPERATIONS, recoveryPlanDigest: canonicalDigest(recoveryPlan), preSnapshotDigest: canonicalDigest(context.preSnapshot) };
  const payloadSha256 = canonicalDigest(payload), body = [bindingDigest(context), payloadSha256, context.targetSha, 'MAINTENANCE'].join('\n');
  const approval = { schema: 'phoenix.maintenance-authority/v1', bindingDigest: bindingDigest(context), purpose: 'MAINTENANCE', decision: 'APPROVED', payload, payloadSha256,
    serverRecord: { kind: 'GITHUB_REVIEW', id: 42, state: 'APPROVED', commitId: context.targetSha, submittedAt: at(-1000), reviewer: 'fixture-independent', author: 'fixture-author',
      permission: 'ADMIN', rawRecordSha256: h('a'), bodySha256: digestText(body), body } };
  const plan = { schema: 'phoenix.legacy-maintenance-release-plan/v1', context, scope: RELEASE_SCOPE, approvedPreviousFloorSha: context.previousFloorSha,
    approvedFloorSha: context.targetSha, approval, recoveryPlan };
  const inspectDirectory = () => { const s = fs.lstatSync(directory); return { dev: s.dev, ino: s.ino, uid: s.uid, mode: s.mode }; };
  const store = new MaintenanceReceiptStore(context, { directory, guard() {}, inspectDirectory, expectedUid: process.getuid() });
  const evidence = (kind, value) => createMaintenanceEvidence(kind, context, value, { capturedAt: at(0) });
  const candidate = { ...pin('a', context.targetSha), imageId: context.candidate.imageId, startedAt: at(-1000), restartCount: 0, restartPolicy: 'no', service: 'api', project: context.replacement.project };
  const bootId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const controlSession = { connected: true, broken: false, sessionPid: 4321, databaseOid: 1234, backendStartedAt: at(-1000), applicationName: `phoenix-fence:${bootId}` };
  const candidateBody = { owner: context.owner, api: candidate, bootId, admissionState: 'DENIED', inFlight: 0, pendingChildren: 0, taskGraphs: 0, poisoned: false, stopping: false,
    controlSession, chanjetPolicy: 'HOLD', readonlySync: false, inboundSync: false, web, db };
  const calls = [], admissionCalls = []; let current = { api, web, db }, replacement, registered, joined = false, closed = false, opened = false, drift = false;
  const fields = object => Object.values(object).map(JSON.stringify).join('\t');
  const dockerRead = args => {
    if (args[0] === 'inspect') {
      const service = args[1].replace('phoenix-v3-', ''), value = current[service];
      return fields({ id: value.id, created: at(-200000), image: value.imageId, state: { StartedAt: value.startedAt, Running: true, Health: { Status: value.health } }, restartCount: value.restartCount, mounts: [] });
    }
    const value = Object.entries(current).find(([, p]) => p.imageId === args[2]); assert.ok(value, 'read only owned image');
    return JSON.stringify(value[0] === 'db' ? {} : { 'org.opencontainers.image.revision': value[1].revision });
  };
  const evidenceBinding = { runId: context.owner, runAttempt: '1', targetSha: context.targetSha, floorSha: context.targetSha, capturedAt: at(0), deployMode: 'api' };
  const lease = { observe: async () => evidence('CANDIDATE_CONTROL_LEASE', { ...candidateBody, phase: 'FENCED', admissionExclusive: true, executionExclusive: true, connected: true,
    continuousIngress: true, unknownExecutors: 0 }), close: async ({ succeeded }) => { calls.push(succeeded ? 'CLOSE_SUCCESS' : 'CLOSE_HOLD'); closed = true;
    return evidence('CANDIDATE_CONTROL_RELEASED', { owner: context.owner, connected: false, admissionExclusive: false, executionExclusive: false, ownedBackendGone: true, serverObservationSha256: h('e') }); } };
  const ingress = evidence('INGRESS_FENCE', { state: 'FROZEN', continuous: true, enforcedAt: at(-2000), lastVerifiedAt: at(0), leaseExpiresAt: at(500000), mechanismId: 'fixture-network',
    revival: { state: 'ENFORCED', restartPolicy: 'no', orchestratorsDisabled: true, executorIds: [api.id] } });
  const recovery = evidence('RECOVERY_MATERIAL', { planDigest: canonicalDigest(recoveryPlan), materialsAvailable: true, compatibleCandidateImageId: context.candidate.imageId,
    procedureSha256: recoveryPlan.procedureSha256, operatorConfirmed: recoveryPlan.responsibleOperator, materialsSha256: h('b') });
  const stopped = evidence('STOP_LEGACY', { protocol: 'STOP_AND_RECONCILE', legacyDrainResult: 'UNSUPPORTED', ingressFenceDigest: ingress.evidenceSha256,
    executors: [{ id: api.id, before: api, first: { ...api, running: false, pid: 0, status: 'exited', exitCode: 143, oomKilled: false, checkedAt: at(-2500) },
      second: { ...api, running: false, pid: 0, status: 'exited', exitCode: 143, oomKilled: false, checkedAt: at(-1500) } }],
    database: { ownershipComplete: true, remainingConnections: 0, openTransactions: 0, preparedTransactions: 0, persistentRunning: 0, persistentQueued: 0 } });
  const producers = {
    assertReady: async () => { calls.push('READY'); return evidence('SESSION_PRODUCERS_READY', { scope: RELEASE_SCOPE, operations: MAINTENANCE_OPERATIONS, sourceHelperSha256: context.sourceHelperSha256, detachedEffects: false }); },
    capturePre: async ({ files }) => { calls.push('PRE'); store.immutable(files.pre, captureSnapshot({ ...evidenceBinding, capturedAt: at(-3000), phase: 'PRE_SNAPSHOT' }, dockerRead));
      return evidence('PRE', { healthy: true, runtime: context.preSnapshot, schemaEvidenceSha256: context.schemaEvidenceSha256, migrationPaths: [], unfinishedTransaction: false,
        chanjetPolicy: 'HOLD', readonlySync: false, inboundSync: false, inventory: { hostInventoryComplete: true, unaccountedExecutors: 0, dockerExecutorIds: [api.id], allDockerIds: [api.id, web.id, db.id], classifiedNonExecutorIds: [web.id, db.id] } }); },
    captureRecovery: async () => recovery,
    fenceIngress: async () => { calls.push('FENCE'); return ingress; },
    stopLegacy: async () => { calls.push('STOP'); return stopped; },
    collectReconciliation: async () => { calls.push('RECONCILE'); return { evidence: evidence('RECONCILIATION', { approvedScopeDigest: approval.payloadSha256,
      domains: LEGACY_EVIDENCE_DOMAINS.map(domain => ({ domain, disposition: 'RECONCILED', unknownEffects: 0, pendingWrites: 0, requiresReplay: false, requiresBusinessMutation: false })) }) }; },
    preparePromotion: async () => { calls.push('PROMOTE'); return evidence('PROMOTION_PREPARED', { previousFloorSha: context.previousFloorSha, floorSha: context.targetSha, floorVersion: 3,
      phase: 'CODE_HOLD', owner: context.owner, chanjetPolicy: 'HOLD', readonlySync: false, inboundSync: false, runMigration: false, webSwitched: false, promotionRecordSha256: h('c') }); },
    captureReplacementIsolation: async () => ingress,
    verifyEmptyPublicFence: async () => true,
    registerStartedCandidate: async ({ replacement: replaced }) => { calls.push('REGISTER'); registered = evidence('CANDIDATE_FENCED', { ...candidateBody, candidateReplacementSha256: replaced.evidenceSha256,
      registrationOnly: true, runtimeCreated: false, runtimeRestarted: false }); return { evidence: registered, lease }; },
    collectAdoption: async () => ({ evidence: evidence('CANDIDATE_PUBLIC_ADOPTION', {}), participants: [{ containerId: candidate.id, revision: context.targetSha, bootId, allowedKinds: ['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION'] }] }),
    capturePostAndStartup: async ({ files }) => { calls.push('POST'); const post = captureSnapshot({ ...evidenceBinding, phase: 'POST_SNAPSHOT' }, dockerRead);
      store.immutable(files.post, post);
      const apiStartup = summarizeStartupLogs({ stdout: `${at(-500)} API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n${at(-250)} Nest application started\n`, stderr: '', containerId: candidate.id,
        startedAt: candidate.startedAt, capturedAt: at(0), ...evidenceBinding, readinessVerified: true });
      store.immutable(files.log, startupBundle(post, { api: apiStartup })); },
    completeFormalDeployment: async ({ files }) => { calls.push('FORMAL_COMPLETE');
      const pins = Object.fromEntries(['api', 'web', 'db'].map(name => [name, { imageId: context.preSnapshot[name].imageId, ...(name === 'db' ? {} : { revision: context.preSnapshot[name].revision }) }]));
      const state = beginState({ previous: pins, configSha: context.targetSha, target: context.targetSha, scope: { baseline: context.previousApiSha, target: context.targetSha, changed: [] },
        floor: { floorSha: context.targetSha }, evidence: files, mode: 'api' }); state.switched.api = true; state.active = { ...pins, api: context.candidate }; state.outcome = 'SUCCESS'; state.fixtureOnly = true;
      store.immutable(path.join(directory, `deploy-${context.owner}.json`), state); },
    collectVerifiedCandidate: async ({ formal }) => { calls.push('VERIFIED'); return evidence('VERIFIED_FENCED', { ...candidateBody, apiReadiness: 'PASS', webHttpSmoke: 'PASS', liveReinspect: 'PASS',
      startupEvidenceSha256: formal.digests.log, preSnapshotSha256: formal.digests.pre, postSnapshotSha256: formal.digests.post, unfinishedTransaction: false, runMigration: false }); },
    readFormalCompletion: async () => { calls.push('READ_COMPLETION'); return evidence('COMPLETION', { outcome: 'SUCCESS', owner: context.owner, floorSha: context.targetSha, api: candidate, bootId,
      successReceiptSha256: canonicalDigest(store.read(path.join(directory, `deploy-${context.owner}.json`))), publicManifestSha256: h('d'), allowedKinds: ['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION'],
      chanjetPolicy: 'HOLD', readonlySync: false, inboundSync: false, ingressReleaseAuthorized: true }); },
    publishOpen: async ({ state, verifySuccess }) => { calls.push('OPEN'); assert.equal(state.phase, 'COMPLETED_OPEN'); assert.equal(state.status, 'OPEN_COMMIT_PENDING');
      assert.equal(await verifySuccess([{ containerId: candidate.id, revision: context.targetSha, bootId, allowedKinds: ['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION'] }]), true); opened = true;
      return evidence('OPEN_PUBLISHED', { owner: context.owner, bootId, publicManifestSha256: h('d'), phase: 'OPEN', ingressReleased: true, chanjetPolicy: 'HOLD' }); },
    abortAndJoin: async ({ stage }) => { joined = true; calls.push('JOIN'); return evidence('SESSION_CHILDREN_JOINED', { owner: context.owner, stage,
      allOwnedChildrenObserved: true, activeMutators: 0, activeReadProbes: 0, outstandingChildren: 0, detachedEffects: false, childInventorySha256: h('e') }); },
  };
  const publicControl = {
    bootstrap: async () => { store.assertOwnedIntent('PREPARE_PROMOTION', 'LEGACY_RECONCILED', store.readState().stateDigest); calls.push('PUBLIC_EMPTY');
      return evidence('LEGACY_PUBLIC_FENCED', { owner: context.owner, phase: 'FENCED', participants: [], legacyDrainResult: 'UNSUPPORTED' }); },
    adoptCandidate: async () => { store.assertOwnedIntent('VERIFY_CANDIDATE', 'CANDIDATE_FENCED', store.readState().stateDigest); calls.push('ADOPT');
      return evidence('CANDIDATE_PUBLIC_ADOPTED', { owner: context.owner, phase: 'FENCED', bootId }); },
  };
  const admissionDeps = { guard() {}, inspectDirectory, expectedUid: process.getuid(), now: () => now, verifyAuthority: async () => true };
  const deps = { store, guard() {}, now: () => now, checkMain: () => { if (drift) throw Error('MAINTENANCE_HOLD=SESSION_REMOTE_MAIN_CHANGED'); }, verifyAuthority: async () => true, verifyEvidence: async () => true,
    producers, publicControl, modernAdmission: () => assertModernReleaseAdmission({ directory }, admissionDeps),
    admit: async options => { admissionCalls.push(options.operation); return assertLegacyMaintenanceAdmission({ ...options, directory }, admissionDeps); },
    makeReplacement: options => ({ replace: async () => { calls.push('REPLACE'); const marker = store.assertOwnedIntent('REPLACE_CANDIDATE', 'PROMOTION_PREPARED', options.state.stateDigest);
      current = { api: candidate, web, db }; replacement = evidence('CANDIDATE_REPLACEMENT', { protocol: 'CONTROLLED_COMPOSE_REPLACEMENT', legacyDrainResult: 'UNSUPPORTED', oldDisposition: 'REMOVED_BY_CONTROLLED_REPLACEMENT',
        owner: context.owner, oldExecutor: api, candidate, project: context.replacement.project, replacementIntentSha256: h('e'), operationIntentSha256: canonicalDigest(marker),
        stoppedEvidenceSha256: stopped.evidenceSha256, reconciliationEvidenceSha256: options.prerequisites.reconciliation.evidenceSha256, isolationEvidenceSha256: ingress.evidenceSha256,
        recoveryEvidenceSha256: recovery.evidenceSha256, recoveryMaterialsSha256: h('e'), composeFileSha256: context.replacement.composeFileSha256, overrideSha256: h('e'), commandSha256: h('e'),
        eventsSha256: h('e'), preInventorySha256: h('e'), postInventorySha256: h('e'), unexpectedExecutors: 0, oldImageRetained: true, webDbUnchanged: true, runMigration: false, webSwitched: false,
        candidatePublicMount: { source: '/var/lib/phoenix-background-control', destination: '/run/phoenix-background-control', type: 'bind', readOnly: true },
        coverageScope: 'FIXED_REPLACEMENT_INTERVAL_ONLY', postReplacementState: 'HOLD_CANDIDATE_REVALIDATION_REQUIRED', interval: { start: at(-2000), end: at(-500) },
        lifecycle: { oldDestroy: h('e'), candidateCreate: h('e'), candidateStart: h('e') } }); return replacement; } }),
    verifyFormalFiles: () => verifySessionFormalEvidence({ context, files: session.files }, { guard() {}, read: file => store.read(file), dockerRead }),
    verifyFormalCompletion: async (expected, participants) => {
      const formal = store.read(path.join(directory, `deploy-${context.owner}.json`));
      assert.equal(formal.outcome, 'SUCCESS'); assert.equal(formal.target, context.targetSha); assert.equal(participants[0].containerId, expected.api.id);
      verifySessionFormalEvidence({ context, files: session.files }, { guard() {}, read: file => store.read(file), dockerRead }); return true;
    },
    readFormalState: () => store.read(path.join(directory, `deploy-${context.owner}.json`)),
  };
  let session = new LegacyMaintenanceDeploymentSession({ plan }, deps);
  fs.writeFileSync(path.join(directory, 'owned-fixture.json'), JSON.stringify({ fixtureOnly: true, productionReceipt: false, directory, owner: context.owner }), { mode: 0o600 });
  return { context, plan, store, directory, producers, publicControl, deps, evidence, lease, calls, admissionCalls, candidateBody, dockerRead,
    get session() { return session; }, rebuild(overrides = {}) { session = new LegacyMaintenanceDeploymentSession({ plan }, { ...deps, ...overrides }); return session; },
    driftMain() { drift = true; }, get opened() { return opened; }, get closed() { return closed; }, get joined() { return joined; } };
}

test('owned full session uses real store/admission/evidence checks in fixed order, no invented DRAINED', async () => {
  const f = fixture(); const result = await f.session.run();
  assert.equal(result.formalDeploymentOutcome, 'SUCCESS'); assert.equal(result.controlLeaseRelease, 'VERIFIED_RELEASED'); assert.equal(result.legacyDrainResult, 'UNSUPPORTED'); assert.equal(f.closed, true); assert.equal(f.opened, true);
  assert.deepEqual(f.calls, ['READY', 'PRE', 'JOIN', 'FENCE', 'STOP', 'RECONCILE', 'PUBLIC_EMPTY', 'PROMOTE', 'REPLACE', 'REGISTER', 'ADOPT', 'POST', 'FORMAL_COMPLETE', 'VERIFIED', 'READ_COMPLETION', 'OPEN', 'CLOSE_SUCCESS']);
  assert.equal(f.store.readState().status, 'SUCCESS'); assert.equal(fs.existsSync(f.store.currentFile), false); assert.equal(fs.existsSync(f.store.markerFile), false);
  for (const file of Object.values(f.session.files)) {
    const receipt = f.store.read(file); assert.equal(receipt.schema, MODE_EVIDENCE_SCHEMA); assert.equal(receipt.deployMode, 'api');
  }
  const startup = f.store.read(f.session.files.log);
  assert.equal(startup.phase, 'SERVICE_STARTUP_LOGS'); assert.deepEqual(Object.keys(startup.services), ['api']);
  assert.equal(startup.services.api.phase, 'API_STARTUP_LOG'); assert.equal(startup.services.api.schema, MODE_EVIDENCE_SCHEMA);
  assert.equal(f.store.read(path.join(f.directory, `deploy-${f.context.owner}.json`)).deployMode, 'api');
  assert.ok(f.admissionCalls.includes('REPLACE_CANDIDATE')); assert.ok(f.admissionCalls.includes('OPEN_CANDIDATE'));
  assert.equal(JSON.stringify(result).includes('DRAINED'), false);
  await assert.rejects(f.session.run(), /ALREADY_USED/);
});
test('missing independent approval or production producers holds before first protected effect', async () => {
  for (const overrides of [{ verifyAuthority: async () => false }, { producers: undefined }]) {
    const f = fixture(); f.rebuild(overrides); await assert.rejects(f.session.run()); assert.equal(f.opened, false); assert.equal(fs.existsSync(f.store.stateFile), false);
    assert.equal(fs.existsSync(f.store.markerFile), false); assert.deepEqual(f.calls.filter(c => ['FENCE', 'STOP', 'PROMOTE', 'REPLACE'].includes(c)), []);
  }
});
test('plans reject full/Web/migration, alternate SHA, shell text and adapter module paths', () => {
  const f = fixture();
  for (const mutate of [p => { p.scope = { ...p.scope, mode: 'full' }; }, p => { p.scope = { ...p.scope, buildWeb: true }; }, p => { p.scope = { ...p.scope, runMigration: true }; },
    p => { p.approvedPreviousFloorSha = sha('f'); }, p => { p.shell = 'anything'; }, p => { p.adapterModule = '/tmp/adapter.mjs'; }]) {
    const plan = structuredClone(f.plan); mutate(plan); assert.throws(() => validateReleasePlan(plan));
  }
});
test('unknown reconciliation blocks promotion; no risk acceptance is inferred', async () => {
  const f = fixture(); f.producers.collectReconciliation = async () => ({ evidence: f.evidence('RECONCILIATION', { approvedScopeDigest: f.plan.approval.payloadSha256, domains: [] }) });
  await assert.rejects(f.session.run(), /FIVE_RECONCILIATION/); assert.equal(f.calls.includes('PROMOTE'), false); assert.equal(f.opened, false);
});
test('real current-owner mismatch prevents next typed effect', async () => {
  const f = fixture(); const original = f.producers.fenceIngress;
  f.producers.fenceIngress = async request => { const envelope = await original(request); const current = f.store.read(f.store.currentFile); current.owner = '999999-1';
    fs.writeFileSync(f.store.currentFile, JSON.stringify(current), { mode: 0o600 }); return envelope; };
  await assert.rejects(f.session.run()); assert.equal(f.calls.includes('STOP'), false); assert.equal(f.opened, false);
});
test('promotion or adoption failure preserves operation marker and never retries/rolls back', async () => {
  for (const stage of ['promotion', 'adoption']) {
    const f = fixture(); if (stage === 'promotion') f.producers.preparePromotion = async () => { throw Error('fixture promotion interrupted'); };
    else f.publicControl.adoptCandidate = async () => { throw Error('fixture adoption interrupted'); };
    await assert.rejects(f.session.run()); assert.equal(fs.existsSync(f.store.markerFile), true); assert.equal(f.opened, false); assert.equal(f.joined, true);
    if (stage === 'adoption') assert.equal(f.closed, true);
  }
});
test('real formal PRE/POST validator blocks changed Web identity before formal complete', async () => {
  const f = fixture(), capture = f.producers.capturePostAndStartup;
  f.producers.capturePostAndStartup = async request => { await capture(request); const post = f.store.read(request.files.post); post.containers.web.id = h('f');
    fs.writeFileSync(request.files.post, JSON.stringify(post), { mode: 0o600 }); };
  await assert.rejects(f.session.run(), /WEB_CHANGED/); assert.equal(f.calls.includes('FORMAL_COMPLETE'), false); assert.equal(f.opened, false);
});
test('new API-only maintenance transaction rejects genuine historical, Web and full PRE receipts', async () => {
  for (const mode of [undefined, 'web', 'full']) {
    const f = fixture(), capture = f.producers.capturePre;
    f.producers.capturePre = async request => {
      const envelope = await capture(request);
      // Generate each alternative through the real capture API, without editing
      // a schema field to manufacture compatibility or a false mode receipt.
      const pre = captureSnapshot({ phase: 'PRE_SNAPSHOT', runId: f.context.owner, runAttempt: '1', targetSha: f.context.targetSha,
        floorSha: f.context.targetSha, capturedAt: at(-3000), ...(mode ? { deployMode: mode } : {}) }, f.dockerRead);
      fs.writeFileSync(request.files.pre, JSON.stringify(pre), { mode: 0o600 }); return envelope;
    };
    await assert.rejects(f.session.run(), /MODE_BINDING/);
    assert.equal(f.calls.includes('FORMAL_COMPLETE'), false); assert.equal(f.opened, false);
  }
});
test('new API-only maintenance transaction rejects genuine unbundled historical API startup receipt', async () => {
  const f = fixture(), capture = f.producers.capturePostAndStartup;
  f.producers.capturePostAndStartup = async request => {
    await capture(request);
    const startup = summarizeStartupLogs({ stdout: `${at(-500)} API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n${at(-250)} Nest application started\n`, stderr: '',
      containerId: f.candidateBody.api.id, startedAt: f.candidateBody.api.startedAt, capturedAt: at(0), runId: f.context.owner, runAttempt: '1',
      targetSha: f.context.targetSha, floorSha: f.context.targetSha, readinessVerified: true });
    fs.writeFileSync(request.files.log, JSON.stringify(startup), { mode: 0o600 });
  };
  await assert.rejects(f.session.run(), /MODE_BINDING/);
  assert.equal(f.calls.includes('FORMAL_COMPLETE'), false); assert.equal(f.opened, false);
});
test('lost candidate lease or missing formal SUCCESS never reaches OPEN', async () => {
  for (const stage of ['lease', 'success']) {
    const f = fixture(); if (stage === 'lease') f.lease.observe = async () => f.evidence('CANDIDATE_CONTROL_LEASE', { ...f.candidateBody, connected: false });
    else f.producers.completeFormalDeployment = async () => {};
    await assert.rejects(f.session.run()); assert.equal(f.opened, false); assert.equal(f.closed, true); assert.equal(fs.existsSync(f.store.markerFile), stage === 'success');
  }
});
test('OPEN failure retains private OPEN_COMMIT_PENDING and cannot be replayed', async () => {
  const f = fixture(); f.producers.publishOpen = async () => { throw Error('fixture public write interrupted'); };
  await assert.rejects(f.session.run()); assert.equal(f.store.readState().status, 'OPEN_COMMIT_PENDING'); assert.equal(fs.existsSync(f.store.markerFile), true);
  assert.equal(f.closed, true); assert.equal(f.opened, false); await assert.rejects(f.session.run(), /ALREADY_USED/);
});
test('main drift during an asynchronous typed step aborts and joins; no later complete/OPEN', async () => {
  const f = fixture(); let sawAbort = false;
  f.producers.capturePostAndStartup = async ({ signal }) => { f.driftMain(); await wait(30); sawAbort = signal.aborted; throw Error('fixture child joined after main drift'); };
  f.rebuild({ pollMs: 2 }); await assert.rejects(f.session.run()); assert.equal(sawAbort, true); assert.equal(f.joined, true); assert.equal(f.closed, true);
  assert.equal(f.calls.includes('FORMAL_COMPLETE'), false); assert.equal(f.opened, false);
});
test('publication must consume exact-participant formal verification rather than ignoring its callback', async () => {
  const f = fixture(); f.producers.publishOpen = async () => f.evidence('OPEN_PUBLISHED', { owner: f.context.owner, bootId: f.candidateBody.bootId,
    publicManifestSha256: h('d'), phase: 'OPEN', ingressReleased: true, chanjetPolicy: 'HOLD' });
  await assert.rejects(f.session.run(), /VERIFIER_NOT_CONSUMED/); assert.equal(f.store.readState().status, 'OPEN_COMMIT_PENDING'); assert.equal(f.opened, false);
});
test('window expiry during an asynchronous step aborts the owned child and holds pending state', async () => {
  const f = fixture(); let expired = false, sawAbort = false;
  f.producers.capturePostAndStartup = async ({ signal }) => { expired = true; await wait(30); sawAbort = signal.aborted; throw Error('fixture expired child joined'); };
  f.rebuild({ now: () => expired ? now + 700000 : now, pollMs: 2 });
  await assert.rejects(f.session.run()); assert.equal(sawAbort, true); assert.equal(f.joined, true); assert.equal(f.closed, true);
  assert.equal(f.opened, false); assert.equal(fs.existsSync(f.store.markerFile), true);
});
test('failed, forged or incomplete child join never releases lease and records an unknown-state incident', async () => {
  for (const kind of ['throws', 'forged', 'incomplete']) {
    const f = fixture(); f.producers.capturePostAndStartup = async () => { throw Error('fixture effect failed'); };
    const originalJoin = f.producers.abortAndJoin;
    f.producers.abortAndJoin = async ({ stage }) => {
      if (stage === 'PREFLIGHT_HANDOFF') return originalJoin({ stage });
      if (kind === 'throws') throw Error('fixture join failed');
      const envelope = f.evidence('SESSION_CHILDREN_JOINED', { owner: f.context.owner, stage, allOwnedChildrenObserved: true,
        activeMutators: kind === 'incomplete' ? 1 : 0, activeReadProbes: 0, outstandingChildren: 0, detachedEffects: false, childInventorySha256: h('e') });
      if (kind === 'forged') envelope.evidenceSha256 = h('f'); return envelope;
    };
    await assert.rejects(f.session.run(), /CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/);
    assert.equal(f.closed, false); assert.equal(f.opened, false); assert.equal(fs.existsSync(f.store.markerFile), true);
    const incident = f.store.read(path.join(f.directory, `maintenance-session-children-unverified-${f.context.owner}.json`));
    assert.equal(incident.childrenState, 'UNKNOWN'); assert.equal(incident.leaseRelease, 'NOT_ATTEMPTED'); assert.equal(incident.locksSurviveProcessCrash, false);
  }
});
test('lease close failure after formal SUCCESS preserves real OPEN state and adds a separate recovery incident', async () => {
  for (const mode of ['throws', 'unverified-release']) {
    const f = fixture(); f.lease.close = async () => { if (mode === 'throws') throw Error('fixture close failed'); return undefined; };
    await assert.rejects(f.session.run(), /FORMAL_SUCCESS_LEASE_RELEASE_INCIDENT/);
    assert.equal(f.store.readState().status, 'SUCCESS'); assert.equal(f.opened, true);
    const incident = f.store.read(path.join(f.directory, `maintenance-session-lease-release-unverified-${f.context.owner}.json`));
    assert.equal(incident.formalDeploymentOutcome, 'SUCCESS'); assert.equal(incident.publicState, 'OPEN_ALREADY_PUBLISHED');
    assert.equal(incident.leaseRelease, 'UNKNOWN'); assert.equal(incident.outcome, 'MANUAL_RECOVERY_REQUIRED');
  }
});
test('a permanently pending lease probe times out, aborts, joins and never stalls monitor shutdown or OPEN', async () => {
  const f = fixture(); let probeAborted = false;
  f.lease.observe = async ({ signal }) => { signal.addEventListener('abort', () => { probeAborted = true; }); return new Promise(() => {}); };
  f.rebuild({ readTimeoutMs: 20, cleanupTimeoutMs: 30, pollMs: 2 }); const started = Date.now();
  await assert.rejects(f.session.run(), /CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/); assert.ok(Date.now() - started < 2000);
  assert.equal(probeAborted, true); assert.equal(f.joined, true); assert.equal(f.closed, false); assert.equal(f.opened, false);
});
test('lease evidence verifier permanently pending is bounded and remains registered; control is retained', async () => {
  const f = fixture(); let verifierEntered = false, verifierAborted = false;
  f.rebuild({ readTimeoutMs: 20, cleanupTimeoutMs: 30, pollMs: 2, verifyEvidence: async (envelope, expected) => {
    if (envelope.kind !== 'CANDIDATE_CONTROL_LEASE') return true;
    verifierEntered = true; expected.signal.addEventListener('abort', () => { verifierAborted = true; }); return new Promise(() => {});
  } });
  const started = Date.now(); await assert.rejects(f.session.run(), /CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/);
  assert.ok(Date.now() - started < 2000); assert.equal(verifierEntered, true); assert.equal(verifierAborted, true);
  assert.equal(f.closed, false); assert.equal(f.opened, false); assert.equal(f.session.monitorBusy, false);
  assert.ok([...f.session.pendingReads].some(read => read.kind === 'CANDIDATE_LEASE_PROBE'));
  const incident = f.store.read(path.join(f.directory, `maintenance-session-children-unverified-${f.context.owner}.json`));
  assert.equal(incident.childrenState, 'UNKNOWN'); assert.equal(incident.leaseRelease, 'NOT_ATTEMPTED');
});
test('monitor shutdown itself has a hard bound for an unregistered or permanently pending monitor task', async () => {
  for (const task of [null, new Promise(() => {})]) {
    const f = fixture(); f.rebuild({ cleanupTimeoutMs: 20 }); f.session.monitorBusy = true; f.session.monitorTask = task;
    const started = Date.now(); await assert.rejects(f.session.stopMonitor(), /MONITOR_STOP_UNVERIFIED/);
    assert.ok(Date.now() - started < 1000); assert.equal(f.session.monitorStopUnknown, true); assert.equal(f.closed, false); assert.equal(f.opened, false);
  }
});
test('early producer failure still leaves durable reservation and demands actual child settlement', async () => {
  const f = fixture(); let child;
  f.producers.assertReady = async ({ registerOwnedChild }) => { child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' }); registerOwnedChild(child); throw Error('fixture early producer failed'); };
  f.rebuild({ cleanupTimeoutMs: 30 });
  try {
    await assert.rejects(f.session.run(), /CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/);
    assert.equal(fs.existsSync(f.store.markerFile), true); assert.equal(f.closed, false); assert.equal(f.opened, false);
    assert.equal(f.store.read(f.store.markerFile).operation, 'SESSION_PREFLIGHT');
  } finally { if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; } }
});
test('a producer returning with a registered live child cannot reach the next effect or OPEN', async () => {
  const f = fixture(), original = f.producers.stopLegacy; let child;
  f.producers.stopLegacy = async request => { child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' }); request.registerOwnedChild(child); return original(request); };
  f.rebuild({ cleanupTimeoutMs: 30 });
  try { await assert.rejects(f.session.run(), /CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/); assert.equal(f.calls.includes('RECONCILE'), false); assert.equal(f.opened, false); }
  finally { if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; } }
});
test('effect ignores abort and false zero-child join cannot release lease or commit late state', async () => {
  const f = fixture(); let finish;
  f.producers.capturePostAndStartup = async () => new Promise(resolve => { finish = resolve; });
  f.rebuild({ stepTimeoutMs: 100, cleanupTimeoutMs: 30 });
  await assert.rejects(f.session.run(), /CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/);
  assert.equal(f.closed, false); assert.equal(f.opened, false); assert.equal(fs.existsSync(f.store.markerFile), true);
  finish(); await wait(20); assert.equal(f.calls.includes('FORMAL_COMPLETE'), false); assert.notEqual(f.store.readState().status, 'SUCCESS');
});
test('permanently pending join and close have hard bounds and explicit incident results', async () => {
  for (const stage of ['join', 'close']) {
    const f = fixture();
    if (stage === 'join') { const join = f.producers.abortAndJoin; f.producers.abortAndJoin = async request => request.stage === 'PREFLIGHT_HANDOFF' ? join(request) : new Promise(() => {});
      f.producers.capturePostAndStartup = async () => { throw Error('fixture effect failed'); }; }
    else f.lease.close = async () => new Promise(() => {});
    f.rebuild({ cleanupTimeoutMs: 30 }); const started = Date.now();
    await assert.rejects(f.session.run(), stage === 'join' ? /CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/ : /FORMAL_SUCCESS_LEASE_RELEASE_INCIDENT/);
    assert.ok(Date.now() - started < 2000); assert.equal(f.opened, stage === 'close');
  }
});
test('protected CLI rejects arbitrary shell/stdin commands without loading adapter code', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/ops/production-maintenance-deployment-session.mjs', 'sh', '-c', 'anything'], { stdio: ['ignore', 'pipe', 'pipe'] }), error => {
    assert.match(error.stderr.toString(), /SESSION_FIXED_COMMAND_REQUIRED/); return true;
  });
});
