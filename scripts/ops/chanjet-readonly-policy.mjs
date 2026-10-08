const hold = reason => { throw new Error(`CONFIG_HOLD=${reason}`); };
export const POLICIES = ['HOLD', 'READONLY_VERIFY', 'READONLY_ACTIVE'];
export function validateReadonlyPolicy(mode = 'HOLD', approval, floorSha, now = Date.now()) {
  if (!POLICIES.includes(mode)) hold('CHANJET_POLICY');
  if (mode === 'HOLD') { if (approval != null) hold('HOLD_HAS_ACTIVE_APPROVAL'); return; }
  const p = approval;
  const keys = ['version', 'approvalId', 'floorSha', 'sourceClassification', 'remoteWrite', 'erpInbound', 'books', 'scopes', 'periodPolicy', 'verification', 'verifiedRunId', 'verifiedEvidenceRunId'];
  if (p && Object.keys(p).some(k => !keys.includes(k))) hold('UNAPPROVED_POLICY_FIELDS');
  if (!p || p.version !== 3 || p.floorSha !== floorSha || !/^[a-f0-9]{40}$/.test(p.floorSha || '')
    || !/^[A-Za-z0-9_-]{1,128}$/.test(p.approvalId || '') || p.sourceClassification !== 'PRODUCTION_DATA'
    || p.remoteWrite !== false || p.erpInbound !== false || p.periodPolicy !== 'REQUESTED_PERIOD_NO_BACKFILL'
    || !Array.isArray(p.books) || !p.books.length || !Array.isArray(p.scopes) || !p.scopes.length
    || p.scopes.some(s => !/^[A-Z][A-Z0-9_]*$/.test(s)) || new Set(p.scopes).size !== p.scopes.length) hold('CHANJET_APPROVAL');
  if (p.books.some(b => !/^[A-Za-z0-9_-]{1,64}$/.test(b.bookId || '') || !/^[A-Za-z0-9_-]{1,64}$/.test(b.companyCode || ''))
    || new Set(p.books.map(b => b.bookId)).size !== p.books.length || new Set(p.books.map(b => b.companyCode)).size !== p.books.length) hold('BOOK_COMPANY_APPROVAL');
  const v = p.verification;
  if (!v || !p.books.some(b => b.bookId === v.bookId) || !/^\d{4}(0[1-9]|1[0-2])$/.test(v.period || '')
    || !Array.isArray(v.scope) || !v.scope.length || v.scope.some(s => !p.scopes.includes(s))) hold('FIRST_SYNC_SCOPE');
  if (mode === 'READONLY_VERIFY' && (!Number.isFinite(Date.parse(v.expiresAt)) || Date.parse(v.expiresAt) <= now || Date.parse(v.expiresAt) > now + 30 * 60 * 1000)) hold('VERIFY_DEADLINE');
  if (mode === 'READONLY_ACTIVE' && (!/^CHANJET-RO-[A-Za-z0-9_-]+$/.test(p.verifiedRunId || '') || !/^\d+-\d+$/.test(p.verifiedEvidenceRunId || ''))) hold('FIRST_SYNC_PROOF');
}
export function readonlyEnvironment(floor, now = Date.now()) {
  const mode = floor.chanjetPolicy || 'HOLD';
  validateReadonlyPolicy(mode, floor.readonlyApproval, floor.floorSha, now);
  const expected = mode === 'HOLD' ? 'false' : 'true';
  if (floor.operationalTuple?.CHANJET_READONLY_SYNC_ENABLED !== expected || floor.operationalTuple?.CHANJET_ERP_INBOUND_SYNC_ENABLED !== 'false') hold('CHANJET_POLICY_FLAGS');
  return { CHANJET_SYNC_POLICY: mode, CHANJET_READONLY_APPROVAL: floor.readonlyApproval ? JSON.stringify(floor.readonlyApproval) : '' };
}
export function validatePolicyTransition(marker, { runId, target, actual, now = Date.now() }) {
  if (!marker || marker.version !== 3 || marker.runId !== runId || marker.target !== target || marker.phase !== 'IN_PROGRESS'
    || !Number.isFinite(Date.parse(marker.startedAt)) || !Number.isFinite(Date.parse(marker.expiresAt))
    || Date.parse(marker.expiresAt) <= now || Date.parse(marker.expiresAt) - Date.parse(marker.startedAt) > 30 * 60 * 1000
    || !['CODE_HOLD', 'READONLY_VERIFY', 'READONLY_ACTIVE', 'HOLD'].includes(marker.operation)) hold('POLICY_TRANSITION');
  if (JSON.stringify(actual.web) !== JSON.stringify(marker.previous.web)) hold('TRANSITION_WEB_DRIFT');
  const allowed = [marker.previous.api, marker.candidateApi].filter(Boolean);
  if (!allowed.some(pin => JSON.stringify(pin) === JSON.stringify(actual.api))) hold('TRANSITION_API_DRIFT');
}

// Only a fresh exact-SHA HOLD transaction may inspect an expired VERIFY tuple.
// No Compose/deployment caller receives this exception; after floor=HOLD the
// normal guard validates the API-only transition and shutdown.
export function expiredVerifyHoldEnvironment(floor, context, now = Date.now()) {
  const expiry = Date.parse(floor.readonlyApproval?.verification?.expiresAt);
  if (context?.operation !== 'HOLD' || !/^\d+-\d+$/.test(context.runId || '')
    || context.target !== floor.floorSha || floor.chanjetPolicy !== 'READONLY_VERIFY'
    || !Number.isFinite(expiry) || expiry > now) hold('EXPIRED_VERIFY_HOLD_SCOPE');
  // Validate every approved field and tuple; ignore only elapsed old deadline.
  return readonlyEnvironment(floor, expiry - 1);
}
