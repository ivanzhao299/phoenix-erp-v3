import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { EntityManager } from 'typeorm';
import { MenuGuard, RequireAnyMenu } from '../../../common/guards/menu.guard';
import { hasPerm } from '../../../auth/permissions.util';
import { FileAccessService } from '../../file/file-access.service';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { financeReviewEditors, financeReviewReaders, loadReviewTask, requireReviewScope, reviewSnapshotHash, visibleCutoverSql } from '../../wms/production-finance-review';
import { singaporeBusinessDate } from '../../wms/temp-production-reversal';

@Controller('api/v2/inventory/production-finance-review')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
@RequireAnyMenu(financeReviewReaders)
export class ProductionFinanceReviewController {
  constructor(private readonly db: EntityManager, private readonly cls: ClsService, private readonly files: FileAccessService) {}

  @Get()
  async list(@Query('offset') offset = '0', @Query('view') view = 'pending') {
    if (!/^\d{1,8}$/.test(offset) || !['pending','history'].includes(view)) throw new BadRequestException('核签列表参数无效');
    const scope = requireReviewScope(this.cls.get('dataScope'));
    const rows = await this.db.query(`SELECT id,kind,document_no,state,company_code,warehouse_code,finance_signed FROM (
      SELECT d.id,'reversal' AS kind,d.document_no,d.state,d.company_code,d.payload->>'warehouseCode' AS warehouse_code,d.created_at,
        EXISTS(SELECT 1 FROM production_financial_clearances c WHERE c.document_id=d.id AND c.content_hash=d.content_hash) AS finance_signed
      FROM production_inbound_documents d WHERE d.kind='REVERSAL' AND d.content_hash IS NOT NULL
      UNION ALL SELECT d.id,'cutover',d.document_no,d.state,d.company_code,d.warehouse_code,d.created_at,
        EXISTS(SELECT 1 FROM production_cutover_signatures s WHERE s.manifest_id=d.id AND s.content_hash=d.content_hash AND s.signature_role='FINANCE')
      FROM production_cutover_manifests d WHERE d.content_hash IS NOT NULL AND ${visibleCutoverSql()}
    ) tasks WHERE state IN ('READY','APPROVED','APPLIED','POSTED','CANCELLED')
      AND ($1 OR (company_code=ANY($2::text[]) AND warehouse_code=ANY($3::text[])))
      AND ($4='history' OR (state='READY' AND (kind='reversal' OR NOT finance_signed)))
      ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $5`,
    [scope.isGlobal,scope.allowedCompanyCodes,scope.allowedWarehouseCodes,view,Number(offset)]);
    return { rows:rows.slice(0,50), hasMore:rows.length>50 };
  }

  @Get(':kind/:id')
  async detail(@Param('kind') kind: string,@Param('id') id: string) {
    const task = await loadReviewTask(this.db,kind,id,requireReviewScope(this.cls.get('dataScope')));
    const rev = kind === 'reversal';
    const [original] = rev ? await this.db.query(`SELECT document_no,receipt->>'postingDate' AS posting_day,receipt->>'totalInbound' AS quantity,payload
      FROM production_inbound_documents WHERE id=$1 AND company_code=$2 AND payload->>'warehouseCode'=$3 AND house_code=$4`,
      [task.original_document_id,task.company_code,task.warehouse_code,task.house_code]) : [];
    const periods = rev ? await this.db.query(`SELECT DISTINCT month AS period_month,
      CASE WHEN f.file_id IS NOT NULL AND u.user_id IS NOT NULL THEN p.state ELSE 'UNVERIFIED' END AS state,p.version,f.checksum
      FROM unnest($2::text[]) month LEFT JOIN production_posting_periods p ON p.company_code=$1 AND p.period_month=month
      LEFT JOIN file_metadata f ON f.file_id=p.evidence_file_id AND f.status='ACTIVE' AND f.deleted_at IS NULL
        AND f.checksum=p.evidence_checksum AND f.company_code=p.company_code AND f.owner_id=p.owner_house_code
        AND f.owner_type='HOUSE' AND f.module_code='PRODUCTION_INBOUND' AND f.visibility IN ('PROTECTED','PRIVATE')
      LEFT JOIN sys_user u ON u.user_id::text=p.signed_by AND u.username=f.uploaded_by AND u.status::text IN ('1','ACTIVE')
      ORDER BY month`,[task.company_code,[task.posting_day?.slice(0,7),original?.posting_day?.slice(0,7)]]) : [];
    const lines = rev ? await this.db.query(`SELECT l->>'batchNo' AS reference,l->>'gradeCode' AS grade,l->>'quantity' AS quantity,
      COALESCE(q.cost_status,'UNKNOWN') AS cost_status,b.unit_cost::text AS unit_cost,
      CASE WHEN q.cost_status='CONFIRMED' THEN (b.unit_cost*(l->>'quantity')::numeric)::text END AS amount
      FROM jsonb_array_elements($1::jsonb) l LEFT JOIN inv_batches b ON b.batch_no=l->>'batchNo' AND b.company_code=$2 AND b.warehouse_code=$3
      LEFT JOIN production_batch_qualifications q ON q.batch_no=b.batch_no`,[JSON.stringify(task.payload.items),task.company_code,task.warehouse_code])
      : await this.db.query(`SELECT l->>'skuCode' AS reference,l->>'gradeCode' AS grade,l->>'quantity' AS quantity,l->>'costStatus' AS cost_status,
        l->>'unitCost' AS unit_cost,((l->>'unitCost')::numeric*(l->>'quantity')::numeric)::text AS amount
        FROM jsonb_array_elements($1::jsonb) l`,[JSON.stringify(task.payload.openingLines)]);
    const signatures = rev ? await this.db.query(`SELECT 'FINANCE' AS role,c.signed_by,c.signed_at,c.evidence_file_id,c.evidence_checksum
      FROM production_financial_clearances c WHERE c.document_id=$1 AND c.content_hash=$2 ORDER BY signed_at DESC`,[id,task.content_hash])
      : await this.db.query(`SELECT signature_role AS role,signed_by,signed_at,evidence_file_id,evidence_checksum
        FROM production_cutover_signatures WHERE manifest_id=$1 AND content_hash=$2 ORDER BY signed_at`,[id,task.content_hash]);
    const user = this.cls.get('user');
    const own = await this.db.query(`SELECT f.file_id FROM production_finance_review_files r JOIN file_metadata f USING(file_id)
      WHERE ${rev?'r.reversal_id':'r.manifest_id'}=$1 AND f.uploaded_by=$2 AND f.status='ACTIVE' AND f.deleted_at IS NULL`,[id,user.username]);
    const sourceProofs = (p:any) => (p?.items??[]).flatMap((i:any)=>(i.sources??[]).map((a:any)=>{
      const source=a.snapshot??a.sourceSnapshot;
      return {id:source?.evidenceFileId,checksum:source?.evidenceChecksum};
    })).filter((f:any)=>f.id);
    const checks = [...sourceProofs(original?.payload),...sourceProofs(task.payload),
      ...(task.payload.evidenceChecksums??[]).map((f:any)=>({id:f.file_id,checksum:f.checksum})),
      ...(task.payload.proofs??[]).map((f:any)=>({id:f.file_id,checksum:f.checksum})),
      ...signatures.map((s:any)=>({id:s.evidence_file_id,checksum:s.evidence_checksum}))];
    // Older inbound receipts may have additional attachments without frozen hashes.
    const legacyOriginal = (original?.payload.evidenceFileIds??[]).filter((id:string)=>!checks.some(f=>f.id===id));
    const files = await this.db.query(`SELECT f.file_id,f.original_name FROM file_metadata f
      WHERE f.company_code=$1 AND f.module_code=$2 AND f.owner_type=$3 AND f.owner_id=$4 AND f.deleted_at IS NULL AND f.status='ACTIVE'
      AND f.visibility IN ('PROTECTED','PRIVATE') AND (f.file_id=ANY($5::text[]) OR EXISTS
        (SELECT 1 FROM jsonb_array_elements($6::jsonb) j WHERE f.file_id=j->>'id' AND f.checksum=j->>'checksum')) ORDER BY f.created_at`,
      [task.company_code,rev?'PRODUCTION_INBOUND':'PRODUCTION_CUTOVER',rev?'HOUSE':'WAREHOUSE',rev?task.house_code:task.warehouse_code,
        [...legacyOriginal,...own.map((f:any)=>f.file_id).filter((id:string)=>!checks.some(f=>f.id===id))],JSON.stringify(checks)]);
    return { id,kind,document_no:task.document_no,state:task.state,company_code:task.company_code,warehouse_code:task.warehouse_code,
      house:task.house_code,postingDay:task.posting_day,contentHash:task.content_hash,snapshotHash:task.snapshot_sha256,
      original:original?{number:original.document_no,date:original.posting_day,quantity:original.quantity}:null,
      reviewHash:rev&&original?reviewSnapshotHash(task.content_hash,
        periods.map((p:any)=>({month:p.period_month,version:p.version,checksum:p.checksum})),
        lines.map((l:any)=>({batch:l.reference,decimal:l.unit_cost,quantity:l.quantity,status:l.cost_status}))):null,
      physicalTotals:task.payload.physicalTotals??[],reason:task.payload.reason,periods,lines,files,signatures,
      ownFiles:own.map((f:any)=>f.file_id),canSign:financeReviewEditors.some(p=>hasPerm(user.permissions,p.menu,p.perm)) && task.state==='READY' && task.created_by!==String(user.userId??user.id)
        && (rev ? !!original && task.posting_day===singaporeBusinessDate() && periods.every((p:any)=>p.state==='OPEN')
          : !signatures.some((s:any)=>s.role==='FINANCE'||s.signed_by===String(user.userId??user.id))) };
  }

  @Get(':kind/:id/evidence/:fileId')
  async evidence(@Param('kind') kind:string,@Param('id') id:string,@Param('fileId') fileId:string,@Res({passthrough:true}) response:any) {
    const d = await this.detail(kind,id);
    if (!d.files.some((f:any)=>f.file_id===fileId)) throw new NotFoundException('该附件不属于本次核签');
    const permission=financeReviewReaders.find(p=>hasPerm(this.cls.get('user').permissions,p.menu,p.perm))!;
    const rev=kind==='reversal';
    const f=await this.files.openProtectedFile(fileId,{moduleCode:rev?'PRODUCTION_INBOUND':'PRODUCTION_CUTOVER',ownerType:rev?'HOUSE':'WAREHOUSE',
      ownerId:rev?d.house:d.warehouse_code,companyCode:d.company_code,requiredMenu:permission.menu,requiredOperation:permission.perm},'preview');
    response.setHeader('Content-Type',f.mimeType);response.setHeader('Content-Disposition',f.disposition);return f.stream;
  }
}
