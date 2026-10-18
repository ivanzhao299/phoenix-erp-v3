import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLegacyTransition, requireLegacyEligibility, LEGACY_TRANSITION_SCHEMA, LEGACY_EVIDENCE_DOMAINS } from './background-control-legacy-transition.mjs';
const old = 'a'.repeat(40); const target = 'b'.repeat(40); const hash = 'c'.repeat(64);
const binding = { owner: '123-1', previousFloorSha: old, targetSha: target };
const now = Date.parse('2026-10-18T01:00:00.000Z');
const receipt = extra => ({ result: 'VERIFIED', evidenceSha256: hash, checkedAt: '2026-10-18T00:30:00.000Z', ...extra });
function fixture() {
  const containerId = '1'.repeat(64); const startedAt = '2026-10-17T01:00:00.000Z';
  return { schema: LEGACY_TRANSITION_SCHEMA, protocol: 'STOP_AND_RECONCILE', binding,
    approval: { decision: 'APPROVED', contentSha256: hash, approvedAt: '2026-10-18T00:00:00.000Z', binding,
      windowStart: '2026-10-18T00:00:00.000Z', windowEnd: '2026-10-18T02:00:00.000Z', allowedDomains: LEGACY_EVIDENCE_DOMAINS },
    executors: [{ containerId, revision: old, startedAt,
      stopEvidence: receipt({ containerId, startedAt, running: false, revives: false }),
      databaseSessionEvidence: receipt({ remainingConnections: 0, openTransactions: 0 }) }],
    ingress: receipt({ state: 'FROZEN' }), revivalPrevention: receipt({ state: 'ENFORCED' }), inventoryCompleteness: receipt({ unaccountedExecutors: 0 }),
    reconciliation: Object.fromEntries(LEGACY_EVIDENCE_DOMAINS.map(domain => [domain, receipt({ domain, disposition: 'RECONCILED', unknownEffects: 0, pendingWrites: 0, approvedScopeSha256: hash })])),
    newRuntime: { containerId: '2'.repeat(64), bootId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', revision: target,
      startupFenceEvidence: receipt({ admissionState: 'DENIED', owner: binding.owner, inFlight: 0 }) } };
}
const verified = { verifyApproval: async () => true, verifyEvidence: async () => true, now: () => now };
test('legacy assessment defaults HOLD without independent authority verifier even if arbitrary booleans claim approval', async () => {
  const result = await assessLegacyTransition(fixture(), { now: () => now });
  assert.equal(result.result, 'HOLD'); assert.ok(result.reasons.includes('INDEPENDENT_MAINTENANCE_APPROVAL_REQUIRED'));
});
test('fully verified STOP_AND_RECONCILE is eligibility only, never modern drain or executed production', async () => {
  const result = await assessLegacyTransition(fixture(), verified);
  assert.equal(result.result, 'RECONCILED_BOOTSTRAP_ELIGIBLE'); assert.equal(result.legacyDrainResult, 'UNSUPPORTED'); assert.equal(result.productionOperationExecuted, false);
  requireLegacyEligibility(result, binding);
});
test('missing old runtime executor, ingress freeze, restart prevention, or DB transaction proof holds', async () => {
  for (const mutate of [x => { x.executors = []; }, x => { x.ingress.state = 'OPEN'; }, x => { x.revivalPrevention.state = 'UNKNOWN'; },
    x => { x.executors[0].stopEvidence.revives = true; }, x => { x.executors[0].databaseSessionEvidence.openTransactions = 1; },
    x => { x.inventoryCompleteness.unaccountedExecutors = 1; }]) {
    const x = fixture(); mutate(x); assert.equal((await assessLegacyTransition(x, verified)).result, 'HOLD');
  }
});
test('notification send-before-ledger UNKNOWN is HOLD even if all DB transactions rolled back', async () => {
  const x = fixture(); x.reconciliation.NOTIFICATION_EXTERNAL_SEND.unknownEffects = 1;
  const r = await assessLegacyTransition(x, verified); assert.equal(r.result, 'HOLD'); assert.ok(r.reasons.includes('NOTIFICATION_EXTERNAL_SEND_UNRECONCILED'));
});
test('IoT partial commits require reconciliation, not automatic replay or repair', async () => {
  for (const field of ['requiresReplay', 'requiresBusinessMutation']) {
    const x = fixture(); x.reconciliation.IOT_PARTIAL_COMMITS[field] = true;
    assert.ok((await assessLegacyTransition(x, verified)).reasons.includes('IOT_PARTIAL_COMMITS_UNRECONCILED'));
  }
});
test('expired or mismatched exact SHA maintenance approval does not authorize transition', async () => {
  const x = fixture(); x.approval = { ...x.approval, binding: { ...binding, targetSha: 'd'.repeat(40) } };
  assert.equal((await assessLegacyTransition(x, verified)).result, 'HOLD');
  assert.equal((await assessLegacyTransition(fixture(), { ...verified, now: () => now + 3 * 3600000 })).result, 'HOLD');
});
test('unknown reconciliation domain or missing safe new boot cannot pass', async () => {
  for (const mutate of [x => { delete x.reconciliation.PERSISTENT_TASKS; }, x => { x.newRuntime.startupFenceEvidence.admissionState = 'OPEN'; },
    x => { x.newRuntime.bootId = 'reused-hostname'; }, x => { x.newRuntime.revision = old; }]) {
    const x = fixture(); mutate(x); assert.equal((await assessLegacyTransition(x, verified)).result, 'HOLD');
  }
});
test('assessment cannot be reused for another run or be promoted from HOLD by helper', async () => {
  const r = await assessLegacyTransition(fixture(), verified);
  assert.throws(() => requireLegacyEligibility(r, { ...binding, owner: '999-1' }), /LEGACY_STOP_AND_RECONCILE/);
  assert.throws(() => requireLegacyEligibility({ ...r, result: 'HOLD', eligible: false }, binding), /LEGACY_STOP_AND_RECONCILE/);
});

test('legacy file hashes and VERIFIED strings without an independent immutable evidence verifier remain HOLD', async () => {
  const result = await assessLegacyTransition(fixture(), { verifyApproval: async () => true, now: () => now });
  assert.ok(result.reasons.includes('IMMUTABLE_EVIDENCE_VERIFICATION_REQUIRED'));
  const x = fixture(); x.ingress.checkedAt = '2026-10-17T00:00:00.000Z';
  assert.ok((await assessLegacyTransition(x, verified)).reasons.includes('IMMUTABLE_EVIDENCE_VERIFICATION_REQUIRED'));
});
