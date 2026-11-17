import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { INV_LEDGER_CHANGE_TYPE } from './inv-ledger-change-types';

export type ReversalQuery = { query(sql: string, parameters?: unknown[]): Promise<any> };

/** One reviewed incident, not a general-purpose write-off or arbitrary batch blacklist. */
export const TEMP_PRODUCTION_REVERSAL_CASE = {
  id: 'MENGSAI-TEST-INBOUND-20261117',
  companyCode: 'COMP-LAO-AGRI',
  farmCode: 'LPH_MENGSAI',
  houseCode: 'HOUSE_MS_01',
  dailyId: 106,
  originalDate: '2026-11-17',
  sourceNo: 'DAILY-2026-11-17-HOUSE_MS_01-4c5f2ca',
  collectionRef: 'HOUSE-HOUSE_MS_01',
  warehouseCode: 'LPH_MS_EGG_FARM',
  locationCode: 'MSCSKW001',
  costEvidence: 'github-run:44123784906/job:134182015290',
  targets: [
    { id: 413, batchNo: 'EGG-20261117-00005', ledgerId: 649, grade: 'GRADE_4', sku: 'SKU-4-LOOSE', product: 'PRD-EGG-4', qty: 30 },
    { id: 415, batchNo: 'EGG-20261117-00007', ledgerId: 651, grade: 'GRADE_5', sku: 'SKU-5-LOOSE', product: 'PRD-EGG-5', qty: 30 },
  ],
} as const;

export type ReversalFact = Record<string, unknown>;
export type ReversalCaseState = 'OPEN' | 'REVERSED';
export const REVERSAL_TYPE = INV_LEDGER_CHANGE_TYPE.TEMP_PRODUCTION_REVERSAL;
export const REVERSAL_BUSINESS_TYPE = 'TEMP_PRODUCTION_CORRECTION';
export const reversalReference = (originalLedgerId: number): string => `TEMP-PROD-REV-${originalLedgerId}`;

export function reversalPlanHash(snapshotSha256: string, releaseSha: string, migrationLedgerSha256: string, executionDate: string): string {
  return createHash('sha256').update(JSON.stringify({
    case: TEMP_PRODUCTION_REVERSAL_CASE, snapshotSha256, releaseSha, migrationLedgerSha256, executionDate,
  })).digest('hex');
}

function hold(reason: string): never {
  throw new ConflictException(`误入库更正证据不完整，停止处理：${reason}`);
}

/** SQL numeric strings are accepted; NULL, empty text, NaN and guessed zero are not. */
export function exactReversalNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function singaporeBusinessDate(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) hold('执行时间无效');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}
function noteObject(value: unknown): ReversalFact {
  if (typeof value !== 'string') hold('补偿流水缺少结构化追溯');
  try {
    const result: unknown = JSON.parse(value);
    if (result && typeof result === 'object' && !Array.isArray(result)) return result as ReversalFact;
  } catch { /* Do not expose operator notes or original payload in errors. */ }
  return hold('补偿流水追溯格式无效');
}

/**
 * Pure evidence classification. Callers cannot manufacture an "already locked"
 * flag or a privileged actor to bypass it. A zero row alone proves nothing.
 * Only this exact two-batch incident can be classified as REVERSED.
 */
export function classifyTempProductionReversal(
  batches: ReversalFact[], ledgers: ReversalFact[],
): ReversalCaseState {
  const c = TEMP_PRODUCTION_REVERSAL_CASE;
  const reversals = ledgers.filter(row => row.change_type === REVERSAL_TYPE);
  const knownRefs = new Set<string>(c.targets.map(target => reversalReference(target.ledgerId)));
  const markers = ledgers.filter(row => row.change_type === REVERSAL_TYPE || knownRefs.has(String(row.ref_no))
    || (typeof row.note === 'string' && row.note.includes(c.id)));
  if (markers.length === 0) return 'OPEN';
  if (batches.length !== 2 || ledgers.length !== 4 || reversals.length !== 2) hold('批次或正负流水数量不符');
  let approvalIdentity: string | undefined;
  for (const target of c.targets) {
    const batch = batches.find(row => row.batch_no === target.batchNo);
    if (!batch || exactReversalNumber(batch.id) !== target.id
      || exactReversalNumber(batch.qty) !== 0 || exactReversalNumber(batch.qty_available) !== 0
      || batch.company_code !== c.companyCode || batch.warehouse_code !== c.warehouseCode
      || batch.location_code !== c.locationCode || batch.source_type !== 'TEMP_PRODUCTION'
      || batch.source_no !== c.sourceNo || batch.collection_batch_ref !== c.collectionRef
      || batch.packaging_batch_ref !== null
      || batch.egg_date !== c.originalDate
      || batch.product_code !== target.product || batch.sku_code !== target.sku
      || batch.grade_code_std !== target.grade || batch.quality_grade !== target.grade
      || batch.unit !== '枚' || batch.spec_code !== 'LOOSE' || batch.packaging_spec !== 'LOOSE'
      || exactReversalNumber(batch.base_quantity_version) !== 1 || batch.store_code !== null
      || batch.material_code !== null || batch.legacy_source !== null || batch.status !== 'AVAILABLE') hold('批次身份或更正后数量不符');
    // The prior immutable observation proves cost columns were absent. The
    // schema's zero placeholder is tolerated only while it remains exactly zero;
    // it is never described as a measured cost. Missing/changed money is HOLD.
    if (exactReversalNumber(batch.unit_cost) !== 0) hold('批次成本缺失或已发生估值变化');
    const rows = ledgers.filter(row => row.batch_no === target.batchNo);
    const original = rows.find(row => exactReversalNumber(row.id) === target.ledgerId);
    const reversal = rows.find(row => row.change_type === REVERSAL_TYPE);
    if (rows.length !== 2 || !original || !reversal
      || original.change_type !== 'TEMP_PRODUCTION_INBOUND' || exactReversalNumber(original.qty_change) !== target.qty
      || original.ref_no !== c.sourceNo || original.company_code !== c.companyCode
      || original.warehouse_code !== c.warehouseCode || original.location_code !== c.locationCode
      || original.sku_code !== target.sku || original.quality_grade !== target.grade
      || original.log_date !== c.originalDate
      || original.store_code !== c.companyCode || original.unit !== null || original.business_type !== null
      || original.cost_change !== null
      || (Object.prototype.hasOwnProperty.call(original, 'unit_cost') && original.unit_cost !== null && exactReversalNumber(original.unit_cost) !== 0)
      || exactReversalNumber(reversal.qty_change) !== -target.qty
      || reversal.ref_no !== reversalReference(target.ledgerId) || reversal.company_code !== c.companyCode
      || reversal.warehouse_code !== c.warehouseCode || reversal.location_code !== c.locationCode
      || reversal.sku_code !== target.sku || reversal.quality_grade !== target.grade
      || reversal.store_code !== null || reversal.unit !== '枚' || reversal.cost_change !== null
      || (Object.prototype.hasOwnProperty.call(reversal, 'unit_cost') && reversal.unit_cost !== null && exactReversalNumber(reversal.unit_cost) !== 0)
      || reversal.business_type !== REVERSAL_BUSINESS_TYPE) hold('原流水与补偿流水未严格配对');
    const note = noteObject(reversal.note);
    if (note.case_id !== c.id || note.version !== 1 || note.original_ledger_id !== target.ledgerId
      || note.original_date !== c.originalDate || note.original_cost_evidence !== c.costEvidence
      || note.cost_status !== 'UNKNOWN_PRE_SCHEMA' || note.original_store_code !== c.companyCode
      || note.corrected_store_code !== null || !text(note.approval_ref)
      || !text(note.execution_run) || !text(note.technical_actor)
      || reversal.operator !== note.technical_actor
      || !text(note.financial_evidence_ref) || !text(note.backup_receipt_ref)
      || typeof note.financial_evidence_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(note.financial_evidence_sha256)
      || typeof note.backup_archive_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(note.backup_archive_sha256)
      || typeof note.plan_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(note.plan_sha256)
      || typeof note.snapshot_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(note.snapshot_sha256)
      || typeof note.release_sha !== 'string' || !/^[a-f0-9]{40}$/.test(note.release_sha)
      || typeof note.migration_ledger_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(note.migration_ledger_sha256)
      || note.plan_sha256 !== reversalPlanHash(note.snapshot_sha256, note.release_sha, note.migration_ledger_sha256, String(note.execution_date))
      || typeof note.execution_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(note.execution_date)
      || reversal.log_date !== note.execution_date) hold('批准、原日期、执行日或未知成本追溯不符');
    const identity = JSON.stringify([note.plan_sha256, note.approval_ref, note.execution_run, note.technical_actor, note.execution_date,
      note.financial_evidence_ref,note.financial_evidence_sha256,note.backup_receipt_ref,note.backup_archive_sha256]);
    if (approvalIdentity !== undefined && approvalIdentity !== identity) hold('两笔更正批准或执行身份不一致');
    approvalIdentity = identity;
  }
  return 'REVERSED';
}

function targetBatchNos(batchNos: readonly unknown[]): string[] {
  const known = new Set<string>(TEMP_PRODUCTION_REVERSAL_CASE.targets.map(target => target.batchNo));
  // WMS's persisted-document paths already trim codes before resolving a row.
  // Match that canonical spelling, so a draft cannot hide a target with spaces.
  return [...new Set(batchNos.filter((value): value is string => typeof value === 'string')
    .map(value=>value.trim()).filter(value=>known.has(value)))].sort();
}

/** No locks here: stock writers must retain their existing pool -> row order. */
export async function readTempProductionReversalState(db: ReversalQuery): Promise<ReversalCaseState> {
  const nos = TEMP_PRODUCTION_REVERSAL_CASE.targets.map(target => target.batchNo);
  // to_jsonb preserves NULL and column absence without referencing future columns.
  const batches = await db.query('SELECT to_jsonb(b) AS fact FROM inv_batches b WHERE batch_no=ANY($1::text[]) ORDER BY batch_no', [nos]);
  const ledgers = await db.query('SELECT to_jsonb(l) AS fact FROM inv_ledger l WHERE BTRIM(batch_no)=ANY($1::text[]) ORDER BY id', [nos]);
  return classifyTempProductionReversal(batches.map((row: { fact: ReversalFact }) => row.fact), ledgers.map((row: { fact: ReversalFact }) => row.fact));
}

/** Caller is inside the real writer transaction and already holds its target row. */
export async function assertTempProductionReferenceAllowed(db: ReversalQuery, batchNos: readonly unknown[]): Promise<void> {
  if (targetBatchNos(batchNos).length === 0) return;
  if (await readTempProductionReversalState(db) === 'REVERSED') {
    throw new ConflictException('该批次为已核验冲销的误入库来源，不能新增业务引用或恢复库存');
  }
}

/**
 * Reference-only paths (labels, drafts) use this inside their own transaction.
 * They must not acquire quantity pools after it; mixed stock paths call the
 * proof assertion only after their existing pool/row locks instead.
 */
export async function lockTempProductionReferences(db: ReversalQuery, batchNos: readonly unknown[]): Promise<void> {
  await lockTempProductionCaseRows(db, batchNos);
  await assertTempProductionReferenceAllowed(db, batchNos);
}

/** Lock the incident atomically before evaluating a whole-source ambiguity. */
export async function lockTempProductionCaseRows(db: ReversalQuery, batchNos: readonly unknown[]): Promise<void> {
  const targets = targetBatchNos(batchNos);
  if (targets.length === 0) return;
  // One atomic incident: lock both in the same order even when a draft names
  // only the second target, avoiding second->first versus first->second waits.
  const ordered = TEMP_PRODUCTION_REVERSAL_CASE.targets.map(target => target.batchNo).sort();
  const rows = await db.query('SELECT batch_no FROM inv_batches WHERE batch_no=ANY($1::text[]) ORDER BY batch_no FOR UPDATE', [ordered]);
  if (rows.length !== ordered.length) hold('待引用的专案批次缺失');
}
