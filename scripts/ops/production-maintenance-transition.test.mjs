import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LegacyMaintenanceTransition, validateRecoveryMaterial, MAINTENANCE_OPERATIONS } from './production-maintenance-transition.mjs';
import { MaintenanceReceiptStore, createMaintenanceEvidence, bindingDigest, canonicalDigest, MAINTENANCE_CONTEXT_SCHEMA, MAINTENANCE_AUTHORITY_SCHEMA } from './production-maintenance-receipts.mjs';
import { LEGACY_EVIDENCE_DOMAINS } from './background-control-legacy-transition.mjs';
import { fixture, harness, toStopped, toVerified, now, time, hash, sha, operations, pin } from '../ci/maintenance-transition-fixture.mjs';

test('default authority and evidence verifiers fail closed before any stop/write', async () => {
  const h = harness(); const noAuthority = new LegacyMaintenanceTransition({ context: h.context }, { ...h.dependencies, verifyAuthority: undefined });
  await assert.rejects(noAuthority.prepare(h.material), /INDEPENDENT_AUTHORITY/); assert.deepEqual(fs.readdirSync(h.directory), []);
  const noEvidence = new LegacyMaintenanceTransition({ context: h.context }, { ...h.dependencies, verifyEvidence: undefined });
  await assert.rejects(noEvidence.prepare(h.material), /INDEPENDENT_EVIDENCE/); assert.deepEqual(h.calls, []);
});
test('full isolated protocol retains legacy UNSUPPORTED and commits private authority before OPEN', async () => {
  const h = harness(); await toVerified(h); const state = await h.engine.complete({ completionEvidence: h.completion });
  assert.equal(state.phase, 'COMPLETED_OPEN'); assert.equal(state.status, 'SUCCESS'); assert.equal(state.legacyDrainResult, 'UNSUPPORTED');
  assert.deepEqual(h.calls, ['FENCE', 'STOP', 'OPEN']); assert.equal(fs.existsSync(h.store.markerFile), false);
  assert.ok(fs.readdirSync(h.directory).some(n => n.startsWith('maintenance-intent-')));
  for (const ref of state.receipts) assert.equal(fs.statSync(h.store.receiptFile(ref)).mode & 0o777, 0o600);
});
test('successful stop alone defaults HOLD; no promotion before five-domain reconciliation', async () => {
  const h = harness(); await toStopped(h); assert.equal(h.store.readState().status, 'HOLD_RECONCILIATION_REQUIRED');
  await assert.rejects(h.engine.preparePromotion(), /PHASE_OR_RESUME/);
  const bad = structuredClone(h.reconciliation.body); bad.domains[0].unknownEffects = 1;
  await assert.rejects(h.engine.reconcile({ evidence: h.evidence('RECONCILIATION', bad) }), /UNKNOWN_EFFECTS/);
});
test('unknown effects require object-scoped independently verified no-replay approval', async () => {
  const h = harness(); await toStopped(h); const body = structuredClone(h.reconciliation.body); const domain = body.domains[0];
  Object.assign(domain, { unknownEffects: 1, unknownObjects: ['notification/42'], disposition: 'SCOPED_NO_REPLAY_ACCEPTED' });
  const evidence = h.evidence('RECONCILIATION', body);
  const approval = h.approval('UNKNOWN_EFFECTS', { domain: domain.domain, reconciliationEvidenceSha256: evidence.evidenceSha256, objects: domain.unknownObjects, noReplay: true, businessMutation: false, scopeDigest: h.material.approval.payloadSha256 });
  await assert.rejects(h.engine.reconcile({ evidence }), /INDEPENDENT_AUTHORITY/);
  const wrong = structuredClone(approval); wrong.payload.objects = ['notification/43']; wrong.payloadSha256 = canonicalDigest(wrong.payload);
  await assert.rejects(h.engine.reconcile({ evidence, unknownApprovals: [wrong] }), /INDEPENDENT_AUTHORITY/);
  const state = await h.engine.reconcile({ evidence, unknownApprovals: [approval] }); assert.equal(state.phase, 'LEGACY_RECONCILED');
});
test('business replay/repair is never implied by scoped risk acceptance', async () => {
  for (const property of ['requiresReplay', 'requiresBusinessMutation']) {
    const h = harness(); await toStopped(h); const body = structuredClone(h.reconciliation.body); body.domains[1][property] = true;
    await assert.rejects(h.engine.reconcile({ evidence: h.evidence('RECONCILIATION', body) }), /UNRECONCILED/);
  }
});
test('recovery material is mandatory before stop and excludes below-floor auto rollback', async () => {
  const h = harness(); const p = structuredClone(h.material.recoveryPlan); p.automaticOldRuntimeRollback = true;
  assert.throws(() => validateRecoveryMaterial(p, h.context), /RECOVERY_MATERIAL/);
  const m = structuredClone(h.material); m.recoveryPlan.materials = [];
  await assert.rejects(h.engine.prepare(m), /RECOVERY_MATERIAL/); assert.deepEqual(h.calls, []);
});
test('healthy PRE, exact image, complete inventory, schema and zero migration paths are independent predicates', async () => {
  for (const mutate of [b => { b.runtime.api.health = 'unhealthy'; }, b => { b.inventory.hostInventoryComplete = false; }, b => { b.inventory.allDockerIds.push(hash('a')); },
    b => { b.schemaEvidenceSha256 = hash('f'); }, b => { b.migrationPaths.push('migration.sql'); }, b => { b.inboundSync = true; }]) {
    const h = harness(); const body = structuredClone(h.material.preEvidence.body); mutate(body);
    await assert.rejects(h.engine.prepare({ ...h.material, preEvidence: h.evidence('PRE', body) })); assert.deepEqual(h.calls, []);
  }
});
test('marker precedes stop and persists on crash; restart cannot retry or un-fence', async () => {
  for (const point of ['AFTER_INTENT', 'AFTER_EFFECT', 'AFTER_RECEIPT', 'AFTER_COMMIT']) {
    const h = harness(); await h.engine.prepare(h.material); await h.engine.fenceIngress();
    const engine = new LegacyMaintenanceTransition({ context: h.context }, { ...h.dependencies, failurePoint: p => { if (p === point) throw new Error('SIMULATED_CRASH'); } });
    await assert.rejects(engine.stopLegacy(), /SIMULATED_CRASH/); assert.equal(fs.existsSync(h.store.markerFile), true);
    await assert.rejects(h.engine.stopLegacy(), /UNRESOLVED_MAINTENANCE_TRANSACTION/); assert.ok(!h.calls.includes('OPEN'));
    if (point === 'AFTER_INTENT') assert.ok(!h.calls.includes('STOP'));
  }
});
test('candidate or public OPEN failure cannot declare SUCCESS or auto restore old runtime', async () => {
  const h = harness(); await toVerified(h);
  h.adapters.openCandidate = async ({ state }) => { assert.equal(h.store.readState().stateDigest, state.stateDigest); throw new Error('PUBLIC_PUBLISH_FAILED'); };
  await assert.rejects(h.engine.complete({ completionEvidence: h.completion }), /PUBLIC_PUBLISH_FAILED/);
  assert.equal(h.store.readState().status, 'OPEN_COMMIT_PENDING'); assert.ok(fs.existsSync(h.store.markerFile)); assert.ok(!h.calls.includes('OPEN'));
});
test('stale window, changed exact SHA, self-review and evidence tampering reject', async () => {
  const f = fixture(); const changed = structuredClone(f.context); changed.targetSha = sha('d');
  assert.throws(() => new LegacyMaintenanceTransition({ context: changed }), /EXACT_CONTEXT/);
  const expired = harness(f, { now: () => now + 700000 }); await assert.rejects(expired.engine.prepare(expired.material), /WINDOW_CLOSED/);
  const h = harness(); const m = structuredClone(h.material); m.approval.serverRecord.reviewer = m.approval.serverRecord.author;
  await assert.rejects(h.engine.prepare(m), /INDEPENDENT_AUTHORITY/);
  const tampered = structuredClone(h.material); tampered.preEvidence.body.healthy = false;
  await assert.rejects(h.engine.prepare(tampered), /EVIDENCE_BINDING/);
});
test('expiry of ingress proof cannot authorize stop', async () => {
  const h = harness(); await h.engine.prepare(h.material); const body = structuredClone(h.ingress.body); body.leaseExpiresAt = time(-1);
  h.adapters.fenceIngress = async () => h.evidence('INGRESS_FENCE', body);
  await assert.rejects(h.engine.fenceIngress(), /CONTINUOUS_INGRESS/); assert.ok(fs.existsSync(h.store.markerFile)); assert.deepEqual(h.calls, []);
});
test('ingress expiry after fencing blocks before the stop adapter and before a new marker', async () => {
  const h = harness(); await h.engine.prepare(h.material); await h.engine.fenceIngress();
  const later = new LegacyMaintenanceTransition({ context: h.context }, { ...h.dependencies, now: () => now + 400000 });
  await assert.rejects(later.stopLegacy(), /CONTINUOUS_INGRESS/);
  assert.deepEqual(h.calls, ['FENCE']); assert.equal(fs.existsSync(h.store.markerFile), false);
});
test('failure after private OPEN authority commit leaves a durable marker and cannot retry', async () => {
  const h = harness(); await toVerified(h);
  const crash = new LegacyMaintenanceTransition({ context: h.context }, { ...h.dependencies, failurePoint: point => { if (point === 'AFTER_PRIVATE_OPEN_COMMIT') throw new Error('SIMULATED_CRASH'); } });
  await assert.rejects(crash.complete({ completionEvidence: h.completion }), /SIMULATED_CRASH/);
  assert.equal(h.store.readState().status, 'OPEN_COMMIT_PENDING'); assert.ok(fs.existsSync(h.store.markerFile)); assert.ok(!h.calls.includes('OPEN'));
  await assert.rejects(h.engine.complete({ completionEvidence: h.completion }), /UNRESOLVED_MAINTENANCE_TRANSACTION/);
});
test('no adapter means UNIMPLEMENTED/HOLD before mutation intent', async () => {
  const h = harness(undefined, { adapters: {} }); await h.engine.prepare(h.material);
  await assert.rejects(h.engine.fenceIngress(), /ADAPTER_FENCE_INGRESS_UNIMPLEMENTED/); assert.equal(fs.existsSync(h.store.markerFile), false);
});
test('lifecycle owner survives per-step intent archive and rejects a second owner until final success', async () => {
  for (const phase of ['PREPARED', 'INGRESS_FENCED', 'STOPPED_UNRECONCILED']) {
    const h = harness(); await h.engine.prepare(h.material);
    if (phase !== 'PREPARED') await h.engine.fenceIngress();
    if (phase === 'STOPPED_UNRECONCILED') await h.engine.stopLegacy();
    assert.equal(fs.existsSync(h.store.markerFile), false); assert.equal(fs.existsSync(h.store.currentFile), true);
    const context = { ...h.context, owner: '456-1' };
    const store = new MaintenanceReceiptStore(context, { directory: h.directory, guard: () => {}, inspectDirectory: h.store.inspect, expectedUid: process.getuid() });
    const other = new LegacyMaintenanceTransition({ context }, { ...h.dependencies, store });
    await assert.rejects(other.prepare(h.material), /ANOTHER_MAINTENANCE_OWNER_ACTIVE/);
    if (phase === 'PREPARED') assert.equal((await h.engine.fenceIngress()).phase, 'INGRESS_FENCED');
  }
});
test('async approval crossing window closes before adapter and cannot mutate', async () => {
  const h = harness(); await h.engine.prepare(h.material); let clock = now;
  const later = new LegacyMaintenanceTransition({ context: h.context }, { ...h.dependencies, now: () => clock,
    verifyAuthority: async () => { clock = now + 700000; return true; } });
  await assert.rejects(later.fenceIngress(), /WINDOW_CLOSED/); assert.deepEqual(h.calls, []); assert.equal(fs.existsSync(h.store.markerFile), false);
});
test('candidate admission, detached graphs and database session must all be verified quiescent', async () => {
  for (const mutate of [b => { b.taskGraphs = 1; }, b => { delete b.taskGraphs; }, b => { b.controlSession.connected = false; }, b => { b.poisoned = true; }]) {
    const h = harness(); await toStopped(h); await h.engine.reconcile({ evidence: h.reconciliation }); await h.engine.preparePromotion(); await h.engine.replaceCandidate();
    const body = structuredClone(h.candidate); mutate(body); h.adapters.startCandidate = async () => h.evidence('CANDIDATE_FENCED', body);
    await assert.rejects(h.engine.startCandidate(), /CANDIDATE_BACKGROUND_GRAPH_OR_SESSION/); assert.ok(fs.existsSync(h.store.markerFile));
  }
});
test('candidate verification cannot reuse a different boot database backend or leave a detached graph', async () => {
  for (const mutate of [b => { b.taskGraphs = 1; }, b => { b.controlSession.sessionPid++; }]) {
    const h = harness(); await toStopped(h); await h.engine.reconcile({ evidence: h.reconciliation }); await h.engine.preparePromotion(); await h.engine.replaceCandidate(); await h.engine.startCandidate();
    const original = h.adapters.verifyCandidate; h.adapters.verifyCandidate = async () => { const envelope = await original(); const body = structuredClone(envelope.body); mutate(body); return h.evidence('VERIFIED_FENCED', body); };
    await assert.rejects(h.engine.verifyCandidate()); assert.equal(h.store.readState().phase, 'CANDIDATE_FENCED');
  }
});
test('replacement is a mandatory committed state and startup only registers the already started exact candidate', async () => {
  const h = harness(); await toStopped(h); await h.engine.reconcile({ evidence: h.reconciliation }); await h.engine.preparePromotion();
  await assert.rejects(h.engine.startCandidate(), /PHASE_OR_RESUME/);
  const replacement = await h.engine.replaceCandidate(); assert.equal(replacement.phase, 'CANDIDATE_REPLACED'); assert.equal(replacement.status, 'HOLD_CANDIDATE_REVALIDATION_REQUIRED');
  const original = h.adapters.startCandidate;
  h.adapters.startCandidate = async () => { const envelope = await original(); const body = { ...envelope.body, runtimeCreated: true }; return h.evidence('CANDIDATE_FENCED', body); };
  await assert.rejects(h.engine.startCandidate(), /CANDIDATE_STARTUP_NOT_FENCED/); assert.equal(h.store.readState().phase, 'CANDIDATE_REPLACED');
});
test('replacement evidence is linked to the owned operation and exact prior immutable receipts', async () => {
  for (const mutate of [b => { b.operationIntentSha256 = hash('f'); }, b => { b.stoppedEvidenceSha256 = hash('f'); }, b => { b.reconciliationEvidenceSha256 = hash('f'); },
    b => { b.runMigration = true; }, b => { b.coverageScope = 'DRAINED'; }, b => { b.candidate.id = b.oldExecutor.id; }]) {
    const h = harness(); await toStopped(h); await h.engine.reconcile({ evidence: h.reconciliation }); await h.engine.preparePromotion();
    const original = h.adapters.replaceCandidate;
    h.adapters.replaceCandidate = async args => { const e = await original(args); const body = structuredClone(e.body); mutate(body); return h.evidence('CANDIDATE_REPLACEMENT', body); };
    await assert.rejects(h.engine.replaceCandidate(), /CONTROLLED_CANDIDATE_REPLACEMENT/); assert.equal(h.store.readState().phase, 'PROMOTION_PREPARED'); assert.ok(fs.existsSync(h.store.markerFile));
  }
});
test('STOP effect keeps exact prior private state while its durable intent expresses STOPPING_LEGACY', async () => {
  const h = harness(); await h.engine.prepare(h.material); await h.engine.fenceIngress(); const prior = h.store.readState(); const original = h.adapters.stopLegacy;
  h.adapters.stopLegacy = async args => {
    assert.equal(args.state.stateDigest, prior.stateDigest); assert.equal(args.state.phase, 'INGRESS_FENCED');
    const marker = h.store.assertOwnedEffectState('STOP_LEGACY', args.state); assert.equal(marker.effectPhase, 'STOPPING_LEGACY');
    assert.equal(marker.previousStateDigest, prior.stateDigest); return original(args);
  };
  await h.engine.stopLegacy();
});
test('OPEN effect accepts only the exact committed typed projection and rejects stale, different operation or changed private state', async () => {
  for (const mode of ['STALE', 'OPERATION', 'PRIVATE_CHANGE']) {
    const h = harness(); await toVerified(h); const prior = h.store.readState();
    h.adapters.openCandidate = async args => {
      const marker = h.store.assertOwnedEffectState('OPEN_CANDIDATE', args.state); assert.equal(marker.previousState.stateDigest, prior.stateDigest);
      if (mode === 'STALE') assert.throws(() => h.store.assertOwnedEffectState('OPEN_CANDIDATE', prior), /EFFECT_STATE_NOT_CURRENT/);
      if (mode === 'OPERATION') assert.throws(() => h.store.assertOwnedEffectState('STOP_LEGACY', args.state), /OPERATION_INTENT_NOT_OWNED/);
      if (mode === 'PRIVATE_CHANGE') {
        const { stateDigest, ...content } = args.state; const changed = h.store.writeState({ ...content, updatedAt: time(1) });
        assert.throws(() => h.store.assertOwnedEffectState('OPEN_CANDIDATE', changed), /INVALID_OPEN_EFFECT_PROJECTION/);
      }
      throw new Error('SIMULATED_ADAPTER_HOLD');
    };
    await assert.rejects(h.engine.complete({ completionEvidence: h.completion }), /SIMULATED_ADAPTER_HOLD/); assert.ok(fs.existsSync(h.store.markerFile));
  }
});

async function toCandidateAnchor(h) {
  await toStopped(h); await h.engine.reconcile({ evidence: h.reconciliation });
  await h.engine.preparePromotion(); await h.engine.replaceCandidate();
  const replaced = h.store.readState(); await h.engine.startCandidate();
  return { replaced, candidate: h.store.readState() };
}
const anchor = (h, replaced) => h.store.readCandidateLeasePhaseAnchor({ expectedStateDigest: h.store.readState().stateDigest, replacementStateDigest: replaced.stateDigest });
const archive = (h, state) => path.join(h.directory, `maintenance-intent-${h.context.owner}-${state.stateDigest}.json`);
test('candidate phase anchor follows actual committed START/VERIFY and private OPEN without reconstructing timestamps', async () => {
  let sequence = 0; const h = harness(fixture(), { now: () => now + sequence++ });
  const { replaced, candidate } = await toCandidateAnchor(h);
  const original = anchor(h, replaced);
  assert.equal(original.currentPhase, 'CANDIDATE_FENCED'); assert.equal(original.candidateStateDigest, candidate.stateDigest);
  assert.notEqual(candidate.updatedAt, h.store.readReceipt(candidate.receipts.at(-1)).recordedAt);
  assert.equal(original.pendingIntentDigest, null); assert.equal(original.verifiedReceiptDigest, null);
  const verify = h.adapters.verifyCandidate;
  h.adapters.verifyCandidate = async request => {
    const pending = anchor(h, replaced);
    assert.ok(pending.pendingIntentDigest); assert.equal(pending.candidateStateDigest, candidate.stateDigest);
    return verify(request);
  };
  await h.engine.verifyCandidate();
  const verified = anchor(h, replaced);
  assert.equal(verified.currentPhase, 'VERIFIED_FENCED'); assert.equal(verified.candidateStateDigest, candidate.stateDigest);
  assert.equal(verified.startIntentDigest, original.startIntentDigest); assert.ok(verified.verifyIntentDigest);
  const open = h.adapters.openCandidate;
  h.adapters.openCandidate = async request => {
    const pending = anchor(h, replaced);
    assert.equal(pending.currentPhase, 'COMPLETED_OPEN'); assert.equal(pending.currentStatus, 'OPEN_COMMIT_PENDING');
    assert.equal(pending.candidateStateDigest, candidate.stateDigest); assert.ok(pending.openIntentDigest);
    assert.equal(pending.verifyIntentDigest, verified.verifyIntentDigest);
    return open(request);
  };
  await h.engine.complete({ completionEvidence: h.completion });
  assert.throws(() => anchor(h, replaced)); // Success cannot mint another FENCED lease anchor.
});
test('phase anchor rejects wrong exact current/root-start digests and leaves all evidence unchanged', async () => {
  const h = harness(); const { replaced } = await toCandidateAnchor(h);
  const before = fs.readdirSync(h.directory).sort().map(f => [f, fs.readFileSync(path.join(h.directory, f), 'utf8')]);
  assert.throws(() => h.store.readCandidateLeasePhaseAnchor({ expectedStateDigest: hash('e'), replacementStateDigest: replaced.stateDigest }));
  assert.throws(() => h.store.readCandidateLeasePhaseAnchor({ expectedStateDigest: h.store.readState().stateDigest, replacementStateDigest: hash('e') }));
  assert.deepEqual(fs.readdirSync(h.directory).sort().map(f => [f, fs.readFileSync(path.join(h.directory, f), 'utf8')]), before);
});
for (const field of ['operation', 'from', 'to', 'owner', 'contextDigest', 'previousStateDigest', 'startedAt']) {
  test(`phase anchor rejects altered committed START ${field}`, async () => {
    const h = harness(); const { replaced, candidate } = await toCandidateAnchor(h);
    const file = archive(h, candidate), intent = JSON.parse(fs.readFileSync(file)); intent[field] = field.endsWith('Digest') ? hash('e') : 'WRONG';
    fs.writeFileSync(file, JSON.stringify(intent)); assert.throws(() => anchor(h, replaced), /CANDIDATE_COMMITTED_INTENT_BINDING/);
  });
}
test('missing START archive or stale active START marker is not treated as committed registration', async () => {
  const h = harness(); const { replaced, candidate } = await toCandidateAnchor(h);
  fs.renameSync(archive(h, candidate), path.join(h.directory, 'fixture-missing-start.json'));
  assert.throws(() => anchor(h, replaced), /ENOENT/);
  fs.renameSync(path.join(h.directory, 'fixture-missing-start.json'), archive(h, candidate));
  h.store.beginMarker({ from: 'CANDIDATE_REPLACED', to: 'CANDIDATE_FENCED', operation: 'START_CANDIDATE', previousStateDigest: replaced.stateDigest, startedAt: time(0) });
  assert.throws(() => anchor(h, replaced), /OPERATION_INTENT_NOT_OWNED/);
});
test('uncommitted VERIFY marker remains HOLD after VF write and wrong VERIFY destination is rejected', async () => {
  const h = harness(); const { replaced } = await toCandidateAnchor(h);
  const read = h.adapters.verifyCandidate;
  h.adapters.verifyCandidate = async request => {
    const marker = h.store.read(h.store.markerFile); fs.writeFileSync(h.store.markerFile, JSON.stringify({ ...marker, to: 'COMPLETED_OPEN' }));
    assert.throws(() => anchor(h, replaced), /CANDIDATE_PHASE_ANCHOR_PENDING/);
    fs.writeFileSync(h.store.markerFile, JSON.stringify(marker)); return read(request);
  };
  await h.engine.verifyCandidate(); const vf = h.store.readState();
  fs.renameSync(archive(h, vf), h.store.markerFile);
  assert.throws(() => anchor(h, replaced));
});
test('phase anchor rejects duplicate candidate receipts even when receipt hashes and chain are valid', async () => {
  const h = harness(); const { replaced } = await toCandidateAnchor(h); const state = h.store.readState();
  const payload = h.engine.receipt(state, 'CANDIDATE_FENCED');
  const extra = h.store.appendReceipt('CANDIDATE_FENCED', payload, state, time(0));
  const { stateDigest, ...content } = state; h.store.writeState({ ...content, receipts: [...state.receipts, extra] });
  assert.throws(() => anchor(h, replaced), /CANDIDATE_PHASE_ANCHOR_UNIQUE_CHAIN/);
});
test('phase anchor rejects a state changed during observation rather than joining two phases', async () => {
  const h = harness(); const { replaced } = await toCandidateAnchor(h); const state = h.store.readState();
  const open = fs.openSync, intent = archive(h, state); let changedOnce = false;
  // Change the actual state during archive observation, after the initial
  // snapshot. Keep its digest valid so the final read detects the new phase.
  fs.openSync = (file, ...args) => { const fd = open(file, ...args); if (file === intent && !changedOnce) {
    changedOnce = true;
    const { stateDigest, ...changed } = state; changed.updatedAt = time(1);
    fs.writeFileSync(h.store.stateFile, JSON.stringify({ ...changed, stateDigest: canonicalDigest(changed) }));
  } return fd; };
  try { assert.throws(() => h.store.readCandidateLeasePhaseAnchor({ expectedStateDigest: state.stateDigest, replacementStateDigest: replaced.stateDigest }), /CANDIDATE_PHASE_ANCHOR_CHANGED/); assert.equal(changedOnce, true); }
  finally { fs.openSync = open; }
});

test('unchanged state cannot hide an intent generation change during the anchor read', async () => {
  const h = harness(); const { replaced } = await toCandidateAnchor(h); const state = h.store.readState(); const open = fs.openSync, intent = archive(h, state); let changedOnce = false;
  fs.openSync = (file, ...args) => { const fd = open(file, ...args); if (file === intent && !changedOnce) {
    changedOnce = true;
    h.store.beginMarker({ from: 'CANDIDATE_FENCED', to: 'VERIFIED_FENCED', operation: 'VERIFY_CANDIDATE', previousStateDigest: state.stateDigest, startedAt: time(0) });
  } return fd; };
  try { assert.throws(() => h.store.readCandidateLeasePhaseAnchor({ expectedStateDigest: state.stateDigest, replacementStateDigest: replaced.stateDigest }), /CANDIDATE_PHASE_ANCHOR_CHANGED/); assert.equal(changedOnce, true); }
  finally { fs.openSync = open; }
});
for (const mutation of ['missing', 'wrongTo']) test(`verified anchor rejects ${mutation} VERIFY archive`, async () => {
  const h = harness(); const { replaced } = await toCandidateAnchor(h); await h.engine.verifyCandidate();
  const vf = h.store.readState(), file = archive(h, vf);
  if (mutation === 'missing') fs.renameSync(file, path.join(h.directory, 'fixture-missing-verify.json'));
  else { const intent = h.store.read(file); fs.writeFileSync(file, JSON.stringify({ ...intent, to: 'COMPLETED_OPEN' })); }
  assert.throws(() => anchor(h, replaced));
});
test('OPEN pending cannot substitute a rehashed historical VF state without its committed archive', async () => {
  const h = harness(); const { replaced } = await toCandidateAnchor(h); await h.engine.verifyCandidate();
  h.adapters.openCandidate = async () => {
    const marker = h.store.read(h.store.markerFile), { stateDigest, ...prior } = marker.previousState;
    prior.updatedAt = time(-1); const digest = canonicalDigest(prior);
    marker.previousState = { ...prior, stateDigest: digest }; marker.previousStateDigest = digest;
    fs.writeFileSync(h.store.markerFile, JSON.stringify(marker));
    assert.throws(() => anchor(h, replaced));
    throw new Error('FIXTURE_OPEN_REFUSED');
  };
  await assert.rejects(h.engine.complete({ completionEvidence: h.completion }), /FIXTURE_OPEN_REFUSED/);
  assert.ok(fs.existsSync(h.store.markerFile));
});
