import { ForbiddenException } from '@nestjs/common';

export type ReadonlyApproval = {
  version: 3;
  approvalId: string;
  floorSha: string;
  sourceClassification: 'PRODUCTION_DATA';
  remoteWrite: false;
  erpInbound: false;
  books: Array<{ bookId: string; companyCode: string }>;
  scopes: string[];
  periodPolicy: 'REQUESTED_PERIOD_NO_BACKFILL';
  verification: { bookId: string; period: string; scope: string[]; expiresAt: string };
  verifiedRunId?: string;
  verifiedEvidenceRunId?: string;
};
export type ReadonlyRequest = { bookId?: string; period?: string; scope?: string[] };
const held = () => { throw new ForbiddenException({ reason: 'READONLY_POLICY_HOLD', message: 'Chanjet approved readonly policy HOLD' }); };

/** No approved policy is inferred from a flag, source name, or historical job. */
export function approvedReadonlyPolicy(): ReadonlyApproval {
  const mode = process.env.CHANJET_SYNC_POLICY || 'HOLD';
  if (!['READONLY_VERIFY', 'READONLY_ACTIVE'].includes(mode)
    || process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED !== 'false') return held();
  let policy: ReadonlyApproval;
  try { policy = JSON.parse(process.env.CHANJET_READONLY_APPROVAL || ''); } catch { return held(); }
  const keys = ['version', 'approvalId', 'floorSha', 'sourceClassification', 'remoteWrite', 'erpInbound', 'books', 'scopes', 'periodPolicy', 'verification', 'verifiedRunId', 'verifiedEvidenceRunId'];
  if (Object.keys(policy).some(k => !keys.includes(k))) return held();
  if (policy.version !== 3 || !/^[a-f0-9]{40}$/.test(policy.floorSha || '') || !/^[A-Za-z0-9_-]{1,128}$/.test(policy.approvalId || '')
    || policy.sourceClassification !== 'PRODUCTION_DATA' || policy.remoteWrite !== false || policy.erpInbound !== false
    || policy.periodPolicy !== 'REQUESTED_PERIOD_NO_BACKFILL' || !Array.isArray(policy.books) || !policy.books.length
    || !Array.isArray(policy.scopes) || !policy.scopes.length || policy.scopes.some(s => !/^[A-Z][A-Z0-9_]*$/.test(s))
    || new Set(policy.scopes).size !== policy.scopes.length) return held();
  if (policy.books.some(b => !/^[A-Za-z0-9_-]{1,64}$/.test(b.bookId || '') || !/^[A-Za-z0-9_-]{1,64}$/.test(b.companyCode || ''))
    || new Set(policy.books.map(b => b.bookId)).size !== policy.books.length
    || new Set(policy.books.map(b => b.companyCode)).size !== policy.books.length) return held();
  const v = policy.verification;
  if (!v || !policy.books.some(b => b.bookId === v.bookId) || !/^\d{4}(0[1-9]|1[0-2])$/.test(v.period || '')
    || !Array.isArray(v.scope) || !v.scope.length || v.scope.some(s => !policy.scopes.includes(s))) return held();
  if (mode === 'READONLY_VERIFY' && (!Number.isFinite(Date.parse(v.expiresAt)) || Date.parse(v.expiresAt) <= Date.now())) return held();
  if (mode === 'READONLY_ACTIVE' && (!/^CHANJET-RO-[A-Za-z0-9_-]+$/.test(policy.verifiedRunId || '') || !/^\d+-\d+$/.test(policy.verifiedEvidenceRunId || ''))) return held();
  return policy;
}

export function readonlyScheduleEnabled(): boolean {
  try { approvedReadonlyPolicy(); return process.env.CHANJET_SYNC_POLICY === 'READONLY_ACTIVE'; } catch { return false; }
}

export function requireApprovedReadonlyRequest(request: ReadonlyRequest, companyCode?: string): ReadonlyApproval {
  const p = approvedReadonlyPolicy();
  if (request.bookId && !p.books.some(b => b.bookId === request.bookId && (!companyCode || b.companyCode === companyCode))) return held();
  if (request.period && !/^\d{4}(0[1-9]|1[0-2])$/.test(request.period)) return held();
  if (request.scope?.some(s => !p.scopes.includes(s.toUpperCase()))) return held();
  if (process.env.CHANJET_SYNC_POLICY === 'READONLY_VERIFY') {
    const v = p.verification;
    if (request.bookId !== v.bookId || request.period !== v.period || !request.scope?.length
      || JSON.stringify([...request.scope].map(s => s.toUpperCase()).sort()) !== JSON.stringify([...v.scope].sort())) return held();
  }
  return p;
}

/** Provider payloads and credentials must never enter scheduler/audit messages. */
export function readonlyFailureCode(error: unknown): string {
  const text = String(error instanceof Error ? error.message : error);
  if (/^READONLY_HOLD_(RATE_LIMIT|REMOTE_AUTH|TIMEOUT|MAPPING|UNSUPPORTED|EXECUTION)$/.test(text)) return text;
  // the fail-closed execution outcomes pass through VERBATIM: the UNKNOWN
  // commit outcome and the discarded BEGIN/COMMIT failures must stay
  // distinguishable from a plain clean-rollback refusal
  if (/^CHANJET_EXECUTION_(TERMINAL_UNKNOWN|TX_BEGIN_FAILED|TX_COMMIT_FAILED)$/.test(text)) return text;
  if (/unsupported|not supported|不存在该接口/i.test(text)) return 'READONLY_HOLD_UNSUPPORTED';
  if (/budget|quota|429|限流|额度/i.test(text)) return 'READONLY_HOLD_RATE_LIMIT';
  if (/permission|401|403|50111|权限|token|REMOTE_AUTH/i.test(text)) return 'READONLY_HOLD_REMOTE_AUTH';
  if (/timeout|timed out|abort/i.test(text)) return 'READONLY_HOLD_TIMEOUT';
  if (/映射|mapping/i.test(text)) return 'READONLY_HOLD_MAPPING';
  return 'READONLY_HOLD_EXECUTION';
}
