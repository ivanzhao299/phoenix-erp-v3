import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { productionContentHash } from '../sales-v2/services/production-source-facts';
import { EntityManager } from 'typeorm';
import { DataScopeContext } from '../org/services/data-scope.service';
import { hasPerm } from '../../auth/permissions.util';

export const FINANCE_REVIEW = 'MENU_PROD_FIN_REVIEW';
export const FINANCE_PROOF_PREFIX = 'FILE-FINREVIEW-';
export const LEGACY_FINANCE = 'MENU_FIN2_AR_LEDGER';
export const financeReviewEditors = [
  { menu: LEGACY_FINANCE, perm: 'E' as const }, { menu: FINANCE_REVIEW, perm: 'E' as const },
];
export const financeReviewReaders = [...financeReviewEditors, { menu: FINANCE_REVIEW, perm: 'V' as const }];
export type ReviewKind = 'reversal' | 'cutover';

export function financeSigningMenu(permissions: string[]): string {
  return hasPerm(permissions, LEGACY_FINANCE, 'E') ? LEGACY_FINANCE : FINANCE_REVIEW;
}

// d denotes the frozen reversal and c a candidate clearance. Screening is read-only;
// approval and posting validate the same facts again under their transaction locks.
export function currentReversalClearanceSql() {
  return `c.document_id=d.id AND c.content_hash=d.content_hash
    AND c.company_code=d.company_code AND c.house_code=d.house_code
    AND c.original_content_hash=d.payload->>'originalContentHash'
    AND c.posting_date=d.expected_posting_date AND c.period_status='OPEN'
    AND c.signed_by<>d.created_by
    AND EXISTS(SELECT 1 FROM file_metadata f JOIN sys_user u ON u.username=f.uploaded_by
      WHERE f.file_id=c.evidence_file_id AND f.checksum=c.evidence_checksum
        AND f.status='ACTIVE' AND f.deleted_at IS NULL AND f.module_code='PRODUCTION_INBOUND'
        AND f.owner_type='HOUSE' AND f.owner_id=d.house_code AND f.company_code=d.company_code
        AND f.visibility IN ('PROTECTED','PRIVATE') AND u.user_id::text=c.signed_by AND u.status::text IN ('1','ACTIVE'))
    AND c.period_versions=(
      SELECT jsonb_agg(jsonb_build_object('periodMonth',p.period_month,'version',p.version,
        'evidenceChecksum',p.evidence_checksum) ORDER BY p.period_month)
      FROM production_posting_periods p JOIN production_inbound_documents origin ON origin.id=d.original_document_id
      JOIN file_metadata f ON f.file_id=p.evidence_file_id AND f.checksum=p.evidence_checksum
        AND f.status='ACTIVE' AND f.deleted_at IS NULL AND f.company_code=p.company_code
        AND f.module_code='PRODUCTION_INBOUND' AND f.owner_type='HOUSE' AND f.owner_id=p.owner_house_code
        AND f.visibility IN ('PROTECTED','PRIVATE')
      JOIN sys_user u ON u.user_id::text=p.signed_by AND u.username=f.uploaded_by AND u.status::text IN ('1','ACTIVE')
      WHERE p.company_code=d.company_code AND p.state='OPEN' AND p.period_month IN (
        to_char(d.expected_posting_date,'YYYY-MM'),left(origin.receipt->>'postingDate',7)))
    AND jsonb_array_length(c.costs)=jsonb_array_length(d.payload->'items')
    AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(d.payload->'items') AS line
      LEFT JOIN inv_batches b ON b.batch_no=line->>'batchNo' AND b.company_code=d.company_code AND b.warehouse_code=d.payload->>'warehouseCode'
      LEFT JOIN production_batch_qualifications q ON q.batch_no=b.batch_no
      WHERE b.batch_no IS NULL OR NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(c.costs) AS cost
        WHERE cost->>'batchNo'=b.batch_no AND cost->>'costStatus' IN ('UNKNOWN','CONFIRMED')
          AND (cost->>'costStatus'<>'CONFIRMED' OR b.unit_cost IS NOT NULL)
          AND CASE WHEN cost ? 'recordedUnitCostDecimal'
            THEN cost->>'recordedUnitCostDecimal' IS NOT DISTINCT FROM b.unit_cost::text
            ELSE (cost->>'recordedUnitCost')::double precision IS NOT DISTINCT FROM b.unit_cost::double precision END
          AND CASE WHEN cost ? 'qualificationStatus' THEN cost->>'qualificationStatus'=COALESCE(q.cost_status,'UNKNOWN')
            WHEN left(c.evidence_file_id,${FINANCE_PROOF_PREFIX.length})='${FINANCE_PROOF_PREFIX}' THEN cost->>'costStatus'=COALESCE(q.cost_status,'UNKNOWN')
            ELSE true END))`;
}

export function requireReviewScope(scope?: DataScopeContext): DataScopeContext {
  if (!scope || typeof scope.isGlobal !== 'boolean') throw new ForbiddenException('缺少财务核签数据范围');
  return scope;
}

// Both the paginated queue and the signing service evaluate the same frozen evidence groups.
const ownerPaths = ['owners','masters,profiles'];
const factPaths = ['batches','sourceEvents','inventoryDomains','cutovers','domains','processing,rawReceipts','processing,documents'];
const rowsAt = (snapshot:any,path:string):any[] => path.split(',').reduce((node,key)=>node?.[key],snapshot) ?? [];

export function assertCutoverEvidenceScope(snapshot:any,scope?:DataScopeContext) {
  requireReviewScope(scope);
  if(!snapshot?.boundary || ownerPaths.some(path=>rowsAt(snapshot,path).some(row=>row.company_code!==snapshot.boundary.companyCode)))
    throw new ForbiddenException('盘点鸡舍公司权威归属不一致');
  if(!scope!.isGlobal && factPaths.some(path=>rowsAt(snapshot,path).some(row=>!scope!.allowedCompanyCodes.includes(row.company_code)
    || !scope!.allowedWarehouseCodes.includes(row.source_warehouse_code??row.warehouse_code))))
    throw new ConflictException('相关来源涉及尚未授权的公司或仓库，须先取得独立核验权限');
}

// The query uses bind parameters $1=global, $2=companies and $3=warehouses.
export function visibleCutoverSql() {
  const rows=(paths:string[])=>paths.map(path=>`SELECT f FROM jsonb_array_elements(d.snapshot #> '{${path}}') f`).join(' UNION ALL ');
  return `d.snapshot->'boundary' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM (${rows(ownerPaths)}) owners
    WHERE f->>'company_code' IS DISTINCT FROM d.snapshot #>> '{boundary,companyCode}')
    AND ($1 OR NOT EXISTS(SELECT 1 FROM (${rows(factPaths)}) facts WHERE
    ((f->>'company_code')=ANY($2::text[]) AND COALESCE(f->>'source_warehouse_code',f->>'warehouse_code')=ANY($3::text[])) IS NOT TRUE))`;
}

export async function loadReviewTask(m: EntityManager, kind: string, id: string, scope: DataScopeContext) {
  requireReviewScope(scope);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) throw new BadRequestException('单据编号无效');
  let sql: string;
  if (kind === 'reversal') {
    sql = `SELECT d.*, d.payload->>'warehouseCode' AS warehouse_code,
      d.expected_posting_date::text AS posting_day FROM production_inbound_documents d
      WHERE d.kind='REVERSAL' AND d.state IN ('READY','APPROVED','POSTED','CANCELLED') AND d.content_hash IS NOT NULL AND d.id=$1`;
  } else if (kind === 'cutover') {
    sql = `SELECT *, payload->>'postingDate' AS posting_day FROM production_cutover_manifests
      WHERE state IN ('READY','APPROVED','APPLIED','CANCELLED') AND content_hash IS NOT NULL AND id=$1`;
  } else throw new BadRequestException('核签单据类型无效');
  const [task] = await m.query(sql, [id]);
  if (!task) throw new NotFoundException('核签任务不存在');
  if (!scope.isGlobal && (!scope.allowedCompanyCodes.includes(task.company_code)
    || !scope.allowedWarehouseCodes.includes(task.warehouse_code))) throw new ForbiddenException('该任务超出财务公司或仓库范围');
  if(kind==='cutover')assertCutoverEvidenceScope(task.snapshot,scope);
  return task;
}

export async function requireReviewFile(m: EntityManager, kind: ReviewKind, id: string, fileId: string) {
  const column = kind === 'reversal' ? 'reversal_id' : 'manifest_id';
  // The DELETE trigger takes the same key. No UPDATE privilege is required to verify a binding.
  await m.query("SELECT pg_advisory_xact_lock(hashtextextended('production-finance-proof:' || $1,0))",[fileId]);
  const [binding] = await m.query(`SELECT 1 FROM production_finance_review_files WHERE ${column}=$1 AND file_id=$2`, [id,fileId]);
  if (!binding) throw new ConflictException('请使用为本单上传的财务核验依据');
}

export function reviewSnapshotHash(contentHash:string,periods:Array<{month:string;version:number|null;checksum:string|null}>,
  costs:Array<{batch:string;decimal:string|null;quantity:string;status:string}>) {
  return productionContentHash({contentHash,periods:[...periods].sort((a,b)=>a.month.localeCompare(b.month)),
    costs:[...costs].sort((a,b)=>a.batch.localeCompare(b.batch))});
}
