import { createHash } from 'node:crypto';

/** Storage-only contract. No transport, policy activation or registration HTTP route. */
export type ExecutionManifest = {
  version: 1; executionId: string; ownerId: string;
  requestCap: number; totalTimeoutMs: number; httpTimeoutMs: number;
  approval: {
    version: 3; approvalId: string; floorSha: string;
    sourceClassification: 'PRODUCTION_DATA'; remoteWrite: false; erpInbound: false;
    books: Array<{ bookId: string; companyCode: string }>; scopes: string[];
    periodPolicy: 'REQUESTED_PERIOD_NO_BACKFILL';
    verification: { bookId: string; period: string; scope: string[]; expiresAt: string };
  };
};
export type ManifestBinding = { manifest: ExecutionManifest; canonical: string; digest: string };
export function admissionHold(): never { throw new Error('CHANJET_ADMISSION_HOLD'); }

/** Deliberately mirrors the standalone ops validator; parity tests cover both. */
export function validateExecutionManifest(value: unknown): ManifestBinding {
  const object = (v: unknown, keys: string[]): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)
      || Object.keys(v).sort().join('|') !== [...keys].sort().join('|')) return admissionHold();
    return v as Record<string, unknown>;
  };
  function identifier(v: unknown, max = 128): asserts v is string {
    if (typeof v !== 'string' || !new RegExp(`^[A-Za-z0-9_-]{1,${max}}$`).test(v)) admissionHold();
  };
  function positive(v: unknown): asserts v is number {
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0 || v > 2147483647) admissionHold();
  };
  const scopes = (v: unknown): string[] => {
    if (!Array.isArray(v) || !v.length || v.some(s => typeof s !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(s))
      || new Set(v).size !== v.length) return admissionHold();
    return [...v].sort();
  };
  const m = object(value, ['version','executionId','ownerId','requestCap','totalTimeoutMs','httpTimeoutMs','approval']);
  if (m.version !== 1) admissionHold();
  identifier(m.executionId); identifier(m.ownerId);
  positive(m.requestCap); positive(m.totalTimeoutMs); positive(m.httpTimeoutMs);
  const a = object(m.approval, ['version','approvalId','floorSha','sourceClassification','remoteWrite','erpInbound','books','scopes','periodPolicy','verification']);
  identifier(a.approvalId);
  if (a.version !== 3 || typeof a.floorSha !== 'string' || !/^[a-f0-9]{40}$/.test(a.floorSha)
    || a.sourceClassification !== 'PRODUCTION_DATA' || a.remoteWrite !== false || a.erpInbound !== false
    || a.periodPolicy !== 'REQUESTED_PERIOD_NO_BACKFILL' || !Array.isArray(a.books) || !a.books.length) admissionHold();
  const books = a.books.map((b: unknown) => {
    const row = object(b, ['bookId','companyCode']); identifier(row.bookId,64); identifier(row.companyCode,64);
    return { bookId: row.bookId as string, companyCode: row.companyCode as string };
  }).sort((x: { bookId: string }, y: { bookId: string }) => x.bookId < y.bookId ? -1 : x.bookId > y.bookId ? 1 : 0);
  if (new Set(books.map((b: { bookId: string }) => b.bookId)).size !== books.length
    || new Set(books.map((b: { companyCode: string }) => b.companyCode)).size !== books.length) admissionHold();
  const allScopes = scopes(a.scopes);
  const v = object(a.verification, ['bookId','period','scope','expiresAt']); identifier(v.bookId,64);
  const selected = scopes(v.scope);
  if (typeof v.period !== 'string' || !/^\d{4}(0[1-9]|1[0-2])$/.test(v.period)
    || !books.some((b: { bookId: string }) => b.bookId === v.bookId) || selected.some(s => !allScopes.includes(s))
    || typeof v.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.expiresAt)
    || !Number.isFinite(Date.parse(v.expiresAt)) || new Date(v.expiresAt).toISOString() !== v.expiresAt) admissionHold();
  const manifest: ExecutionManifest = {
    version:1, executionId:m.executionId, ownerId:m.ownerId,
    requestCap:m.requestCap, totalTimeoutMs:m.totalTimeoutMs, httpTimeoutMs:m.httpTimeoutMs,
    approval:{ version:3, approvalId:a.approvalId, floorSha:a.floorSha, sourceClassification:'PRODUCTION_DATA',
      remoteWrite:false, erpInbound:false, books, scopes:allScopes, periodPolicy:'REQUESTED_PERIOD_NO_BACKFILL',
      verification:{ bookId:v.bookId, period:v.period, scope:selected, expiresAt:v.expiresAt } },
  };
  const canonical = JSON.stringify(manifest);
  return { manifest, canonical, digest:createHash('sha256').update(canonical).digest('hex') };
}
