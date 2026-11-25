import { createHash } from 'node:crypto';
import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { EntityManager } from 'typeorm';
import { MenuGuard, RequireAnyMenu } from '../../../common/guards/menu.guard';
import { hasPerm } from '../../../auth/permissions.util';
import { FileAccessService } from '../../file/file-access.service';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { currentReversalClearanceSql, financeReviewEditors, financeReviewReaders, loadReviewTask, requireReviewScope, reviewSnapshotHash, visibleCutoverSql } from '../../wms/production-finance-review';
import { singaporeBusinessDate } from '../../wms/temp-production-reversal';

@Controller('api/v2/inventory/production-finance-review')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
@RequireAnyMenu(financeReviewReaders)
export class ProductionFinanceReviewController {
  constructor(private readonly db: EntityManager, private readonly cls: ClsService, private readonly files: FileAccessService) {}

  @Get()
  async list(@Query('offset') offset = '0', @Query('view') view = 'pending',
    @Query('kind') kind?:string,@Query('documentNo') documentNo?:string,@Query('companyCode') company?:string,
    @Query('warehouseCode') warehouse?:string,@Query('postingDay') postingDay?:string) {
    if (!/^\d{1,8}$/.test(offset) || !['pending','history'].includes(view)) throw new BadRequestException('核签列表参数无效');
    if (kind && !['reversal','cutover'].includes(kind) || [documentNo,company,warehouse].some(value=>value!==undefined&&
      (typeof value!=='string'||value.length>128)) || postingDay&&!/^\d{4}-\d{2}-\d{2}$/.test(postingDay)) {
      throw new BadRequestException('核签筛选参数无效');
    }
    const scope = requireReviewScope(this.cls.get('dataScope'));
    const rows = await this.db.query(`SELECT id,kind,document_no,state,company_code,warehouse_code,posting_day,finance_signed,
      CASE WHEN state='APPROVED' AND kind='reversal' AND NOT current_signature THEN 'ADMIN_REQUIRED'
        WHEN state IN ('POSTED','APPLIED','CANCELLED') THEN 'HISTORY'
        WHEN current_signature THEN 'SIGNED'
        WHEN finance_signed THEN 'REVIEW_REQUIRED' ELSE 'PENDING' END AS review_state FROM (
      SELECT d.id,'reversal' AS kind,d.document_no,d.state,d.company_code,d.payload->>'warehouseCode' AS warehouse_code,d.created_at,d.expected_posting_date::text AS posting_day,
        EXISTS(SELECT 1 FROM production_financial_clearances c WHERE c.document_id=d.id AND c.content_hash=d.content_hash) AS finance_signed,
        EXISTS(SELECT 1 FROM production_financial_clearances c WHERE ${currentReversalClearanceSql()}
          AND (d.state<>'APPROVED' OR c.id::text=d.approval_evidence->>'clearanceId')) AS current_signature
      FROM production_inbound_documents d WHERE d.kind='REVERSAL' AND d.content_hash IS NOT NULL
      UNION ALL SELECT d.id,'cutover',d.document_no,d.state,d.company_code,d.warehouse_code,d.created_at,d.payload->>'postingDate',
        EXISTS(SELECT 1 FROM production_cutover_signatures s WHERE s.manifest_id=d.id AND s.content_hash=d.content_hash AND s.signature_role='FINANCE'),
        EXISTS(SELECT 1 FROM production_cutover_signatures s WHERE s.manifest_id=d.id AND s.content_hash=d.content_hash AND s.signature_role='FINANCE')
      FROM production_cutover_manifests d WHERE d.content_hash IS NOT NULL AND ${visibleCutoverSql()}
    ) tasks WHERE state IN ('READY','APPROVED','APPLIED','POSTED','CANCELLED')
      AND ($1 OR (company_code=ANY($2::text[]) AND warehouse_code=ANY($3::text[])))
      AND ($4='history' OR (state='READY' AND NOT current_signature) OR (state='APPROVED' AND kind='reversal' AND NOT current_signature))
      AND ($6::text IS NULL OR kind=$6) AND ($7::text IS NULL OR document_no=$7)
      AND ($8::text IS NULL OR company_code=$8) AND ($9::text IS NULL OR warehouse_code=$9)
      AND ($10::text IS NULL OR posting_day=$10)
      ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $5`,
    [scope.isGlobal,scope.allowedCompanyCodes,scope.allowedWarehouseCodes,view,Number(offset),
      kind||null,documentNo?.trim()||null,company||null,warehouse||null,postingDay||null]);
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
    let lines = rev ? await this.db.query(`SELECT l->>'batchNo' AS reference,l->>'gradeCode' AS grade,l->>'quantity' AS quantity,
      COALESCE(q.cost_status,'UNKNOWN') AS cost_status,b.unit_cost::text AS unit_cost,
      CASE WHEN q.cost_status='CONFIRMED' THEN (b.unit_cost*(l->>'quantity')::numeric)::text END AS amount
      FROM jsonb_array_elements($1::jsonb) l LEFT JOIN inv_batches b ON b.batch_no=l->>'batchNo' AND b.company_code=$2 AND b.warehouse_code=$3
      LEFT JOIN production_batch_qualifications q ON q.batch_no=b.batch_no`,[JSON.stringify(task.payload.items),task.company_code,task.warehouse_code])
      : await this.db.query(`SELECT l->>'skuCode' AS reference,l->>'gradeCode' AS grade,l->>'quantity' AS quantity,l->>'costStatus' AS cost_status,
        l->>'unitCost' AS unit_cost,((l->>'unitCost')::numeric*(l->>'quantity')::numeric)::text AS amount
        FROM jsonb_array_elements($1::jsonb) l`,[JSON.stringify(task.payload.openingLines)]);
    const signatures = rev ? await this.db.query(`SELECT c.id,'FINANCE' AS role,c.signed_by,c.signed_at,c.evidence_file_id,c.evidence_checksum,
        c.costs,c.period_versions,(${currentReversalClearanceSql()}) IS TRUE AS current,
        (c.id::text=d.approval_evidence->>'clearanceId') IS TRUE AS adopted
      FROM production_financial_clearances c JOIN production_inbound_documents d ON d.id=c.document_id
      WHERE c.document_id=$1 AND c.content_hash=$2 ORDER BY c.signed_at DESC`,[id,task.content_hash])
      : await this.db.query(`SELECT signature_role AS role,signed_by,signed_at,evidence_file_id,evidence_checksum
        FROM production_cutover_signatures WHERE manifest_id=$1 AND content_hash=$2 ORDER BY signed_at`,[id,task.content_hash]);
    const adopted=rev?signatures.find((signature:any)=>signature.adopted):undefined;
    const current=rev?signatures.some((signature:any)=>signature.current):signatures.some((signature:any)=>signature.role==='FINANCE');
    const reviewState=task.state==='APPROVED'&&rev&&!adopted?.current?'ADMIN_REQUIRED'
      :['POSTED','APPLIED','CANCELLED'].includes(task.state)?'HISTORY'
      :current?'SIGNED':rev&&signatures.length?'REVIEW_REQUIRED':'PENDING';
    if (rev&&task.state==='POSTED') {
      const posted=await this.db.query(`SELECT l.batch_no,ledger.cost_change::text AS amount
        FROM production_inbound_lines l LEFT JOIN inv_ledger ledger ON ledger.id=l.inventory_ledger_id
        WHERE l.document_id=$1`,[id]);
      lines=lines.map((line:any)=>{
        const signed=adopted?.costs.find((cost:any)=>cost.batchNo===line.reference);
        return {...line,unit_cost:signed?.recordedUnitCostDecimal??null,cost_status:signed?.costStatus??'UNKNOWN',
          amount:posted.find((row:any)=>row.batch_no===line.reference)?.amount??null};
      });
    }
    if (!rev&&task.state==='APPLIED') {
      const posted=await this.db.query(`SELECT b.ordinality::int AS line_no,l.cost_change::text AS amount
        FROM production_opening_receipts r CROSS JOIN LATERAL jsonb_array_elements(r.receipt->'batches') WITH ORDINALITY b(entry,ordinality)
        JOIN inv_ledger l ON l.id::text=b.entry->>'inventoryLedgerId'
          AND l.company_code=r.company_code AND l.warehouse_code=r.warehouse_code
        WHERE r.cutover_manifest_id=$1 AND r.company_code=$2 AND r.warehouse_code=$3`,[id,task.company_code,task.warehouse_code]);
      lines=lines.map((line:any,index:number)=>({...line,amount:posted.find((row:any)=>row.line_no===index+1)?.amount??null}));
    }
    const user = this.cls.get('user');
    const own = await this.db.query(`SELECT f.file_id FROM production_finance_review_files r JOIN file_metadata f USING(file_id)
      WHERE ${rev?'r.reversal_id':'r.manifest_id'}=$1 AND f.uploaded_by=$2 AND f.status='ACTIVE' AND f.deleted_at IS NULL ORDER BY f.created_at,f.file_id`,[id,user.username]);
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
      house:task.house_code,postingDay:task.posting_day,contentHash:task.content_hash,snapshotHash:task.snapshot_sha256,review_state:reviewState,
      original:original?{number:original.document_no,date:original.posting_day,quantity:original.quantity}:null,
      reviewHash:rev&&original?reviewSnapshotHash(task.content_hash,
        periods.map((p:any)=>({month:p.period_month,version:p.version,checksum:p.checksum})),
        lines.map((l:any)=>({batch:l.reference,decimal:l.unit_cost,quantity:l.quantity,status:l.cost_status}))):null,
      physicalTotals:task.payload.physicalTotals??[],reason:task.payload.reason,periods,lines,files,signatures,
      ownFiles:own.map((f:any)=>f.file_id),canSign:financeReviewEditors.some(p=>hasPerm(user.permissions,p.menu,p.perm)) && task.state==='READY' && task.created_by!==String(user.userId??user.id)
        && (rev ? !!original && task.posting_day===singaporeBusinessDate() && periods.every((p:any)=>p.state==='OPEN')
          : !signatures.some((s:any)=>s.role==='FINANCE'||s.signed_by===String(user.userId??user.id))) };
  }

  @Get('cutover/:id/receipt')
  async cutoverReceipt(@Param('id') id:string,@Query('contentHash') contentHash:string,
    @Query('snapshotHash') snapshotHash:string,@Query('fileId') fileId:string,@Query('reasonHash') reasonHash:string) {
    if (![contentHash,snapshotHash,reasonHash].every(hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash))
      || typeof fileId!=='string'||!fileId||fileId.length>128) throw new BadRequestException('核签回执参数无效');
    await loadReviewTask(this.db,'cutover',id,requireReviewScope(this.cls.get('dataScope')));
    const user=this.cls.get('user');
    const actor=String(user?.userId??user?.id??'');
    if (!actor||user?.impersonatedBy) throw new NotFoundException('暂未查到本人核签回执');
    const [receipt]=await this.db.query(`SELECT s.id,s.signed_at,s.reason,d.state FROM production_cutover_signatures s
      JOIN production_cutover_manifests d ON d.id=s.manifest_id
      WHERE s.manifest_id=$1 AND s.content_hash=$2 AND s.snapshot_sha256=$3 AND s.evidence_file_id=$4
        AND s.signed_by=$5 AND s.signature_role='FINANCE'`,[id,contentHash,snapshotHash,fileId,actor]);
    if (!receipt||createHash('sha256').update(receipt.reason).digest('hex')!==reasonHash) {
      throw new NotFoundException('暂未查到本人核签回执');
    }
    return {id:receipt.id,signedAt:receipt.signed_at,state:receipt.state};
  }

  @Get('reversal/:id/receipt')
  async receipt(@Param('id') id: string,@Query('reviewHash') reviewHash: string,@Query('fileId') fileId: string) {
    if (!/^[a-f0-9]{64}$/.test(reviewHash??'') || typeof fileId!=='string' || !fileId || fileId.length>128) {
      throw new BadRequestException('核签回执参数无效');
    }
    const task=await loadReviewTask(this.db,'reversal',id,requireReviewScope(this.cls.get('dataScope')));
    const user=this.cls.get('user');
    const actor=String(user?.userId??user?.id??'');
    if (!actor||user?.impersonatedBy) throw new NotFoundException('暂未查到本人核签回执');
    const rows=await this.db.query(`SELECT id,signed_at,costs,period_versions FROM production_financial_clearances
      WHERE document_id=$1 AND content_hash=$2 AND signed_by=$3 AND evidence_file_id=$4`,
      [id,task.content_hash,actor,fileId]);
    const quantity=new Map<string,string>(task.payload.items.map((item: {batchNo:string;quantity:number})=>[item.batchNo,String(item.quantity)]));
    const found=rows.find((row: any)=>row.costs.every((cost: any)=>cost.recordedUnitCostDecimal!==undefined) &&
      reviewSnapshotHash(task.content_hash,
        row.period_versions.map((period: any)=>({month:period.periodMonth,version:period.version,checksum:period.evidenceChecksum})),
        row.costs.map((cost: any)=>({batch:cost.batchNo,decimal:cost.recordedUnitCostDecimal,
          quantity:quantity.get(cost.batchNo)??'',status:cost.costStatus})))===reviewHash);
    if (!found) throw new NotFoundException('暂未查到本人核签回执');
    return {id:found.id,signedAt:found.signed_at,state:task.state};
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
