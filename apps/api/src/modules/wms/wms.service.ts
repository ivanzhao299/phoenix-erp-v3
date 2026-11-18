import { beginApprovedConversionOutput,completeApprovedConversionOutput } from './official-conversion-context';
import { bindTransferDamageBatch } from './inventory-derivation-proof';
import { qualifyDerivedInventory } from './derived-inventory-qualification';
import { qualifyPurchaseInventory,purchaseReceiptBatchNo } from './purchase-inventory-qualification';
import { assertOfficialInventoryBatches, officialInventoryPredicate, officialLedgerPredicate } from './official-inventory';
import { inheritFlockProductionSources } from '../farm/flock-production-source';
import { resolveQuantity, savedQuantity, sharedBatches, assertBatchPool, baseQuantity, QuantitySnapshot, lockQuantityPools } from '../product-master/services/quantity-contract';
import { SkuPolicy } from '../product-master/services/sku-policy';
import { Injectable, BadRequestException, ConflictException, ForbiddenException, Logger, Inject, Optional } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../org/services/data-scope.service';
import { INV_LEDGER_CHANGE_TYPE, InvLedgerChangeType } from './inv-ledger-change-types';
import { writeInvLedger } from './inventory-ledger.writer';
import { assertTempProductionReferenceAllowed, lockTempProductionReferences, readTempProductionReversalState, TEMP_PRODUCTION_REVERSAL_CASE } from './temp-production-reversal';
import { inspectTempProductionReversal, TempReversalPlan, TempReversalApprovalVerifier, TEMP_REVERSAL_APPROVAL_VERIFIER,
  assertReversalAuthorityBinding, correctionLedgerParameters, withCorrectionLedgerWrites } from './temp-production-reversal-case';
import { OrgOwnershipService } from '../org/services/org-ownership.service';
import { hasPerm, PermCode } from '../../auth/permissions.util';
import {
  isIssueOutboundType,
  resolveOutboundDestinationCode,
  resolveOutboundLedgerType,
  resolveOutboundPolicy,
  validateOutboundPolicy,
} from './wms-outbound-policy';
import {
  resolveInboundPolicy,
  validateInboundPolicy,
  validateInboundWorkflow,
} from './wms-inbound-policy';
import {
  normalizeDefectDispositionAction,
  normalizeDefectGrade,
  validateDefectDisposition,
} from './wms-defect-disposition-policy';
import { resolveInventoryClass,allowedInventoryClassesForSales } from './inventory-class-policy';
import { randomUUID } from 'crypto';

/**
 * V3 WmsService
 * 替代已废弃的 WmsV2CompatService，所有操作直接操作 V3 数据表
 */
@Injectable()
export class WmsService {
  private static readonly PURCHASE_RECEIPT_WAREHOUSE_TYPES = new Set([
    'FEED', 'MEDICINE', 'PURCHASE_RECV', 'RAW_MATERIAL',
  ]);

  /** INV-105: 看板静默降级时记录错误，DB 故障不再被误读为"无待办" */
  private readonly logger = new Logger(WmsService.name);

  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
    private readonly cls: ClsService,
    @Optional() @Inject(TEMP_REVERSAL_APPROVAL_VERIFIER)
    private readonly tempCorrectionAuthority?: TempReversalApprovalVerifier,
  ) {}

  /** Internal approved opening entry. Never accepts stock values, source flags or actor identity from an HTTP body. */
  async postApprovedOpening(manager:EntityManager,manifestId:string):Promise<Record<string,unknown>> {
    if(!manager.queryRunner?.isTransactionActive)throw new ConflictException('OPENING_TRANSACTION_REQUIRED');
    const user=this.cls.get('user') as any,scope=this.cls.get('dataScope') as DataScopeContext|undefined;
    if(!user||!hasPerm(user.permissions,'MENU_PROD_INBOUND','E'))throw new ForbiddenException('缺少正式期初过账权限');
    const actor=String(user.userId??user.id??'');if(!actor)throw new ForbiddenException('缺少实名过账人');
    const [manifest]=await manager.query('SELECT * FROM production_cutover_manifests WHERE id=$1 FOR UPDATE',[manifestId]);
    if(!manifest)throw new BadRequestException('切换盘点单不存在');
    if(!scope||!scope.isGlobal&&(!scope.allowedCompanyCodes.includes(manifest.company_code)||!scope.allowedWarehouseCodes.includes(manifest.warehouse_code)))
      throw new ForbiddenException('无权操作该公司或仓库的期初');
    if(manifest.state==='APPLIED')return manifest.receipt;
    if(manifest.state!=='APPROVED')throw new ConflictException('期初须先取得同摘要业务及财务签认');
    const signatures=await manager.query(`SELECT s.* FROM production_cutover_signatures s JOIN file_metadata f ON f.file_id=s.evidence_file_id
      JOIN sys_user u ON u.user_id::text=s.signed_by AND u.username=f.uploaded_by
      WHERE s.manifest_id=$1 AND s.content_hash=$2 AND s.snapshot_sha256=$3 AND f.checksum=s.evidence_checksum
        AND COALESCE(to_jsonb(u)->>'status','') IN ('1','ACTIVE') AND f.module_code='PRODUCTION_CUTOVER'
        AND f.owner_type='WAREHOUSE' AND f.owner_id=$4 AND f.company_code=$5
        AND f.status='ACTIVE' AND f.deleted_at IS NULL AND f.visibility IN ('PROTECTED','PRIVATE') FOR SHARE OF s,f`,
      [manifest.id,manifest.content_hash,manifest.snapshot_sha256,manifest.warehouse_code,manifest.company_code]);
    if(new Set(signatures.map((s:any)=>s.signature_role)).size!==2)throw new ConflictException('期初签认或原保护附件已失效');
    await this.lockWarehouseCompany(manager,manifest.warehouse_code,manifest.company_code);
    const [warehouse]=await manager.query(`SELECT status,domain FROM wms_warehouses WHERE warehouse_code=$1 FOR SHARE`,[manifest.warehouse_code]);
    if(warehouse?.status!=='ACTIVE'||warehouse.domain!=='OPERATIONAL')throw new BadRequestException('期初仓库必须为启用的实体作业仓');
    const postingDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date());
    if(manifest.payload.postingDate!==postingDate)throw new ConflictException('期初冻结记账日已变化，请保留原单重新核对签认');
    const claims=await manager.query(`SELECT c.*,d.product_code,d.state FROM production_opening_domain_claims c
      JOIN production_inventory_domain_states d ON d.id=c.domain_id WHERE c.manifest_id=$1 ORDER BY c.domain_id FOR SHARE OF c,d`,[manifestId]);
    if(claims.length!==manifest.boundary.productCodes.length||claims.some((c:any)=>c.state!=='ACTIVE'||c.content_hash!==manifest.content_hash))
      throw new ConflictException('期初实物边界尚未完整认领并受控启用');
    const lines=manifest.payload.openingLines;
    if(!Array.isArray(lines))throw new ConflictException('期初冻结明细缺失');
    const output:Array<Record<string,unknown>>=[];
    for(const [index,line] of lines.entries()){
      const identity=await this.resolveInventoryItem(manager,line.skuCode,'SKU',manifest.company_code);
      const quantity=Number(line.quantity);baseQuantity(quantity,1,identity.unit);
      if(identity.itemType!=='SKU'||identity.unit!=='枚'||!Number.isSafeInteger(quantity)||quantity<=0
        ||identity.productCode!==line.productCode||identity.gradeCode!==line.gradeCode||identity.specCode!==line.specCode)
        throw new ConflictException('期初 SKU、品类、分级、规格或基本数量已变化');
      const claim=claims.find((c:any)=>c.product_code===identity.productCode);if(!claim)throw new ConflictException('期初明细超出已认领实物域');
      const [location]=await manager.query("SELECT 1 FROM wms_locations WHERE location_code=$1 AND warehouse_code=$2 AND status='ACTIVE' FOR SHARE",[line.locationCode,manifest.warehouse_code]);
      const [status]=await manager.query("SELECT 1 FROM sys_dict WHERE dict_type='INV_STOCK_STATUS' AND dict_code=$1 AND status='ACTIVE'",[line.stockStatus]);
      if(!location||!status||line.stockStatus==='RESERVED')throw new ConflictException('期初仓位或状态无效，真实预占须先核对处理');
      const known=line.costStatus==='CONFIRMED';
      if(!['CONFIRMED','UNKNOWN'].includes(line.costStatus)||known&&(typeof line.unitCost!=='number'||!Number.isFinite(line.unitCost)||line.unitCost<0)
        ||!known&&line.unitCost!==null)throw new ConflictException('期初成本须区分财务核定值与未知');
      const realDate=(d:unknown)=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
      if(line.productionDate!==null&&(!realDate(line.productionDate)||line.productionDate>postingDate)
        ||line.expireDate!==null&&(!realDate(line.expireDate)||line.productionDate&&line.expireDate<line.productionDate))throw new ConflictException('期初生产日或效期无效');
      if(line.stockStatus==='AVAILABLE'&&(!known||line.qualityConfirmed!==true||!line.productionDate||!line.expireDate||line.expireDate<postingDate))
        throw new ConflictException('成本、质检或日期未确认的期初实物只能受限登记');
      const [grade]=await manager.query("SELECT * FROM product_grades WHERE grade_code=$1 AND status='ACTIVE'",[identity.gradeCode]);
      if(grade?.default_stock_status&&grade.default_stock_status!=='AVAILABLE'&&line.stockStatus==='AVAILABLE')throw new ConflictException('缺陷档不能以可售状态开账');
      const batchNo=`OPN-${manifest.id.replace(/-/g,'')}-${index+1}`;
      await manager.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,disposition,origin_kind,
        origin_ref,evidence_sha256,created_by,source_type,source_no,cost_status,inventory_domain_id,source_warehouse_code,source_quantity,source_unit,opening_manifest_id)
        VALUES($1,$2,$3,$4,$5,'QUALIFIED','OPENING',$6,$7,$8,'OPENING',$9,$10,$11,$12,$13,'枚',$14)`,
        [batchNo,claim.scope_id,manifest.company_code,identity.productCode,identity.skuCode,`${manifest.document_no}:${index+1}`,manifest.content_hash,actor,
          manifest.document_no,line.costStatus,claim.domain_id,manifest.warehouse_code,quantity,manifest.id]);
      await manager.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,location_code,product_code,sku_code,item_type,unit,
        qty,qty_available,status,inventory_class,grade_code_std,quality_grade,spec_code,packaging_spec,base_quantity_version,variety_code,
        source_type,source_no,egg_date,inbound_date,expire_date,unit_cost,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,'SKU','枚',$7,$8,$9,$10,$11,$11,$12,$12,1,$13,'OPENING',$14,$15,$16,$17,$18,now(),now())`,
        [batchNo,manifest.company_code,manifest.warehouse_code,line.locationCode,identity.productCode,identity.skuCode,quantity,
          line.stockStatus==='AVAILABLE'?quantity:0,line.stockStatus,resolveInventoryClass(identity.gradeCode),identity.gradeCode,identity.specCode,
          identity.varietyCode,manifest.document_no,line.productionDate,postingDate,line.expireDate,known?line.unitCost:0]);
      const ledgerId=await writeInvLedger(manager,{batchNo,changeType:INV_LEDGER_CHANGE_TYPE.OPENING_INBOUND,qtyChange:quantity,
        refNo:manifest.document_no,operator:String(user.username??actor),companyCode:manifest.company_code,warehouseCode:manifest.warehouse_code,
        locationCode:line.locationCode,skuCode:identity.skuCode,qualityGrade:identity.gradeCode,unit:'枚',businessType:'OPENING',logDate:postingDate,
        costChange:known?quantity*line.unitCost:null,note:`Approved counted opening ${manifest.document_no} line ${index+1}`});
      if(!ledgerId)throw new ConflictException('期初原流水缺少真实身份');
      output.push({batchNo,quantity,inventoryLedgerId:ledgerId,costStatus:line.costStatus,unitCost:line.unitCost,stockStatus:line.stockStatus});
    }
    return {manifestId:manifest.id,documentNo:manifest.document_no,contentHash:manifest.content_hash,postingDate,
      totalOpening:output.reduce((n,l)=>n+Number(l.quantity),0),batches:output,domains:claims.map((c:any)=>({domainId:c.domain_id,productCode:c.product_code,openingReceiptId:c.opening_receipt_id}))};
  }

  /** Only the approved conversion orchestrator can bind the actual transaction capability. */
  async postApprovedConversionOutput(manager:EntityManager,documentId:string,lineNo:number){
    const {document,planned:line,actorId,username}=beginApprovedConversionOutput(manager,documentId,lineNo);
    const scope=this.cls.get<DataScopeContext|undefined>('dataScope'),user=this.cls.get('user') as any;
    if(!user||!hasPerm(user.permissions,'MENU_PROD_INBOUND','E')||String(user.userId??user.id??'')!==actorId
      ||!scope||!scope.isGlobal&&(!scope.allowedCompanyCodes.includes(document.company_code)||!scope.allowedWarehouseCodes.includes(document.warehouse_code)))
      throw new ForbiddenException('无权向该公司及仓库办理实际转换产出');
    const [warehouse]=await manager.query('SELECT company_code,status,domain FROM wms_warehouses WHERE warehouse_code=$1 FOR SHARE',[document.warehouse_code]);
    if(warehouse?.company_code!==document.company_code||warehouse.status!=='ACTIVE'||warehouse.domain!=='OPERATIONAL')throw new ConflictException('转换产出必须进入本公司的实际作业仓');
    const identity=await this.resolveInventoryItem(manager,line.skuCode,'SKU',document.company_code);
    if(identity.itemType!=='SKU'||identity.unit!=='枚'||identity.productCode!==document.product_code||identity.gradeCode!==line.gradeCode
      ||identity.specCode!==line.specCode||!Number.isSafeInteger(line.quantity)||line.quantity<=0)throw new ConflictException('转换产出的实际SKU、等级、规格或枚数已变化');
    const [location]=await manager.query("SELECT 1 FROM wms_locations WHERE location_code=$1 AND warehouse_code=$2 AND status IN('ACTIVE','NORMAL') FOR SHARE",[line.locationCode,document.warehouse_code]);
    const [domain]=await manager.query(`SELECT domain.scope_id FROM production_inventory_domains domain JOIN production_cutover_scopes scope ON scope.id=domain.scope_id
      LEFT JOIN production_inventory_domain_states state ON state.company_code=domain.company_code AND state.warehouse_code=domain.warehouse_code AND state.product_code=domain.product_code
      WHERE domain.company_code=$1 AND domain.warehouse_code=$2 AND domain.product_code=$3 AND scope.state IN('ACTIVE','SUSPENDED')
        AND(scope.state='ACTIVE' AND state.id IS NULL OR state.state='ACTIVE')
      ORDER BY domain.scope_id LIMIT 1 FOR SHARE OF scope`,[document.company_code,document.warehouse_code,document.product_code]);
    if(!location||!domain||!['AVAILABLE','QUARANTINE','DAMAGED'].includes(line.inventoryStatus))throw new ConflictException('转换仓位、实物域或按档库存状态未核实');
    const roots=await manager.query(`SELECT q.batch_no AS root FROM production_conversion_inputs input JOIN production_batch_qualifications q ON q.batch_no=input.parent_batch_no
      WHERE input.document_id=$1 AND q.origin_kind<>'DERIVED' UNION SELECT root.root_batch_no AS root FROM production_batch_roots root
      JOIN production_conversion_inputs input ON input.parent_batch_no=root.batch_no WHERE input.document_id=$1 ORDER BY root`,[documentId]);
    const rawRoots=await manager.query(`SELECT raw_segment_id FROM production_conversion_inputs WHERE document_id=$1 AND raw_segment_id IS NOT NULL
      UNION SELECT root.raw_segment_id FROM production_batch_raw_roots root JOIN production_conversion_inputs input ON input.parent_batch_no=root.batch_no WHERE input.document_id=$1
      ORDER BY raw_segment_id`,[documentId]);
    if(!roots.length&&!rawRoots.length)throw new ConflictException('转换缺少实际原始根，不能无投入创建库存');
    const batchNo=`CVT-${documentId.replace(/-/g,'')}-${lineNo}`;
    await manager.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,disposition,origin_kind,origin_ref,
      source_type,source_no,cost_status,evidence_sha256,created_by,processing_stage,conversion_document_id,conversion_output_no)
      VALUES($1,$2,$3,$4,$5,'QUALIFIED','DERIVED',$6,'CONVERSION',$7,'UNKNOWN',$8,$9,$10,$11,$12)`,
      [batchNo,domain.scope_id,document.company_code,identity.productCode,identity.skuCode,`${document.document_no}:${lineNo}`,document.document_no,
        document.content_hash,actorId,line.outputKind==='WIP'?'WIP':'FINISHED',documentId,lineNo]);
    for(const root of roots)await manager.query('INSERT INTO production_batch_roots(batch_no,root_batch_no) VALUES($1,$2)',[batchNo,root.root]);
    for(const root of rawRoots)await manager.query('INSERT INTO production_batch_raw_roots(batch_no,raw_segment_id) VALUES($1,$2)',[batchNo,root.raw_segment_id]);
    await manager.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,location_code,product_code,sku_code,item_type,unit,qty,qty_available,status,
      inventory_class,grade_code_std,quality_grade,spec_code,packaging_spec,base_quantity_version,variety_code,source_type,source_no,egg_date,inbound_date,expire_date,unit_cost,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,'SKU','枚',$7,$8,$9,$10,$11,$11,$12,$12,1,$13,'CONVERSION',$14,$15,$16,$17,0,now(),now())`,
      [batchNo,document.company_code,document.warehouse_code,line.locationCode,identity.productCode,identity.skuCode,line.quantity,
        line.inventoryStatus==='AVAILABLE'?line.quantity:0,line.inventoryStatus,line.outputKind==='WIP'?'WIP':resolveInventoryClass(identity.gradeCode),
        identity.gradeCode,identity.specCode,identity.varietyCode,document.document_no,line.eggDate,document.expected_posting_date,line.expireDate]);
    const ledgerId=await writeInvLedger(manager,{batchNo,changeType:INV_LEDGER_CHANGE_TYPE.CONVERSION_IN,qtyChange:line.quantity,operator:username,
      refNo:document.document_no,companyCode:document.company_code,warehouseCode:document.warehouse_code,locationCode:line.locationCode,
      skuCode:identity.skuCode,qualityGrade:identity.gradeCode,unit:'枚',businessType:'PRODUCTION_CONVERSION',logDate:document.expected_posting_date,
      costChange:null,note:`Approved physical conversion ${document.document_no} output ${lineNo}`});
    if(!ledgerId)throw new ConflictException('转换产出缺少真实入账流水');
    const directRaw=await manager.query(`SELECT segment.*,receipt.production_date::text AS production_date,receipt.house_code,receipt.payload->'profile' AS profile,
      input.quantity AS actual_input_quantity FROM production_conversion_inputs input JOIN production_raw_receipt_segments segment ON segment.id=input.raw_segment_id
      JOIN production_raw_receipts receipt ON receipt.id=segment.receipt_id WHERE input.document_id=$1 ORDER BY input.line_no`,[documentId]);
    for(const source of directRaw)await manager.query(`INSERT INTO inv_flock_source_links(id,batch_no,daily_log_id,occupancy_id,flock_no,house_code,company_code,
      production_date,source_key,grading_code,source_input_qty,batch_output_qty,allocated_output_qty,precision,source_profile_snapshot,origin_batch_no)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL,'RELATED_INPUT',$13,$2) ON CONFLICT(batch_no,daily_log_id,source_key,grading_code) DO NOTHING`,
      [randomUUID(),batchNo,source.daily_log_id,source.occupancy_id,source.flock_no,source.house_code,document.company_code,source.production_date,
        source.source_key,document.document_no,source.actual_input_quantity,line.quantity,JSON.stringify(source.profile)]);
    const parents=await manager.query('SELECT parent_batch_no FROM production_conversion_inputs WHERE document_id=$1 AND parent_batch_no IS NOT NULL ORDER BY parent_batch_no',[documentId]);
    for(const parent of parents)await inheritFlockProductionSources(manager,parent.parent_batch_no,batchNo,line.quantity);
    completeApprovedConversionOutput(manager,lineNo);
    return {batchNo,inventoryLedgerId:ledgerId,outputKind:line.outputKind,skuCode:identity.skuCode,gradeCode:identity.gradeCode,quantity:line.quantity,
      warehouseCode:document.warehouse_code,locationCode:line.locationCode};
  }

  /** Historical protocol retained for forensic fixtures only. The production CLI apply entry is retired; archived batches also fail database admission. */
  async reverseReviewedTempProductionInbound(plan: TempReversalPlan) {
    const c=TEMP_PRODUCTION_REVERSAL_CASE;
    if(plan?.schema!=='phoenix.temp-production-reversal-plan/v1'||plan.caseId!==c.id
      || !/^[a-f0-9]{64}$/.test(plan.planSha256||'')) throw new ConflictException('TEMP_REVERSAL_PLAN_HOLD');
    return this.em.transaction(async manager=>{
      await manager.query("SET LOCAL lock_timeout='5s'");
      await manager.query("SET LOCAL statement_timeout='15s'");
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1))",[c.houseCode]);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${c.companyCode}|TEMP_PRODUCTION_DAILY|${c.originalDate}|${c.collectionRef}`]);
      await lockQuantityPools(manager,c.targets.map(target=>({company:c.companyCode,warehouses:[c.warehouseCode],
        snapshot:{productCode:target.product,gradeCode:target.grade,baseUnit:'枚'}})));
      const nos=c.targets.map(target=>target.batchNo);
      await manager.query('SELECT batch_no FROM inv_batches WHERE batch_no=ANY($1::text[]) ORDER BY batch_no FOR UPDATE',[nos]);
      await manager.query('SELECT id FROM inv_ledger WHERE batch_no=ANY($1::text[]) ORDER BY id FOR UPDATE',[nos]);
      const fresh=await inspectTempProductionReversal(manager,plan.releaseSha);
      if(fresh.state==='REVERSED') {
        const existing=await manager.query("SELECT note FROM inv_ledger WHERE batch_no=ANY($1::text[]) AND change_type='TEMP_PRODUCTION_REVERSAL' ORDER BY id",[nos]);
        if(existing.length!==2 || existing.some((row:{note:string})=>JSON.parse(row.note).plan_sha256!==plan.planSha256)) {
          throw new ConflictException('TEMP_REVERSAL_IDEMPOTENCY_HOLD: completed under a different plan');
        }
        if(fresh.localStatus!=='CLEAR') return {outcome:'HOLD_POST_STATE' as const,previousOutcome:'COMPLETED' as const,
          caseId:c.id,planSha256:plan.planSha256,batches:nos,checks:fresh.checks.filter(check=>!['CLEAR','NOT_APPLICABLE'].includes(check.status))};
        if(fresh.migrationLedgerSha256!==plan.migrationLedgerSha256 || this.tempCorrectionAuthority?.runningReleaseSha!==plan.releaseSha) {
          return {outcome:'HOLD_CONTEXT_DRIFT' as const,previousOutcome:'COMPLETED' as const,caseId:c.id,planSha256:plan.planSha256,
            batches:nos,currentMigrationLedgerSha256:fresh.migrationLedgerSha256,runtimeReleaseSha:this.tempCorrectionAuthority?.runningReleaseSha??null};
        }
        return {outcome:'ALREADY_COMPLETED' as const,caseId:c.id,planSha256:plan.planSha256,batches:nos};
      }
      if(!this.tempCorrectionAuthority)throw new ConflictException('TEMP_REVERSAL_APPLY_HOLD: sealed business approval, financial authority and backup verifier not integrated');
      const authority=await this.tempCorrectionAuthority.verify(plan);
      assertReversalAuthorityBinding(plan,authority);
      if(this.tempCorrectionAuthority.runningReleaseSha!==plan.releaseSha)throw new ConflictException('TEMP_REVERSAL_RUNTIME_RELEASE_HOLD');
      if(fresh.localStatus!=='CLEAR' || fresh.state!=='OPEN' || fresh.snapshotSha256!==plan.snapshotSha256
        || fresh.migrationLedgerSha256!==plan.migrationLedgerSha256 || fresh.planSha256!==plan.planSha256) {
        throw new ConflictException('TEMP_REVERSAL_CAS_HOLD: stock, references, daily, schema ledger or financial classification changed');
      }
      const ledgerIds: number[]=[];
      await withCorrectionLedgerWrites(manager,plan,authority,async()=>{
        for(const target of c.targets) {
          const changed=await manager.query(`WITH changed AS (UPDATE inv_batches SET qty=qty-$3::numeric,qty_available=qty_available-$3::numeric,updated_at=now()
            WHERE id=$1 AND batch_no=$2 AND qty=$3::numeric AND qty_available=$3::numeric AND status='AVAILABLE'
              AND company_code=$4 AND warehouse_code=$5 AND location_code=$6 AND source_no=$7
            RETURNING batch_no) SELECT batch_no FROM changed`,[target.id,target.batchNo,target.qty,c.companyCode,c.warehouseCode,c.locationCode,c.sourceNo]);
          if(changed.length!==1)throw new ConflictException('TEMP_REVERSAL_QUANTITY_CAS_HOLD');
        }
        for(const params of correctionLedgerParameters(plan,authority)) {
          const id=await writeInvLedger(manager,params);
          if(!Number.isSafeInteger(id)||id<=0)throw new ConflictException('TEMP_REVERSAL_LEDGER_HOLD');
          ledgerIds.push(id);
        }
        if(await readTempProductionReversalState(manager)!=='REVERSED')throw new ConflictException('TEMP_REVERSAL_PAIR_HOLD');
      });
      return {outcome:'COMPLETED' as const,caseId:c.id,planSha256:plan.planSha256,batches:nos,ledgerIds,
        executionDate:authority.executionDate,financialCostStatus:'UNKNOWN_PRE_SCHEMA' as const};
    });
  }

  async assertWarehouseOwnership(input: Record<string, any>, existing?: Record<string, any>): Promise<void> {
    const ownerStoreId = input.owner_store_id ?? existing?.owner_store_id;
    if (ownerStoreId === undefined || ownerStoreId === null || ownerStoreId === '') return;
    const companyCode = String(input.company_code ?? existing?.company_code ?? '').trim();
    const warehouseCode = String(input.warehouse_code ?? existing?.warehouse_code ?? '').trim();
    const [store] = await this.em.query(
      `SELECT id,store_code,company_code,status FROM store_master WHERE id=$1 LIMIT 1`,
      [ownerStoreId],
    );
    if (!store || store.status !== 'ACTIVE') {
      throw new BadRequestException('owner_store_id 必须指向 ACTIVE 门店');
    }
    if (!companyCode || store.company_code !== companyCode) {
      throw new BadRequestException('门店自有仓与 owner store 必须属于同一公司');
    }
    const companyShort = companyCode.replace(/^COMP-/, '').replace(/[^A-Z0-9]+/gi, '_').toUpperCase();
    const storeShort = String(store.store_code).replace(/^STORE-/, '').replace(/[^A-Z0-9]+/gi, '_').toUpperCase();
    const expectedCode = `ST_${companyShort}_${storeShort}_SALES`;
    if (warehouseCode !== expectedCode) {
      throw new BadRequestException(`门店自有仓编码必须为 ${expectedCode}`);
    }
  }

  private warehouseScope(column = 'warehouse_code', paramOffset = 0): { sql: string; params: unknown[] } {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (scope?.isGlobal) {
      return { sql: '1=1', params: [] };
    }
    if (!scope || scope.allowedWarehouseCodes.length === 0) return { sql: '1=0', params: [] };
    return {
      sql: `(${column} = ANY($${paramOffset + 1}) OR ${column} IS NULL)`,
      params: [scope.allowedWarehouseCodes],
    };
  }

  private async assertWritableWarehouse(warehouseCode: string | null | undefined, label: string): Promise<void> {
    if (!warehouseCode) {
      throw new ForbiddenException(`无权写入该${label}（缺少仓库归属）`);
    }
    // Some transaction-focused unit fixtures expose only EntityManager.transaction;
    // real Nest EntityManager instances always expose query().
    if (typeof this.em.query === 'function') {
      const [warehouse] = await this.em.query(
        `SELECT domain FROM wms_warehouses WHERE warehouse_code = $1 LIMIT 1`,
        [warehouseCode],
      );
      if (!warehouse) throw new ForbiddenException(`无权写入该${label}（仓库不存在）`);
      if (warehouse.domain !== 'OPERATIONAL') {
        throw new ForbiddenException(`无权写入该${label}（非操作仓禁止仓储操作）`);
      }
    }
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (scope?.isGlobal) return;
    if (!scope || scope.allowedWarehouseCodes.length === 0) {
      throw new ForbiddenException(`无权写入该${label}（未配置仓库范围）`);
    }
    if (!scope.allowedWarehouseCodes.includes(warehouseCode)) {
      throw new ForbiddenException(`无权写入该${label}（仓库范围不匹配）`);
    }
  }

  /** DEFECT_SALE is ordinary sale stock only for farm/wholesale flows. */
  private async assertDefectSaleOutboundAllowed(manager: EntityManager, batch: any, order: any): Promise<void> {
    if(String(order?.type||'').toUpperCase()==='SALE'&&!allowedInventoryClassesForSales('FARM_SALES').some(kind=>kind===String(batch?.inventory_class||'STANDARD').toUpperCase()))
      throw new BadRequestException('在制品须先完成实际包装转换，不能按销售出库');
    if (String(batch?.inventory_class || '').toUpperCase() !== 'DEFECT_SALE') return;
    if (String(order?.type || '').toUpperCase() !== 'SALE') return;
    const destinationType = String(order?.destination_type || '').toUpperCase();
    if (destinationType === 'STORE' || destinationType === 'POS' || this.nonEmptyString(order?.destination_store_code)) {
      throw new BadRequestException('直营门店/POS 出库不允许使用 DEFECT_SALE 缺陷销售库存');
    }
    const [warehouse] = await manager.query(
      `SELECT type, domain, owner_store_id FROM wms_warehouses WHERE warehouse_code=$1 LIMIT 1`,
      [batch.warehouse_code],
    );
    if (!warehouse) throw new BadRequestException(`库存批次 ${batch.batch_no} 所属仓库不存在`);
    if (warehouse.owner_store_id || String(warehouse.type || '').toUpperCase() === 'STORE') {
      throw new BadRequestException('门店仓库不允许销售 DEFECT_SALE 缺陷库存');
    }
    if (String(warehouse.domain || '').toUpperCase() !== 'OPERATIONAL') {
      throw new BadRequestException(`仓库 ${batch.warehouse_code} 非养鸡场销售仓，禁止使用 DEFECT_SALE 库存`);
    }
  }

  private async canUseDefectSaleBatch(manager: EntityManager, batch: any, order: any): Promise<boolean> {
    if(String(order?.type||'').toUpperCase()==='SALE'&&!allowedInventoryClassesForSales('FARM_SALES').some(kind=>kind===String(batch?.inventory_class||'STANDARD').toUpperCase()))return false;
    if (String(batch?.inventory_class || '').toUpperCase() !== 'DEFECT_SALE') return true;
    try {
      await this.assertDefectSaleOutboundAllowed(manager, batch, order);
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) return false;
      throw error;
    }
  }

  /** Warehouse ownership, never request company, is the transaction authority. */
  private async lockWarehouseCompany(manager: EntityManager, warehouseCode: string, claimedCompany?: unknown): Promise<string> {
    const [warehouse] = await manager.query(
      'SELECT company_code FROM wms_warehouses WHERE warehouse_code=$1 FOR SHARE', [warehouseCode],
    );
    const company = this.nonEmptyString(warehouse?.company_code);
    if (!company || company === 'ALL') throw new BadRequestException(`仓库 ${warehouseCode} 缺少有效公司归属`);
    const claimed = this.nonEmptyString(claimedCompany);
    if (claimed && claimed !== company) throw new BadRequestException('单据或批次公司与仓库归属不一致；不支持受托代管库存');
    return company;
  }

  private assertBatchCompany(batch: any, company: string): void {
    const owner = this.nonEmptyString(batch.company_code);
    if (owner && owner !== 'ALL' && owner !== company) {
      throw new BadRequestException('批次公司与仓库归属不一致；不支持受托代管库存');
    }
  }

  private async assertTransferSku(manager: EntityManager, batch: any, fromWarehouse: string, toWarehouse: string): Promise<void> {
    const sourceCompany = await this.lockWarehouseCompany(manager, fromWarehouse);
    this.assertBatchCompany(batch, sourceCompany);
    const targetCompany = await this.lockWarehouseCompany(manager, toWarehouse);
    if(sourceCompany!==targetCompany){
      const [schema]=await manager.query("SELECT to_regclass('production_batch_raw_roots') AS raw_roots");
      if(schema?.raw_roots&&(String(batch.inventory_class)==='WIP'||(await manager.query(`SELECT 1 WHERE official_inventory_conversion_related($1)
        OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=$1)`,[batch.batch_no])).length))
        throw new ConflictException('原始收蛋、加工产出或在制品的跨公司接收证明尚未完备，不能先扣减发运');
    }
    if (batch.sku_code != null) {
      // Transaction companies are not SKU origin: keep identity and check both exact scopes.
      await SkuPolicy.requireUsable(manager, batch.sku_code, 'stock', sourceCompany);
      await SkuPolicy.requireUsable(manager, batch.sku_code, 'stock', targetCompany);
    }
  }

  private async resolveTransferTargetIdentity(
    manager: EntityManager,
    warehouseCode: string,
    sourceStoreCode: string | null | undefined,
    sourceCompanyCode: string | null | undefined,
  ): Promise<{ companyCode: string; storeCode: string }> {
    const [target] = await manager.query(
      `SELECT w.company_code,sm.store_code,sm.status AS store_status,sm.company_code AS store_company_code
         FROM wms_warehouses w
         LEFT JOIN store_master sm ON sm.id=w.owner_store_id
        WHERE w.warehouse_code=$1
        LIMIT 1 FOR SHARE OF w`,
      [warehouseCode],
    );
    if (!target?.company_code || target.company_code === 'ALL') {
      throw new BadRequestException(`调拨目标仓 ${warehouseCode} 缺少有效公司归属`);
    }
    if (target.store_code && target.store_status !== 'ACTIVE') {
      throw new BadRequestException(`调拨目标仓 ${warehouseCode} 的 owner store 非 ACTIVE`);
    }
    if(target.store_code&&target.store_company_code!==target.company_code)throw new BadRequestException('调拨目标仓门店归属与仓库公司不一致');
    return {
      companyCode: target.company_code,
      storeCode: target.store_code || (target.company_code===sourceCompanyCode?sourceStoreCode:null) || 'ALL',
    };
  }

  async assertPurchaseReceiptWarehouseUsage(
    manager: Pick<EntityManager, 'query'>,
    warehouseCode: string | null | undefined,
  ): Promise<void> {
    const normalized = String(warehouseCode ?? '').trim();
    const [warehouse] = normalized
      ? await manager.query(
        `SELECT type, domain FROM wms_warehouses WHERE warehouse_code = $1 LIMIT 1`,
        [normalized],
      )
      : [];
    if (!warehouse || warehouse.domain !== 'OPERATIONAL'
      || !WmsService.PURCHASE_RECEIPT_WAREHOUSE_TYPES.has(String(warehouse.type ?? '').toUpperCase())) {
      throw new BadRequestException('采购收货仅允许饲料/药品疫苗/采购到货/原料包材仓');
    }
  }

  private nonEmptyString(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
  }

  private assertOutboundPermission(type: unknown, user: any, perm: PermCode): void {
    const roles = Array.isArray(user?.roles) ? user.roles : [user?.role].filter(Boolean);
    if (roles.includes('ROLE_ADMIN')) return;
    const menu = isIssueOutboundType(type) ? 'MENU_WMS_ISSUE' : 'MENU_WMS_INOUT';
    if (!hasPerm(user?.permissions, menu, perm)) {
      throw new ForbiddenException(`缺少 ${menu}:${perm} 权限`);
    }
  }

  private assertDefectDispositionPermission(user: any): void {
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    const roles = Array.isArray(user?.roles) ? user.roles : [user?.role].filter(Boolean);
    if (roles.includes('ROLE_ADMIN')) return;
    if (!hasPerm(permissions, 'MENU_INV_BATCH', 'E') && !hasPerm(permissions, 'MENU_WMS_ISSUE', 'E')) {
      throw new ForbiddenException('缺少 MENU_INV_BATCH:E 或 MENU_WMS_ISSUE:E 权限');
    }
  }

  private outboundSkuUsage(type: unknown): 'stock' | 'sale-stock' {
    return resolveOutboundPolicy(type)?.category === 'SALES' ? 'sale-stock' : 'stock';
  }

  private validateStandaloneOutbound(body: any): void {
    const errors = validateOutboundPolicy(body);
    if (errors.length > 0) {
      throw new BadRequestException({ code: 400, msg: '出库业务校验失败', errors });
    }
  }

  private async assertActiveScopedDestination(body: any): Promise<void> {
    const type = String(body?.destination_type || '').trim().toUpperCase();
    const code = resolveOutboundDestinationCode(body);
    if (type === 'OTHER') return;
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    const global = Boolean(scope?.isGlobal);
    const companies = scope?.allowedCompanyCodes ?? [];
    const warehouses = scope?.allowedWarehouseCodes ?? [];
    const projects = scope?.allowedProjectCodes ?? [];
    const farms = scope?.allowedFarmCodes ?? [];
    const sites = scope?.allowedSiteCodes ?? [];
    const lookups: Record<string, { sql: string; params: unknown[] }> = {
      HOUSE: { sql: `SELECT 1 FROM brd_houses h ${OrgOwnershipService.ACTIVE_FARM_JOIN}
        WHERE h.house_code=$1 AND h.status='ACTIVE' AND ($2::boolean OR h.farm_code=ANY($3) OR f.company_code=ANY($4) OR ${OrgOwnershipService.FARM_SITE_SQL}=ANY($5)) LIMIT 1`, params: [code, global, farms, companies, sites] },
      CUSTOMER: { sql: `SELECT 1 FROM sal_customers WHERE customer_no=$1 AND status='ACTIVE' AND ($2::boolean OR company_code=ANY($3)) LIMIT 1`, params: [code, global, companies] },
      WAREHOUSE: { sql: `SELECT 1 FROM wms_warehouses WHERE warehouse_code=$1 AND status='ACTIVE' AND domain='OPERATIONAL' AND ($2::boolean OR warehouse_code=ANY($3)) LIMIT 1`, params: [code, global, warehouses] },
      STORE: { sql: `SELECT 1 FROM mst_stores WHERE store_code=$1 AND status='ACTIVE' AND ($2::boolean OR company_code=ANY($3)) LIMIT 1`, params: [code, global, companies] },
      DEPARTMENT: { sql: `SELECT 1 FROM sys_organizations WHERE org_code=$1 AND org_type='DEPARTMENT' AND status='ACTIVE' AND ($2::boolean OR company_code=ANY($3)) LIMIT 1`, params: [code, global, companies] },
      PROJECT: { sql: `SELECT 1 FROM biz_projects WHERE project_code=$1 AND status='ACTIVE' AND ($2::boolean OR project_code=ANY($3) OR company_code=ANY($4)) LIMIT 1`, params: [code, global, projects, companies] },
      EMPLOYEE: { sql: `SELECT 1 FROM sys_user u WHERE u.username=$1 AND u.status=1 AND ($2::boolean OR EXISTS (
        SELECT 1 FROM sys_user_orgs uo JOIN sys_organizations o ON o.id=uo.org_id WHERE uo.user_id=u.user_id
        AND (o.company_code=ANY($3) OR o.org_code=ANY($4) OR o.site_code=ANY($4)))) LIMIT 1`, params: [code, global, companies, sites] },
      SUPPLIER: { sql: `SELECT 1 FROM prc2_suppliers WHERE supplier_code=$1 AND status='ACTIVE' AND is_active=true
        AND ($2::boolean OR shared_scope='GROUP' OR owner_company_code=ANY($3)) LIMIT 1`, params: [code, global, companies] },
    };
    const lookup = lookups[type];
    if (!lookup || !(await this.em.query(lookup.sql, lookup.params)).length) {
      throw new BadRequestException(`去向 ${type || '(空)'}:${code || '(空)'} 不存在、未启用或不在数据范围内`);
    }
  }

  private itemIdentityLabel(item: { batch_no?: unknown; product_code?: unknown; sku_code?: unknown; material_code?: unknown }): string {
    return this.nonEmptyString(item.batch_no)
      || this.nonEmptyString(item.material_code)
      || this.nonEmptyString(item.sku_code)
      || this.nonEmptyString(item.product_code)
      || '(未指定)';
  }

  private orderStoreScope(column = 'store_code', paramOffset = 0): { sql: string; params: unknown[] } {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (!scope || scope.isGlobal) return { sql: '1=1', params: [] };

    const userStoreCode = String(this.cls.get('user.storeCode') || '').trim();
    const allowedStoreCodes = Array.from(new Set([
      ...(scope.allowedSiteCodes || []),
      ...(userStoreCode && userStoreCode !== 'ALL' ? [userStoreCode] : []),
    ].filter(Boolean)));

    if (allowedStoreCodes.length === 0) return { sql: '1=0', params: [] };
    return {
      sql: `${column} = ANY($${paramOffset + 1})`,
      params: [allowedStoreCodes],
    };
  }

  // ─── 入库 (Inbound) ─────────────────────────────────────────────────────────
  async getInboundDashboard() {
    try {
      const scope = this.warehouseScope('warehouse_code', 0);
      const [pending] = await this.em.query(
        `SELECT COUNT(*) as count FROM wms_inbound WHERE status = 'PENDING' AND ${scope.sql}`,
        scope.params,
      );
      const [processing] = await this.em.query(
        `SELECT COUNT(*) as count FROM wms_inbound WHERE status = 'PROCESSING' AND ${scope.sql}`,
        scope.params,
      );
      return {
        code: 200,
        data: {
          pending: parseInt(pending.count),
          processing: parseInt(processing.count),
          completed_today: 0,
        },
      };
    } catch (e) {
      this.logger.error(`getInboundDashboard 看板查询失败，降级返回空数据: ${(e as Error).message}`);
      return { code: 200, data: { pending: 0, processing: 0, completed_today: 0 } };
    }
  }

  async getPendingInbound() {
    try {
      const scope = this.warehouseScope('wi.warehouse_code', 0);
      const data = await this.em.query(
        `SELECT wi.*,
                wh.warehouse_name, wh.warehouse_name_zh, wh.warehouse_name_en, wh.warehouse_name_lo
           FROM wms_inbound wi
           LEFT JOIN wms_warehouses wh ON wh.warehouse_code = wi.warehouse_code
          WHERE wi.status IN ('PENDING', 'PROCESSING') AND ${scope.sql}
          ORDER BY wi.created_at DESC, wi.id DESC`,
        scope.params,
      );
      return { code: 200, data };
    } catch (e) {
      this.logger.error(`getPendingInbound 查询失败，降级返回空列表: ${(e as Error).message}`);
      return { code: 200, data: [] };
    }
  }

  async getInboundTask(taskNo: string) {
    try {
      const scope = this.warehouseScope('wi.warehouse_code', 1);
      const tasks = await this.em.query(
        `SELECT wi.*,
                wh.warehouse_name, wh.warehouse_name_zh, wh.warehouse_name_en, wh.warehouse_name_lo
           FROM wms_inbound wi
           LEFT JOIN wms_warehouses wh ON wh.warehouse_code = wi.warehouse_code
          WHERE wi.task_no = $1 AND ${scope.sql}`,
        [taskNo, ...scope.params],
      );
      if (!tasks.length) return { code: 404, msg: '任务不存在' };
      const items = await this.em.query(
        `SELECT ii.*, ii.id AS line_no, COALESCE(ii.expected_qty, ii.qty) AS planned_qty,
                p.product_name_zh AS product_name, p.product_name_zh,
                p.product_name_en, p.product_name_lo, p.unit
           FROM wms_inbound_items ii
           LEFT JOIN mst_products p ON p.product_code = ii.product_code
          WHERE ii.task_no = $1
          ORDER BY ii.id`,
        [taskNo],
      );
      return { code: 200, data: { ...tasks[0], items } };
    } catch (e: any) {
      return { code: 500, msg: e.message };
    }
  }

  /**
   * 批量创建入库单。所有单据与明细在同一事务内落库；task_no 已存在时仅允许完全幂等重放。
   */
  async createBatchInbound(body: any, user: any) {
    const documents = Array.isArray(body?.documents) ? body.documents
      : Array.isArray(body?.orders) ? body.orders
      : body?.header && Array.isArray(body?.items) ? [{ ...body.header, items: body.items }]
      : Array.isArray(body?.items) ? [body] : [];
    if (!documents.length) throw new BadRequestException('documents 必须至少包含一条入库单');
    return this.em.transaction(async manager => {
      await lockTempProductionReferences(manager, documents.flatMap((doc: any) => (Array.isArray(doc?.items) ? doc.items : []).map((item: any) => item?.batch_no)));
      const created: any[] = [];
      const identityColumns = ['item_type', 'material_code', 'sku_code', 'material_type', 'unit', 'identity_snapshot'];
      let identityColumnRows: any[] = [];
      try {
        identityColumnRows = await manager.query(
          `SELECT column_name
             FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'wms_inbound_items'
              AND column_name = ANY($1::text[])`,
          [identityColumns],
        );
      } catch {
        // Legacy test doubles and pre-migration adapters may not model metadata
        // inspection; retain the product_code compatibility path in that case.
        identityColumnRows = [];
      }
      const supportsCanonicalIdentity = Array.isArray(identityColumnRows)
        && new Set(identityColumnRows.map((row: any) => row.column_name)).size === identityColumns.length;
      for (const [index, doc] of documents.entries()) {
        const taskNo = this.nonEmptyString(doc?.task_no || doc?.inbound_no);
        if (!taskNo) throw new BadRequestException(`第 ${index + 1} 张入库单 task_no 必填`);
        const items = Array.isArray(doc?.items) ? doc.items : [];
        if (!items.length) throw new BadRequestException(`入库单 ${taskNo} 明细不能为空`);
        const warehouseCode = this.nonEmptyString(doc?.warehouse_code);
        await this.assertWritableWarehouse(warehouseCode, `入库单 ${taskNo}`);
        const existing = await manager.query('SELECT task_no,status FROM wms_inbound WHERE task_no=$1 FOR UPDATE', [taskNo]);
        if (existing.length) {
          if (String(existing[0].status).toUpperCase() !== 'PENDING') {
            throw new BadRequestException(`入库单 ${taskNo} 已存在且状态不可幂等创建`);
          }
          const existingItems = await manager.query('SELECT COUNT(*)::int AS count FROM wms_inbound_items WHERE task_no=$1', [taskNo]);
          if (Number(existingItems[0]?.count || 0) !== items.length) {
            throw new BadRequestException(`入库单 ${taskNo} 幂等键冲突，明细不一致`);
          }
          created.push({ task_no: taskNo, status: 'PENDING', idempotent: true });
          continue;
        }
        const companyCode = await this.lockWarehouseCompany(manager, warehouseCode!, doc?.company_code);
        // Resolve every line before writing the document.  The legacy detail table
        // only has product_code, so the canonical identity must be validated here
        // and mirrored to the header for display until the detail migration lands.
        const resolvedItems = [] as Array<{ input: any; identity: Awaited<ReturnType<WmsService['resolveInventoryItem']>>; qty: number; quantitySnapshot: QuantitySnapshot | null }>;
        for (const [line, item] of items.entries()) {
          const qty = Number(item?.qty ?? item?.expected_qty);
          if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException(`入库单 ${taskNo} 第 ${line + 1} 行数量必须大于 0`);
          const explicitSku = SkuPolicy.optionalCode(item?.sku_code);
          const materialCode = this.nonEmptyString(item?.material_code);
          const requestedType = this.nonEmptyString(item?.item_type) || (explicitSku ? 'SKU' : materialCode ? 'MATERIAL' : null);
          const suppliedCode = explicitSku || materialCode || this.nonEmptyString(item?.product_code || item?.item);
          const identity = await this.resolveInventoryItem(manager, suppliedCode, requestedType, companyCode);
          const quantitySnapshot = await resolveQuantity(manager, { qty, skuCode: identity.skuCode ?? undefined, quantityBasis: item.quantityBasis });
          resolvedItems.push({ input: item, identity, qty, quantitySnapshot });
        }
        const headerIdentity = resolvedItems.length === 1 ? resolvedItems[0].identity : null;
        await manager.query(
          `INSERT INTO wms_inbound (task_no,status,warehouse_code,type,item,item_name,item_type,material_type,material_code,sku_code,unit,qty,store_code,operator,attachment_url,date,site_code,company_code,remark,created_at,updated_at)
           VALUES ($1,'PENDING',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::numeric,$12,$13,$14,$15::date,$16,$17,$18,now(),now())`,
          [taskNo, warehouseCode, String(doc?.type || 'GENERIC').toUpperCase(), this.nonEmptyString(doc?.item || items[0]?.item || items[0]?.product_code),
            headerIdentity?.itemName ?? this.nonEmptyString(doc?.item_name), headerIdentity?.itemType ?? null,
            headerIdentity?.materialType ?? null, headerIdentity?.materialCode ?? null, headerIdentity?.skuCode ?? null,
            headerIdentity?.unit ?? null,
            Number(doc?.qty || resolvedItems.reduce((sum, row) => sum + row.qty, 0)),
            this.nonEmptyString(doc?.store_code) || 'ALL', String(user?.username || doc?.operator || user?.userId || 'SYS'),
            this.nonEmptyString(doc?.attachment_url), doc?.date || null, this.nonEmptyString(doc?.site_code), companyCode, this.nonEmptyString(doc?.remark)],
        );
        for (const { input: item, identity, qty, quantitySnapshot } of resolvedItems) {
          if (supportsCanonicalIdentity) {
            await manager.query(
              `INSERT INTO wms_inbound_items (
                 task_no,batch_no,product_code,item_type,material_code,sku_code,material_type,unit,
                 qty,actual_qty,broken_qty,quantity_snapshot,identity_snapshot
               )
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,0,0,$10::jsonb,$11::jsonb)`,
              [
                taskNo, this.nonEmptyString(item?.batch_no), identity.productCode,
                identity.itemType, identity.materialCode, identity.skuCode, identity.materialType, identity.unit,
                qty, quantitySnapshot == null ? null : JSON.stringify(quantitySnapshot),
                JSON.stringify({ itemType: identity.itemType, materialCode: identity.materialCode, skuCode: identity.skuCode, productCode: identity.productCode, materialType: identity.materialType, unit: identity.unit }),
              ],
            );
          } else {
            await manager.query(
              `INSERT INTO wms_inbound_items (task_no,batch_no,product_code,qty,actual_qty,broken_qty,quantity_snapshot)
               VALUES ($1,$2,$3,$4::numeric,0,0,$5::jsonb)`,
              [taskNo, this.nonEmptyString(item?.batch_no), identity.productCode || identity.skuCode || identity.materialCode,
                qty, quantitySnapshot == null ? null : JSON.stringify(quantitySnapshot)],
            );
          }
        }
        created.push({ task_no: taskNo, status: 'PENDING', idempotent: false });
      }
      return { code: 200, msg: '批量入库单创建成功', data: created };
    });
  }

  /** 批量确认入库：复用单据级库存事务逻辑，并将所有单据包在同一事务。 */
  async confirmBatchInbound(body: any, user: any) {
    const documents = Array.isArray(body?.documents) ? body.documents
      : Array.isArray(body?.orders) ? body.orders
      : body?.header && Array.isArray(body?.items) ? [{ ...body.header, items: body.items }]
      : Array.isArray(body?.items) ? [body] : [];
    if (!documents.length) throw new BadRequestException('documents 必须至少包含一条入库确认');
    return this.em.transaction(async manager => {
      const results: any[] = [];
      for (const doc of documents) {
        const taskNo = this.nonEmptyString(doc?.task_no || doc?.inbound_no);
        if (!taskNo) throw new BadRequestException('入库确认缺少 task_no');
        if (Array.isArray(doc?.items) && doc.items.length === 0) {
          // Preserve the canonical validation response for an explicitly empty
          // confirmation request; do not turn it into a persistence error.
          results.push(await this.confirmInbound({ ...doc, task_no: taskNo, items: [] }, user, manager));
          continue;
        }
        const persistedRows = await manager.query(
          `SELECT id,batch_no, product_code, qty, expected_qty, actual_qty, broken_qty, warehouse_code, location_code,
                  to_jsonb(wms_inbound_items)->>'item_type' AS item_type,
                  to_jsonb(wms_inbound_items)->>'material_code' AS material_code,
                  to_jsonb(wms_inbound_items)->>'sku_code' AS sku_code,
                  to_jsonb(wms_inbound_items)->>'material_type' AS material_type,
                  to_jsonb(wms_inbound_items)->>'unit' AS unit,
                  quantity_snapshot
             FROM wms_inbound_items WHERE task_no = $1 ORDER BY id ASC FOR UPDATE`,
          [taskNo],
        );
        const persisted = Array.isArray(persistedRows) ? persistedRows : [];
        if (!persisted.length) throw new BadRequestException(`入库单 ${taskNo} 没有持久化明细，禁止确认`);
        const requested = Array.isArray(doc?.items) && doc.items.length ? doc.items : null;
        if (requested) {
          if (requested.some((item: any) => !item?.id)) throw new BadRequestException('入库确认明细必须携带持久化明细 id');
          const persistedIds = new Set(persisted.map((item: any) => String(item.id)));
          if (requested.some((item: any) => !persistedIds.has(String(item.id))) || requested.length !== persisted.length) {
            throw new BadRequestException('入库确认明细与持久化明细不一致');
          }
        }
        const requestedById = new Map<string, any>((requested || []).map((item: any) => [String(item.id), item]));
        const items = persisted.map((saved: any) => {
          const input = requestedById.get(String(saved.id));
          return {
            ...saved,
            ...(input ? { actual_qty: input.actual_qty, broken_qty: input.broken_qty, expected_qty: input.expected_qty } : {}),
            actual_qty: (input?.actual_qty ?? saved.actual_qty) && Number(input?.actual_qty ?? saved.actual_qty) > 0 ? (input?.actual_qty ?? saved.actual_qty) : saved.qty,
            expected_qty: (input?.expected_qty ?? saved.expected_qty) && Number(input?.expected_qty ?? saved.expected_qty) > 0 ? (input?.expected_qty ?? saved.expected_qty) : saved.qty,
          };
        });
        results.push(await this.confirmInbound({ ...doc, task_no: taskNo, items }, user, manager, true));
      }
      return { code: 200, msg: '批量入库确认成功', data: results };
    });
  }

  /**
   * 确认入库 — V3 修正版
   *
   * A3 修复要点：
   *   旧版 INSERT inv_batches ... ON CONFLICT (batch_no) DO NOTHING
   *   → 同 batch_no 重复确认会静默丢数（且 batch_no 用毫秒+rand 也可能撞）
   *   现改为 ON CONFLICT DO UPDATE 把数量累加 + 同步写 inv_ledger 流水
   *
   * A1 心脏修复（部分）：
   *   每条 inv_batches 入库都必须配套写入 inv_ledger，让库存守恒可审计
   *   change_type = 'INBOUND'  qty_change = item.qty
   *
   * 注：硬编码 'INBOUND-DOCK' 库位与 'WH-B' 兜底仓库改为前端传入或用 task 字段
   */
  async confirmInbound(body: any, user: any, managerOverride?: EntityManager, requirePersistedLine = false) {
    const { task_no, items = [] } = body;
    if (!task_no) throw new BadRequestException('task_no 必填');

    // V2 fidelity: 严格校验 expected = actual + broken（若提供 expected_qty）
    const validationErrors: string[] = [];
    let hasEffectiveInboundLine = false;
    for (const it of items) {
      const actual = Number(it.actual_qty ?? it.qty) || 0;
      const broken = Number(it.broken_qty) || 0;
      const expected = it.expected_qty != null ? Number(it.expected_qty) : null;
      const productCode = this.nonEmptyString(it.product_code);
      const skuCode = SkuPolicy.optionalCode(it.sku_code);
      const materialCode = this.nonEmptyString(it.material_code);
      if (expected != null && Math.abs((actual + broken) - expected) > 0.0005) {
        validationErrors.push(
          `批次 ${this.itemIdentityLabel(it)}: actual(${actual}) + broken(${broken}) ≠ expected(${expected})`,
        );
      }
      if (actual < 0 || broken < 0) {
        validationErrors.push(
          `批次 ${this.itemIdentityLabel(it)}: actual_qty / broken_qty 不可为负`,
        );
      }
      if (
        Math.abs(Math.round(actual * 1000) - actual * 1000) > 1e-7
        || Math.abs(Math.round(broken * 1000) - broken * 1000) > 1e-7
      ) {
        validationErrors.push(`批次 ${this.itemIdentityLabel(it)}: 数量最多保留 3 位小数`);
      }
      if (actual > 0 || broken > 0) {
        hasEffectiveInboundLine = true;
        if (!productCode && !skuCode && !materialCode) {
          validationErrors.push(`批次 ${this.itemIdentityLabel(it)}: material_code / product_code / sku_code 至少一项必填`);
        }
      }
    }
    if (!hasEffectiveInboundLine) {
      validationErrors.push('入库确认至少需要一条实收或破损数量大于 0 的明细');
    }
    if (validationErrors.length > 0) {
      throw new BadRequestException({ code: 400, msg: '入库数据校验失败', errors: validationErrors });
    }

    const execute = async (manager: EntityManager) => {
      // V2 fidelity: 幂等 — 仅 PENDING/PROCESSING 状态允许确认
      const taskScope = this.warehouseScope('warehouse_code', 1);
      const tasks = await manager.query(
        `SELECT warehouse_code, operator, store_code, status, type, date FROM wms_inbound WHERE task_no = $1 AND ${taskScope.sql} FOR UPDATE`,
        [task_no, ...taskScope.params],
      );
      if (tasks.length === 0) {
        return { code: 404, msg: `入库单 ${task_no} 不存在` };
      }
      const task = tasks[0];
      const workflowErrors = validateInboundWorkflow(task.type, 'GENERIC_INBOUND');
      if (workflowErrors.length > 0) {
        throw new BadRequestException({
          code: 400,
          msg: '入库业务类型必须通过指定工作流执行',
          errors: workflowErrors,
        });
      }
      const inboundPolicy = resolveInboundPolicy(task.type);
      if (!inboundPolicy) {
        throw new BadRequestException(`不支持的入库类型：${task.type || '(空)'}`);
      }
      if (String(task.type ?? '').toUpperCase() === 'PURCHASE') {
        await this.assertPurchaseReceiptWarehouseUsage(manager, task.warehouse_code || null);
      }
      await this.assertWritableWarehouse(task.warehouse_code || null, `入库单 ${task_no}`);
      if (task.status === 'COMPLETED') {
        return { code: 400, msg: `入库单 ${task_no} 已确认（COMPLETED），请勿重复操作`, idempotent: true };
      }
      if (task.status === 'CANCELLED') {
        return { code: 400, msg: `入库单 ${task_no} 已取消（CANCELLED），无法确认` };
      }

      const defaultWarehouse = task.warehouse_code || 'WMS-VTE-MAIN';
      const operator = String(user?.userId || user?.username || task.operator || 'SYS');
      const storeCode = task.store_code || 'ALL';
      let strictPersistedLine = false;
      if (requirePersistedLine) {
        const identityColumnRows = await manager.query(
          `SELECT column_name
             FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'wms_inbound_items'
              AND column_name = ANY($1::text[])`,
          [['item_type', 'material_code', 'sku_code', 'material_type', 'unit', 'identity_snapshot']],
        );
        strictPersistedLine = Array.isArray(identityColumnRows)
          && new Set(identityColumnRows.map((row: any) => row.column_name)).size === 6;
      }

      for (const item of items) {
        const savedLines = await manager.query(`SELECT id,batch_no,quantity_snapshot,qty,product_code,
          to_jsonb(wms_inbound_items)->>'item_type' AS item_type,
          to_jsonb(wms_inbound_items)->>'material_code' AS material_code,
          to_jsonb(wms_inbound_items)->>'sku_code' AS sku_code,
          to_jsonb(wms_inbound_items)->>'material_type' AS material_type,
          to_jsonb(wms_inbound_items)->>'unit' AS unit,
          to_jsonb(wms_inbound_items)->>'unit_cost' AS unit_cost
          FROM wms_inbound_items
         WHERE task_no=$1
           AND (
             ($4::bigint IS NOT NULL AND id=$4)
             OR (
               $4::bigint IS NULL
               AND (
                 ($2::text IS NOT NULL AND batch_no=$2)
                 OR ($2::text IS NULL AND (
                   product_code=$3
                   OR COALESCE(to_jsonb(wms_inbound_items)->>'material_code','')=$3
                   OR COALESCE(to_jsonb(wms_inbound_items)->>'sku_code','')=$3
                 ))
               )
             )
           )
         FOR UPDATE`,
          [task_no, this.nonEmptyString(item.batch_no), this.nonEmptyString(item.sku_code || item.product_code || item.material_code), item.id ?? null]);
        if (savedLines.length>1) throw new BadRequestException('入库明细身份不唯一，请按持久化明细 id 确认');
        if (savedLines.length!==1) {
          if (strictPersistedLine || item.id) throw new BadRequestException('入库明细不存在或不属于当前入库单');
        }
        const savedLine = savedLines[0];
        await lockTempProductionReferences(manager, [savedLine?.batch_no, item.batch_no]);
        const persistedCodes = savedLine ? [savedLine.material_code, savedLine.sku_code, savedLine.product_code].map(value => this.nonEmptyString(value)).filter(Boolean) as string[] : [];
        const requestedCodes = [item.material_code, item.sku_code, item.product_code].map(value => this.nonEmptyString(value)).filter(Boolean) as string[];
        if (requestedCodes.length > 0 && persistedCodes.length > 0 && requestedCodes.some(code => !persistedCodes.includes(code))) {
          throw new BadRequestException('入库明细品目与持久化身份不一致');
        }
        const snapshot: QuantitySnapshot | null = savedLine?.quantity_snapshot ?? null;
        if (snapshot) savedQuantity(savedLine);
        if (item.quantityBasis !== undefined && !snapshot) throw new BadRequestException('请先创建带明确计量的入库明细，再确认实际数量');
        const actualTrade = Number(item.actual_qty ?? item.qty);
        const brokenTrade = Number(item.broken_qty ?? 0);
        if (![actualTrade,brokenTrade].every(Number.isFinite) || actualTrade<0 || brokenTrade<0) throw new BadRequestException('入库实际/破损数量必须为有限非负数');
        const actualQty = snapshot && actualTrade > 0 ? baseQuantity(actualTrade,snapshot.factor,snapshot.baseUnit) : actualTrade;
        const brokenQty = snapshot && brokenTrade > 0 ? baseQuantity(brokenTrade,snapshot.factor,snapshot.baseUnit) : brokenTrade;
        if (actualQty <= 0 && brokenQty <= 0) continue;

        const warehouseCode = item.warehouse_code || item.warehouse || defaultWarehouse;
        await this.assertWritableWarehouse(warehouseCode, `入库明细 ${this.itemIdentityLabel(item)}`);
        const companyCode = await this.lockWarehouseCompany(manager, warehouseCode);

        let productCode = snapshot?.productCode ?? this.nonEmptyString(savedLine?.product_code) ?? this.nonEmptyString(item.product_code);
        let skuCode = snapshot?.skuCode ?? SkuPolicy.optionalCode(savedLine?.sku_code) ?? SkuPolicy.optionalCode(item.sku_code);
        let materialCode = this.nonEmptyString(savedLine?.material_code) ?? this.nonEmptyString(item.material_code);
        let itemType = this.nonEmptyString(savedLine?.item_type) ?? this.nonEmptyString(item.item_type);
        let materialType = this.nonEmptyString(savedLine?.material_type) ?? this.nonEmptyString(item.material_type);
        let varietyCode: string | null = null;
        let unit = this.nonEmptyString(savedLine?.unit) || this.nonEmptyString(item.unit) || '件';
        let gradeCode: string | null = snapshot?.gradeCode ?? null;
        if (materialCode || skuCode || itemType) {
          const identity = await this.resolveInventoryItem(
            manager,
            skuCode || materialCode || productCode,
            skuCode ? 'SKU' : itemType,
            companyCode,
          );
          productCode = identity.productCode;
          skuCode = identity.skuCode;
          materialCode = identity.materialCode;
          itemType = identity.itemType;
          materialType = identity.materialType;
          varietyCode = identity.varietyCode;
          unit = snapshot?.baseUnit ?? identity.unit;
          gradeCode = gradeCode ?? identity.gradeCode;
        }
        if (!skuCode && !materialCode && productCode) {
          const matches = await manager.query(`SELECT 'SKU' AS item_type FROM product_skus WHERE sku_code=$1
            UNION ALL SELECT 'MATERIAL' AS item_type FROM mst_materials WHERE material_code=$1
            UNION ALL SELECT 'PRODUCT' AS item_type FROM mst_products WHERE product_code=$1`, [productCode]);
          if (matches.length>1) throw new BadRequestException('旧品目编码跨域冲突，请明确 item_type 与对应编码');
          if (matches.length===1 && (matches[0].item_type==='SKU' || matches[0].item_type==='MATERIAL')) {
            const identity = await this.resolveInventoryItem(manager, productCode, matches[0].item_type, companyCode);
            skuCode = identity.skuCode;
            productCode = identity.productCode;
            materialCode = identity.materialCode;
            itemType = identity.itemType;
            materialType = identity.materialType;
            unit = identity.unit;
            varietyCode = identity.varietyCode;
            gradeCode = gradeCode ?? identity.gradeCode;
          } else if (matches.length===1 && matches[0].item_type==='PRODUCT') {
            const [product] = await manager.query('SELECT product_mode,variety_code FROM mst_products WHERE product_code=$1 FOR SHARE', [productCode]);
            if (product?.product_mode === 'VARIANT' || product?.variety_code != null) {
              throw new BadRequestException('新品种产品入库必须明确 SKU，禁止 PRODUCT 兜底绕过公司适用范围');
            }
          }
        }
        const inboundPolicyErrors = validateInboundPolicy({
          type: task.type,
          item_type: itemType,
        });
        if (inboundPolicyErrors.length > 0) {
          throw new BadRequestException({
            code: 400,
            msg: '入库业务类型与库存品目不匹配',
            errors: inboundPolicyErrors,
          });
        }
        await manager.query(
          `UPDATE wms_inbound_items
              SET actual_qty = $1::numeric,
                  broken_qty = $2::numeric
            WHERE task_no = $3
              AND (
                ($6::bigint IS NOT NULL AND id=$6)
                OR ($6::bigint IS NULL AND (($4::text IS NOT NULL AND batch_no = $4)
                OR ($4::text IS NULL AND $5::text IS NOT NULL AND product_code = $5)))
              )`,
          [actualTrade, brokenTrade, task_no, this.nonEmptyString(item.batch_no), this.nonEmptyString(item.sku_code || item.product_code || item.material_code), savedLine?.id ?? null],
        );
        const baseBatchNo = item.batch_no ||
          `IBN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
        const locationCode  = item.location_code || 'INBOUND-DOCK';

        // V2 fidelity: 拦截 EXPIRED / LOCKED / QUARANTINE 已存在批次的累加
        if (item.batch_no) {
          const existRows = await manager.query(
            `SELECT * FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
            [item.batch_no],
          );
          if (existRows.length > 0) {
            if (snapshot) assertBatchPool(existRows[0], snapshot);
            for (const [key,expected] of Object.entries({ product_code:productCode,sku_code:skuCode,material_code:materialCode,item_type:itemType,variety_code:varietyCode,source_profile_code:null,source_profile_snapshot:null,unit,warehouse_code:warehouseCode })) {
              if ((existRows[0][key] ?? null)!==(expected ?? null)) throw new BadRequestException(`批次 ${item.batch_no} 的 ${key} 与入库品目不一致，禁止跨域或改标累加`);
            }
            const exStatus = (existRows[0].status || 'AVAILABLE').toUpperCase();
            if (['EXPIRED', 'LOCKED', 'QUARANTINE'].includes(exStatus)) {
              throw new Error(`批次 ${item.batch_no} 当前状态 ${exStatus}，不可继续入库`);
            }
            const existingCompany = this.nonEmptyString(existRows[0].company_code);
            if (existingCompany && existingCompany !== 'ALL' && existingCompany !== companyCode) {
              throw new BadRequestException(`批次 ${item.batch_no} 公司归属 ${existingCompany} 与入库仓 ${companyCode} 不一致`);
            }
          }
        }

        // 正常入库：actual_qty → AVAILABLE batch
        if (actualQty > 0) {
          const inventoryClass = resolveInventoryClass(gradeCode);
          // INV-401：采购入库计价——PURCHASE 从 wms_inbound_items.unit_cost
          // （基线建表列 DECIMAL(18,4) DEFAULT 0）取收货单价；其余入库类型按 0
          // （与列默认一致，语义不变）。to_jsonb 投影缺列/NULL 环境安全回退 0。
          const purchaseUnitCost = String(task.type ?? '').toUpperCase() === 'PURCHASE'
            ? Math.max(0, Number(savedLine?.unit_cost) || 0)
            : 0;
          const posted = await manager.query(
          `INSERT INTO inv_batches (
             batch_no, product_code, sku_code, material_code, item_type, material_type,
             unit, qty, qty_available, status, inventory_class, warehouse_code, location_code, store_code, company_code, inbound_date, grade_code_std, spec_code, base_quantity_version, variety_code, source_profile_code, source_profile_snapshot, unit_cost
           )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $8::numeric, 'AVAILABLE', $18, $9, $10, $11, $12, $13::date,$14,$15,$16,$17,NULL,NULL,$19::numeric)
             ON CONFLICT (batch_no) DO UPDATE SET
               product_code = COALESCE(inv_batches.product_code, EXCLUDED.product_code),
               sku_code = COALESCE(inv_batches.sku_code, EXCLUDED.sku_code),
               material_code = COALESCE(inv_batches.material_code, EXCLUDED.material_code),
               item_type = COALESCE(inv_batches.item_type, EXCLUDED.item_type),
               material_type = COALESCE(inv_batches.material_type, EXCLUDED.material_type),
               unit = COALESCE(inv_batches.unit, EXCLUDED.unit),
               company_code = CASE WHEN inv_batches.company_code IS NULL OR inv_batches.company_code = 'ALL'
                                   THEN EXCLUDED.company_code ELSE inv_batches.company_code END,
               inbound_date = CASE
                 WHEN inv_batches.inbound_date IS NULL THEN EXCLUDED.inbound_date
                 WHEN EXCLUDED.inbound_date IS NULL THEN inv_batches.inbound_date
                 ELSE LEAST(inv_batches.inbound_date, EXCLUDED.inbound_date)
               END,
               qty = inv_batches.qty + EXCLUDED.qty,
               qty_available = COALESCE(inv_batches.qty_available, inv_batches.qty) + EXCLUDED.qty,
               inventory_class = COALESCE(inv_batches.inventory_class, EXCLUDED.inventory_class),
               unit_cost = CASE WHEN inv_batches.unit_cost > 0 THEN inv_batches.unit_cost ELSE EXCLUDED.unit_cost END,
               updated_at = now()
              WHERE inv_batches.warehouse_code IS NOT DISTINCT FROM EXCLUDED.warehouse_code
                AND (inv_batches.company_code IS NULL OR inv_batches.company_code = 'ALL' OR inv_batches.company_code = EXCLUDED.company_code)
                AND inv_batches.sku_code IS NOT DISTINCT FROM EXCLUDED.sku_code
                AND inv_batches.variety_code IS NOT DISTINCT FROM EXCLUDED.variety_code
                AND inv_batches.source_profile_code IS NOT DISTINCT FROM EXCLUDED.source_profile_code
                AND inv_batches.source_profile_snapshot IS NOT DISTINCT FROM EXCLUDED.source_profile_snapshot
                AND inv_batches.material_code IS NOT DISTINCT FROM EXCLUDED.material_code
                AND inv_batches.product_code IS NOT DISTINCT FROM EXCLUDED.product_code
                AND inv_batches.item_type IS NOT DISTINCT FROM EXCLUDED.item_type
                AND inv_batches.unit IS NOT DISTINCT FROM EXCLUDED.unit
              RETURNING batch_no`,
            [baseBatchNo, productCode, skuCode, materialCode, itemType, materialType, unit, actualQty, warehouseCode, locationCode, storeCode, companyCode, task.date || null, snapshot?.gradeCode ?? gradeCode ?? null, snapshot?.specCode ?? null, snapshot ? 1 : null, varietyCode, inventoryClass, purchaseUnitCost],
          );
          if (posted.length !== 1) throw new BadRequestException('入库批次归属或身份已变化，禁止跨公司累加');
        // INV-301a：统一共享写入器（旧手写 SQL 占位符乱序：$1,$11,$2,...）
          await writeInvLedger(manager, {
            batchNo: baseBatchNo,
            changeType: inboundPolicy.ledgerType,
            qtyChange: actualQty,
            operator,
            storeCode,
            refNo: task_no,
            note: `入库确认 product=${productCode || '-'} sku=${skuCode || '-'} material=${materialCode || '-'} actual=${actualQty} warehouse=${warehouseCode}`,
            skuCode: skuCode ?? null,
            materialCode: materialCode ?? null,
            warehouseCode,
            businessType: inboundPolicy.businessType,
            unit: unit ?? null,
            companyCode,
          });
        }

        // 破损蛋按批准口径进入 DEFECT_SALE，沿用普通养鸡场销售流程。
        if (brokenQty > 0) {
          const brokenBatchNo = `${baseBatchNo}-BROKEN`;
          const [brokenExisting] = await manager.query('SELECT * FROM inv_batches WHERE batch_no=$1 FOR UPDATE',[brokenBatchNo]);
          if (brokenExisting) {
            for (const [key,expected] of Object.entries({ product_code:productCode,sku_code:skuCode,material_code:materialCode,item_type:itemType,variety_code:varietyCode,source_profile_code:null,source_profile_snapshot:null,unit,warehouse_code:warehouseCode,company_code:companyCode })) {
              if ((brokenExisting[key] ?? null)!==(expected ?? null)) throw new BadRequestException('破损批次身份与入库品目不一致，禁止跨域累加');
            }
          }
          const posted = await manager.query(
            `INSERT INTO inv_batches (
               batch_no, product_code, sku_code, material_code, item_type, material_type,
               unit, qty, qty_available, status, quality_grade, grade_code_std, inventory_class, warehouse_code, location_code, store_code, company_code, inbound_date, spec_code, base_quantity_version, variety_code, source_profile_code, source_profile_snapshot
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $8::numeric, 'AVAILABLE', 'BROKEN', 'BROKEN', 'DEFECT_SALE', $9, $10, $11, $12, $13::date,$14,$15,$16,NULL,NULL)
             ON CONFLICT (batch_no) DO UPDATE SET
               product_code = COALESCE(inv_batches.product_code, EXCLUDED.product_code),
               sku_code = COALESCE(inv_batches.sku_code, EXCLUDED.sku_code),
               material_code = COALESCE(inv_batches.material_code, EXCLUDED.material_code),
               item_type = COALESCE(inv_batches.item_type, EXCLUDED.item_type),
               material_type = COALESCE(inv_batches.material_type, EXCLUDED.material_type),
               unit = COALESCE(inv_batches.unit, EXCLUDED.unit),
               company_code = CASE WHEN inv_batches.company_code IS NULL OR inv_batches.company_code = 'ALL'
                                   THEN EXCLUDED.company_code ELSE inv_batches.company_code END,
               inbound_date = CASE
                 WHEN inv_batches.inbound_date IS NULL THEN EXCLUDED.inbound_date
                 WHEN EXCLUDED.inbound_date IS NULL THEN inv_batches.inbound_date
                 ELSE LEAST(inv_batches.inbound_date, EXCLUDED.inbound_date)
               END,
               qty = inv_batches.qty + EXCLUDED.qty,
               qty_available = COALESCE(inv_batches.qty_available, inv_batches.qty) + EXCLUDED.qty,
               quality_grade = 'BROKEN',
               grade_code_std = 'BROKEN',
               inventory_class = 'DEFECT_SALE',
               status = 'AVAILABLE',
               updated_at = now()
              WHERE inv_batches.warehouse_code IS NOT DISTINCT FROM EXCLUDED.warehouse_code
                AND (inv_batches.company_code IS NULL OR inv_batches.company_code = 'ALL' OR inv_batches.company_code = EXCLUDED.company_code)
                AND inv_batches.sku_code IS NOT DISTINCT FROM EXCLUDED.sku_code
                AND inv_batches.variety_code IS NOT DISTINCT FROM EXCLUDED.variety_code
                AND inv_batches.source_profile_code IS NOT DISTINCT FROM EXCLUDED.source_profile_code
                AND inv_batches.source_profile_snapshot IS NOT DISTINCT FROM EXCLUDED.source_profile_snapshot
                AND inv_batches.material_code IS NOT DISTINCT FROM EXCLUDED.material_code
                AND inv_batches.product_code IS NOT DISTINCT FROM EXCLUDED.product_code
                AND inv_batches.item_type IS NOT DISTINCT FROM EXCLUDED.item_type
                AND inv_batches.unit IS NOT DISTINCT FROM EXCLUDED.unit
              RETURNING batch_no`,
            [brokenBatchNo, productCode, skuCode, materialCode, itemType, materialType, unit, brokenQty, warehouseCode, 'QUARANTINE-DOCK', storeCode, companyCode, task.date || null, snapshot?.specCode ?? null, snapshot ? 1 : null, varietyCode],
          );
          if (posted.length !== 1) throw new BadRequestException('入库批次归属或身份已变化，禁止跨公司累加');
          // INV-301a：统一共享写入器
          await writeInvLedger(manager, {
            batchNo: brokenBatchNo,
            changeType: INV_LEDGER_CHANGE_TYPE.INBOUND_BROKEN,
            qtyChange: brokenQty,
            operator,
            storeCode,
            refNo: task_no,
            note: `破损入隔离 product=${productCode || '-'} sku=${skuCode || '-'} material=${materialCode || '-'} broken=${brokenQty}`,
            skuCode: skuCode ?? null,
            materialCode: materialCode ?? null,
            warehouseCode,
            businessType: `${inboundPolicy.businessType}_BROKEN`,
            unit: unit ?? null,
            companyCode,
          });
        }
      }
      await manager.query(
        `UPDATE wms_inbound SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE task_no = $1`,
        [task_no],
      );
      return { code: 200, msg: '入库确认成功', data: { task_no, status: 'COMPLETED' } };
    };
    return managerOverride ? execute(managerOverride) : this.em.transaction(execute);
  }

  /**
   * G84 采购收货入库 — 供采购模块在其「收货确认」事务内调用，统一写 inv_batches/inv_ledger。
   * 守护：库存唯一写入口（CLAUDE.md #6）；批次状态 AVAILABLE 取自 INV_STOCK_STATUS（#7）。
   * 与调用方同一事务（传入 manager），保证收货确认与库存入账原子一致。
   * 数量保留最多三位小数；物料/SKU 身份从统一主数据解析。
   */
  async inboundFromReceipt(
    manager: EntityManager,
    ctx: {
      refNo: string;             // 收货单号（→ inv_ledger.ref_no 可追溯）
      warehouseCode?: string;
      storeCode?: string;
      operator?: string;
      inboundDate?: string | null;
      items: {
        receiptItemId?:string;unit?:string;
        itemCode?: string;
        itemType?: string;
        productCode?: string;
        skuCode?: string;
        qty: number;
        batchNo?: string;
        locationCode?: string;
        /**
         * INV-401 批次单位成本（采购收货单明细单价，>=0）。可选——调用方无
         * 可靠单价来源时不传，批次按 0 挂账（与列默认一致）。
         */
        unitCost?: number;
      }[];
    },
  ): Promise<{ batchNos: string[]; skipped: number }> {
    await lockTempProductionReferences(manager, ctx.items.map(item => item.batchNo));
    const purchasePolicy = resolveInboundPolicy('PURCHASE');
    const workflowErrors = validateInboundWorkflow('PURCHASE', 'PURCHASE_RECEIPT');
    if (!purchasePolicy || workflowErrors.length > 0) {
      throw new BadRequestException({
        code: 400,
        msg: '采购收货入库策略不可用',
        errors: workflowErrors,
      });
    }
    const storeCode = ctx.storeCode || 'ALL';
    const operator = ctx.operator || 'SYS';
    const warehouseCode = ctx.warehouseCode || 'WMS-VTE-MAIN';
    await this.assertPurchaseReceiptWarehouseUsage(manager, warehouseCode);
    await this.assertWritableWarehouse(warehouseCode, `采购收货 ${ctx.refNo}`);
    const companyCode = await this.lockWarehouseCompany(manager, warehouseCode);
    const batchNos: string[] = [];
    let skipped = 0;
    for (let idx = 0; idx < ctx.items.length; idx++) {
      const it = ctx.items[idx];
      const qty = Number(it.qty) || 0;
      const suppliedCode = SkuPolicy.optionalCode(it.skuCode)
        ?? (this.nonEmptyString(it.itemCode) || this.nonEmptyString(it.productCode));
      if (qty <= 0 || !suppliedCode) { skipped++; continue; }
      if (Math.abs(Math.round(qty * 1000) - qty * 1000) > 1e-7) {
        throw new BadRequestException(`采购收货 ${ctx.refNo} 的数量最多保留 3 位小数`);
      }
      const identity = await this.resolveInventoryItem(
        manager,
        suppliedCode,
        it.skuCode !== undefined ? 'SKU' : this.nonEmptyString(it.itemType),
        companyCode,
      );
      const productCode = identity.productCode;
      const skuCode = identity.skuCode;
      const inventoryClass = resolveInventoryClass(identity.gradeCode);
      const batchNo = (it.batchNo || (it.receiptItemId?purchaseReceiptBatchNo(ctx.refNo,it.receiptItemId):`${ctx.refNo}-${String(idx + 1).padStart(3, '0')}`)).slice(0,64);
      const locationCode = (it.locationCode || 'INBOUND-DOCK').slice(0, 64);
      // INV-401：采购收货计价（非法/负数单价安全回退 0，不阻断收货）
      const receiptUnitCost = Number.isFinite(Number(it.unitCost)) && Number(it.unitCost) >= 0
        ? Number(it.unitCost)
        : 0;
      const [existing] = await manager.query('SELECT * FROM inv_batches WHERE batch_no=$1 FOR UPDATE', [batchNo]);
      await assertTempProductionReferenceAllowed(manager, [batchNo]);
      if (existing) {
        this.assertBatchCompany(existing, companyCode);
        for (const [key, expected] of Object.entries({ warehouse_code: warehouseCode, sku_code: skuCode, product_code: productCode, material_code: identity.materialCode, item_type: identity.itemType, variety_code: identity.varietyCode, source_profile_code: null, source_profile_snapshot: null, unit: identity.unit })) {
          if ((existing[key] ?? null) !== (expected ?? null)) throw new BadRequestException('采购批次身份与入库不一致');
        }
      }
      await qualifyPurchaseInventory(manager,{batchNo,companyCode,warehouseCode,productCode,skuCode,receiptNo:ctx.refNo,
        receiptItemId:it.receiptItemId,itemCode:suppliedCode,quantity:qty,unitCost:receiptUnitCost,actor:operator,baseUnit:identity.unit});
      const posted = await manager.query(
        `INSERT INTO inv_batches (
           batch_no, product_code, sku_code, material_code, item_type, material_type,
           unit, qty, qty_available, status, inventory_class, warehouse_code, location_code, store_code, inbound_date, company_code, variety_code, source_profile_code, source_profile_snapshot, unit_cost,source_type,source_no,grade_code_std,spec_code,base_quantity_version
         )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $8::numeric, 'AVAILABLE', $15, $9, $10, $11, $12::date, $13, $14, NULL, NULL, $16::numeric,'PURCHASE',$17,$18,$19,$20)
         ON CONFLICT (batch_no) DO UPDATE SET
           product_code = COALESCE(inv_batches.product_code, EXCLUDED.product_code),
           sku_code = COALESCE(inv_batches.sku_code, EXCLUDED.sku_code),
           material_code = COALESCE(inv_batches.material_code, EXCLUDED.material_code),
           item_type = COALESCE(inv_batches.item_type, EXCLUDED.item_type),
           material_type = COALESCE(inv_batches.material_type, EXCLUDED.material_type),
           unit = COALESCE(inv_batches.unit, EXCLUDED.unit),
           company_code = COALESCE(NULLIF(inv_batches.company_code, 'ALL'), EXCLUDED.company_code),
           inbound_date = CASE
             WHEN inv_batches.inbound_date IS NULL THEN EXCLUDED.inbound_date
             WHEN EXCLUDED.inbound_date IS NULL THEN inv_batches.inbound_date
             ELSE LEAST(inv_batches.inbound_date, EXCLUDED.inbound_date)
           END,
           qty = inv_batches.qty + EXCLUDED.qty,
           qty_available = COALESCE(inv_batches.qty_available, inv_batches.qty) + EXCLUDED.qty,
           inventory_class = COALESCE(inv_batches.inventory_class, EXCLUDED.inventory_class),
           unit_cost = CASE WHEN inv_batches.unit_cost > 0 THEN inv_batches.unit_cost ELSE EXCLUDED.unit_cost END,
           updated_at = now()
              WHERE inv_batches.warehouse_code IS NOT DISTINCT FROM EXCLUDED.warehouse_code
                AND (inv_batches.company_code IS NULL OR inv_batches.company_code = 'ALL' OR inv_batches.company_code = EXCLUDED.company_code)
                AND inv_batches.sku_code IS NOT DISTINCT FROM EXCLUDED.sku_code
                AND inv_batches.variety_code IS NOT DISTINCT FROM EXCLUDED.variety_code
                AND inv_batches.source_profile_code IS NOT DISTINCT FROM EXCLUDED.source_profile_code
                AND inv_batches.source_profile_snapshot IS NOT DISTINCT FROM EXCLUDED.source_profile_snapshot
                AND inv_batches.material_code IS NOT DISTINCT FROM EXCLUDED.material_code
                AND inv_batches.product_code IS NOT DISTINCT FROM EXCLUDED.product_code
                AND inv_batches.item_type IS NOT DISTINCT FROM EXCLUDED.item_type
                AND inv_batches.unit IS NOT DISTINCT FROM EXCLUDED.unit
              RETURNING batch_no`,
        [
          batchNo, productCode, skuCode, identity.materialCode, identity.itemType,
          identity.materialType, identity.unit, qty, warehouseCode, locationCode, storeCode, ctx.inboundDate || null, companyCode, identity.varietyCode, inventoryClass, receiptUnitCost,ctx.refNo,
          it.unit===identity.unit&&identity.itemType==='SKU'?identity.gradeCode:null,it.unit===identity.unit&&identity.itemType==='SKU'?identity.specCode:null,
          it.unit===identity.unit&&identity.itemType==='SKU'?1:null,
        ],
      );
      if (posted.length !== 1) throw new BadRequestException('入库批次归属或身份已变化，禁止跨公司累加');
      // INV-301a：统一共享写入器（旧手写 SQL 占位符乱序：$1,$11,$2,...）
      await writeInvLedger(manager, {
        batchNo,
        changeType: purchasePolicy.ledgerType,
        qtyChange: qty,
        operator,
        storeCode,
        refNo: ctx.refNo,
        note: `采购收货入库 item=${identity.itemCode} type=${identity.itemType} qty=${qty} wh=${warehouseCode}`,
        skuCode: skuCode ?? null,
        materialCode: identity.materialCode ?? null,
        warehouseCode,
        businessType: purchasePolicy.businessType,
        unit: identity.unit ?? null,
        companyCode,
      });
      batchNos.push(batchNo);
    }
    return { batchNos, skipped };
  }

  // ─── 出库 (Outbound) ────────────────────────────────────────────────────────
  async getOutboundDashboard() {
    try {
      const scope = this.orderStoreScope('store_code', 0);
      const [pending] = await this.em.query(
        `SELECT COUNT(*) as count FROM ord_orders WHERE status = 'approved' AND ${scope.sql}`,
        scope.params,
      );
      const [allocated] = await this.em.query(
        `SELECT COUNT(*) as count FROM ord_orders WHERE status = 'allocated' AND ${scope.sql}`,
        scope.params,
      );
      return {
        code: 200,
        data: { pending: parseInt(pending.count), allocated: parseInt(allocated.count), shipped_today: 0 },
      };
    } catch (e) {
      this.logger.error(`getOutboundDashboard 看板查询失败，降级返回空数据: ${(e as Error).message}`);
      return { code: 200, data: { pending: 0, allocated: 0, shipped_today: 0 } };
    }
  }

  async getPendingOutbound() {
    try {
      const scope = this.orderStoreScope('o.store_code', 0);
      const data = await this.em.query(
        `SELECT o.*,
                COALESCE(c.customer_name, o.customer_name, o.customer_code) AS customer_name,
                c.customer_name_en, c.customer_name_lo
           FROM ord_orders o
           LEFT JOIN sal_customers c ON c.customer_no = o.customer_code
          WHERE o.status IN ('approved', 'locked', 'allocated') AND ${scope.sql}
          ORDER BY o.created_at DESC, o.id DESC`,
        scope.params,
      );
      return { code: 200, data };
    } catch (e) {
      this.logger.error(`getPendingOutbound 查询失败，降级返回空列表: ${(e as Error).message}`);
      return { code: 200, data: [] };
    }
  }

  async getOutboundOrder(orderNo: string) {
    try {
      const scope = this.orderStoreScope('o.store_code', 1);
      const orders = await this.em.query(
        `SELECT o.*,
                COALESCE(c.customer_name, o.customer_name, o.customer_code) AS customer_name,
                c.customer_name_en, c.customer_name_lo
           FROM ord_orders o
           LEFT JOIN sal_customers c ON c.customer_no = o.customer_code
          WHERE o.order_no = $1 AND ${scope.sql}`,
        [orderNo, ...scope.params],
      );
      if (!orders.length) return { code: 404, msg: '订单不存在' };
      const items = await this.em.query(
        `SELECT oi.*, oi.id AS line_no,
                COALESCE(p.product_name_zh, oi.product_name_zh) AS product_name,
                p.product_name_zh, p.product_name_en, p.product_name_lo
           FROM ord_order_items oi
           LEFT JOIN mst_products p ON p.product_code = oi.product_code
          WHERE oi.order_no = $1
          ORDER BY oi.id`,
        [orderNo],
      );
      return { code: 200, data: { ...orders[0], items } };
    } catch (e: any) {
      return { code: 500, msg: e.message };
    }
  }

  /**
   * 出库单状态推进 — V3 真实实现
   *
   * A1 心脏修复：出库时按 batch 扣减 inv_batches.qty + 写 inv_ledger OUTBOUND 流水
   * 状态机：approved → locked → allocated → shipped → delivered
   * body: { next_status, items?: [{batch_no?, sku_code?, product_code?, qty}] }
   */
  async advanceOutboundOrder(orderNo: string, body: any, user: any) {
    // 统一 UPPER 状态枚举 (与 order.service VALID_TRANSITIONS 对齐)
    const nextStatus = String(body?.next_status || 'allocated').toUpperCase();
    const items: Array<{ batch_no?: string; sku_code?: string; product_code?: string; qty: number }> = Array.isArray(body?.items) ? body.items : [];

    return await this.em.transaction(async (manager) => {
      const scope = this.orderStoreScope('store_code', 1);
      const ords = await manager.query(
        `SELECT order_no, status, store_code FROM ord_orders WHERE order_no = $1 AND ${scope.sql} FOR UPDATE`,
        [orderNo, ...scope.params],
      );
      if (!ords.length) return { code: 404, msg: '订单不存在' };
      const order = ords[0];
      if (String(order.status).toUpperCase() === nextStatus) return { code: 200, msg: `状态已为 ${nextStatus}`, idempotent: true };
      if (['SHIPPED', 'RECEIVED', 'DELIVERED', 'COMPLETED', 'CANCELLED'].includes(String(order.status).toUpperCase())) throw new BadRequestException('已发运或结束订单不得重复出库');

      await manager.query(
        `UPDATE ord_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_no = $2`,
        [nextStatus, orderNo],
      );

      // 推进到 shipped 时按 batch 扣减
      if (nextStatus === 'SHIPPED' && items.length > 0) {
        for (const it of items) {
          const qty = Number(it.qty) || 0;
          if (qty <= 0) continue;

          const batchNo = this.nonEmptyString(it.batch_no);
          const skuCode = SkuPolicy.optionalCode(it.sku_code);
          const productCode = this.nonEmptyString(it.product_code);
          if (batchNo) {
            const [batch] = await manager.query(
              `SELECT batch_no, product_code, sku_code, qty, qty_available, warehouse_code, store_code, company_code
                 FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
              [batchNo],
            );
            if (!batch) {
              throw new Error(`batch ${batchNo} 不存在`);
            }
            if (skuCode && batch.sku_code !== skuCode) throw new BadRequestException('出库批次与请求 SKU 不一致');
            await this.deductOutboundBatch(manager, batch, qty, orderNo, order, user, nextStatus);
            continue;
          }

          if (skuCode) {
            await this.deductOutboundBySelector(manager, 'sku_code', skuCode, qty, orderNo, order, user, nextStatus);
            continue;
          }

          if (productCode) {
            await this.deductOutboundBySelector(manager, 'product_code', productCode, qty, orderNo, order, user, nextStatus);
          }
        }
      }

      return { code: 200, msg: `状态推进至 ${nextStatus}` };
    });
  }

  /**
   * 确认独立出库单。
   *
   * wms_outbound 是仓储页面的单据表，不能通过通用 CRUD 直接把状态改为 DONE。
   * 只有库存批次扣减和 inv_ledger 流水都成功后，事务才会提交 DONE。
   */
  /** 批量创建独立出库单，单批次失败会回滚整批。 */
  async createBatchStandaloneOutbound(body: any, user: any) {
    const documents = Array.isArray(body?.documents) ? body.documents
      : Array.isArray(body?.orders) ? body.orders
      : body?.header && Array.isArray(body?.items) ? [{ ...body.header, items: body.items }]
      : Array.isArray(body?.items) ? [body] : [];
    if (!documents.length) throw new BadRequestException('documents 必须至少包含一条出库单');
    return this.em.transaction(async manager => {
      await lockTempProductionReferences(manager, documents.flatMap((doc: any) => [doc?.batch_no, ...(Array.isArray(doc?.items) ? doc.items.map((item: any) => item?.batch_no) : [])]));
      const created: any[] = [];
      for (const [index, doc] of documents.entries()) {
        const outboundNo = this.nonEmptyString(doc?.outbound_no);
        if (!outboundNo) throw new BadRequestException(`第 ${index + 1} 张出库单 outbound_no 必填`);
        this.assertOutboundPermission(doc?.type, user, 'C');
        const lines = Array.isArray(doc?.items) ? doc.items : [doc];
        const totalQty = lines.reduce((sum: number, line: any) => sum + (Number(line?.qty) || 0), 0);
        const validationDoc = { ...doc, item: doc?.item || lines[0]?.item || lines[0]?.product_code || lines[0]?.sku_code || lines[0]?.material_code, qty: doc?.qty ?? totalQty };
        this.validateStandaloneOutbound(validationDoc);
        const warehouseCode = this.nonEmptyString(doc?.warehouse_code);
        await this.assertWritableWarehouse(warehouseCode, `出库单 ${outboundNo}`);
        await this.assertActiveScopedDestination(doc);
        const existing = await manager.query('SELECT outbound_no,status FROM wms_outbound WHERE outbound_no=$1 FOR UPDATE', [outboundNo]);
        if (existing.length) {
          if (String(existing[0].status).toUpperCase() !== 'PENDING') throw new BadRequestException(`出库单 ${outboundNo} 已存在且状态不可幂等创建`);
          created.push({ outbound_no: outboundNo, status: 'PENDING', idempotent: true });
          continue;
        }
        const companyCode = await this.lockWarehouseCompany(manager, warehouseCode!, doc?.company_code);
        const firstLine = lines[0];
        const headerSku = SkuPolicy.optionalCode(doc?.sku_code) ?? SkuPolicy.optionalCode(firstLine?.sku_code);
        const identity = await this.resolveInventoryItem(
          manager,
          headerSku ?? this.nonEmptyString(doc?.item || firstLine?.item || firstLine?.product_code || firstLine?.material_code),
          headerSku ? 'SKU' : this.nonEmptyString(doc?.item_type || firstLine?.item_type),
          companyCode,
          this.outboundSkuUsage(doc?.type),
        );
        const destinationCode = resolveOutboundDestinationCode(doc);
        const rows = await manager.query(
          `INSERT INTO wms_outbound (outbound_no,date,type,warehouse_code,item,qty,status,destination_type,destination_code,store_code,operator,ref_no,order_no,remark,company_code,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6::numeric,'PENDING',$7,$8,$9,$10,$11,$12,$13,$14,now(),now()) RETURNING *`,
          [outboundNo, doc?.date || new Date().toISOString().slice(0, 10), String(doc?.type).toUpperCase(), warehouseCode,
            identity.itemCode, totalQty, String(doc?.destination_type).toUpperCase(), destinationCode,
            this.nonEmptyString(doc?.store_code) || 'ALL', String(user?.username || user?.userId || 'SYS'), this.nonEmptyString(doc?.ref_no),
            this.nonEmptyString(doc?.order_no), this.nonEmptyString(doc?.remark), companyCode],
        );
        for (const line of lines) {
          const lineQty = Number(line?.qty);
          if (!Number.isFinite(lineQty) || lineQty <= 0) throw new BadRequestException(`出库单 ${outboundNo} 明细数量必须大于 0`);
          const lineSku = SkuPolicy.optionalCode(line?.sku_code);
          const lineIdentity = await this.resolveInventoryItem(manager, lineSku ?? this.nonEmptyString(line?.item || line?.product_code || line?.material_code), lineSku ? 'SKU' : this.nonEmptyString(line?.item_type), companyCode, this.outboundSkuUsage(doc?.type));
          const quantitySnapshot = await resolveQuantity(manager, { qty: lineQty, skuCode: lineIdentity.skuCode ?? undefined, quantityBasis: line.quantityBasis });
          await manager.query(
            `INSERT INTO wms_outbound_items (outbound_no,product_code,batch_no,qty,actual_qty,quantity_snapshot)
             VALUES ($1,$2,$3,$4::numeric,0,$5::jsonb)`,
            [outboundNo, lineIdentity.skuCode || lineIdentity.materialCode || lineIdentity.productCode, this.nonEmptyString(line?.batch_no), lineQty, quantitySnapshot == null ? null : JSON.stringify(quantitySnapshot)],
          );
        }
        created.push({ ...rows[0], idempotent: false });
      }
      return { code: 200, msg: '批量出库单创建成功', data: created };
    });
  }

  /** 批量确认独立出库；复用单据确认的扣库存与流水逻辑。 */
  async confirmBatchStandaloneOutbound(body: any, user: any) {
    const documents = Array.isArray(body?.documents) ? body.documents
      : Array.isArray(body?.orders) ? body.orders
      : body?.header && Array.isArray(body?.items) ? [{ ...body.header, items: body.items }]
      : Array.isArray(body?.items) ? [body] : [];
    const outboundNos = documents.map((doc: any) => this.nonEmptyString(doc?.outbound_no || doc)).filter(Boolean) as string[];
    if (!outboundNos.length) throw new BadRequestException('documents 必须至少包含一条出库确认');
    if (new Set(outboundNos).size !== outboundNos.length) throw new BadRequestException('批量确认中 outbound_no 不得重复');
    return this.em.transaction(async manager => {
      const results: any[] = [];
      for (const outboundNo of outboundNos) {
        const [order] = await manager.query(
          `SELECT * FROM wms_outbound WHERE outbound_no = $1 FOR UPDATE`,
          [outboundNo],
        );
        if (!order) throw new BadRequestException(`出库单 ${outboundNo} 不存在`);
        this.assertOutboundPermission(order.type, user, 'E');
        const status = String(order.status || 'PENDING').toUpperCase();
        if (status === 'DONE') {
          results.push({ code: 200, idempotent: true, data: { outbound_no: outboundNo, status: 'DONE' } });
          continue;
        }
        if (!['PENDING', 'PICKING'].includes(status)) {
          throw new BadRequestException(`出库单 ${outboundNo} 当前状态 ${status} 不允许确认`);
        }
        await this.assertWritableWarehouse(order.warehouse_code, `出库单 ${outboundNo}`);
        const lines = await manager.query(
          `SELECT id, product_code, batch_no, qty, quantity_snapshot FROM wms_outbound_items WHERE outbound_no = $1 ORDER BY id ASC FOR UPDATE`,
          [outboundNo],
        );
        if (!lines.length) {
          results.push(await this.confirmStandaloneOutbound(outboundNo, user, manager));
          continue;
        }
        order.company_code = await this.lockWarehouseCompany(manager, order.warehouse_code, order.company_code);
        await lockQuantityPools(manager,lines.map((line: any) => ({ company: order.company_code, warehouses: [order.warehouse_code], snapshot: line.quantity_snapshot })));
        let totalQty = 0;
        for (const line of lines.sort((a: any,b: any) => String(a.product_code).localeCompare(String(b.product_code)) || String(a.batch_no).localeCompare(String(b.batch_no)) || Number(a.id)-Number(b.id))) {
          const qty = savedQuantity(line);
          if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException(`出库单 ${outboundNo} 明细数量必须大于 0`);
          if (line.quantity_snapshot && line.product_code!==line.quantity_snapshot.skuCode) throw new BadRequestException('出库明细 SKU 与服务器计量记录不一致');
          const lineIdentity = await this.resolveInventoryItem(manager, line.product_code, line.quantity_snapshot ? 'SKU' : null, order.company_code, this.outboundSkuUsage(order.type));
          const lineOrder = { ...order, item: line.product_code, item_type: lineIdentity.itemType, qty, batch_no: line.batch_no, quantity_snapshot: line.quantity_snapshot };
          if (line.quantity_snapshot) await SkuPolicy.requireUsable(manager,line.quantity_snapshot.skuCode,this.outboundSkuUsage(order.type),order.company_code);
          if (line.quantity_snapshot) await lockQuantityPools(manager,[{ company: order.company_code, warehouses: [order.warehouse_code], snapshot: line.quantity_snapshot }]);
          const batchNo = this.nonEmptyString(line.batch_no);
          if (batchNo) {
            const [batch] = await manager.query(
              `SELECT batch_no, product_code, sku_code, material_code, item_type, material_type, unit, grade_code_std, spec_code, legacy_source, base_quantity_version, inventory_class, qty, qty_available, warehouse_code, store_code, company_code
                 FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
              [batchNo],
            );
            if (!batch) throw new BadRequestException(`库存批次 ${batchNo} 不存在`);
            if (line.quantity_snapshot) assertBatchPool(batch,line.quantity_snapshot);
            if (batch.warehouse_code !== order.warehouse_code) throw new BadRequestException(`库存批次 ${batchNo} 与出库仓库不一致`);
            await this.deductOutboundBatch(manager, batch, qty, outboundNo, lineOrder, user, 'DONE');
          } else {
            await this.deductStandaloneOutboundByItem(manager, String(line.product_code || ''), qty, outboundNo, lineOrder, user);
          }
          await manager.query(`UPDATE wms_outbound_items SET actual_qty = $1::numeric WHERE id = $2`, [qty, line.id]);
          totalQty += qty;
        }
        await manager.query(`UPDATE wms_outbound SET status = 'DONE', qty = $1::numeric, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [totalQty, order.id]);
        results.push({ code: 200, msg: '出库确认成功，库存与台账已同步扣减', data: { outbound_no: outboundNo, status: 'DONE', qty: totalQty } });
      }
      return { code: 200, msg: '批量出库确认成功', data: results };
    });
  }

  async createStandaloneOutbound(body: any, user: any) {
    this.assertOutboundPermission(body?.type, user, 'C');
    this.validateStandaloneOutbound(body);
    const warehouseCode = this.nonEmptyString(body?.warehouse_code);
    await this.assertWritableWarehouse(warehouseCode, '出库单');
    await this.assertActiveScopedDestination(body);

    return this.em.transaction(async manager => {
      await lockTempProductionReferences(manager, [body?.batch_no]);
      const companyCode = await this.lockWarehouseCompany(manager, warehouseCode!, body?.company_code);
      const createSku = SkuPolicy.optionalCode(body?.sku_code);
      const identity = await this.resolveInventoryItem(
        manager,
        createSku ?? this.nonEmptyString(body?.item),
        createSku ? 'SKU' : this.nonEmptyString(body?.item_type),
        companyCode,
        this.outboundSkuUsage(body?.type),
      );
      this.validateStandaloneOutbound({
        ...body,
        item: identity.itemCode,
        item_type: identity.itemType,
        material_type: identity.materialType,
      });
      const outboundNo = this.nonEmptyString(body?.outbound_no)
        || `WO-${Date.now().toString().slice(-10)}`;
      const quantitySnapshot = await resolveQuantity(manager, { qty: Number(body.qty), skuCode: identity.skuCode ?? undefined, quantityBasis: body.quantityBasis });
      const destinationCode = resolveOutboundDestinationCode(body);
      const rows = await manager.query(
        `INSERT INTO wms_outbound (
           outbound_no, date, type, warehouse_code, item, item_name, item_type,
           material_type, material_code, sku_code, unit, batch_no, qty, status,
           destination_type, destination_code, destination_house_code,
           destination_customer_code, destination_warehouse_code, destination_store_code,
           department_code, project_code, receiver_username, purpose_code,
           picker, operator, ref_no, order_no, remark, attachment_url,
           site_code, company_code, store_code, quantity_snapshot, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::numeric,'PENDING',
           $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
           $30,$31,$32,$33::jsonb,now(),now()
         )
         RETURNING *`,
        [
          outboundNo,
          body?.date || new Date().toISOString().slice(0, 10),
          String(body.type).toUpperCase(),
          warehouseCode,
          identity.itemCode,
          identity.itemName,
          identity.itemType,
          identity.materialType,
          identity.materialCode,
          identity.skuCode,
          identity.unit,
          this.nonEmptyString(body?.batch_no),
          Number(body.qty),
          String(body.destination_type).toUpperCase(),
          destinationCode,
          this.nonEmptyString(body?.destination_house_code),
          this.nonEmptyString(body?.destination_customer_code),
          this.nonEmptyString(body?.destination_warehouse_code),
          this.nonEmptyString(body?.destination_store_code),
          this.nonEmptyString(body?.department_code),
          this.nonEmptyString(body?.project_code),
          this.nonEmptyString(body?.receiver_username),
          this.nonEmptyString(body?.purpose_code),
          this.nonEmptyString(body?.picker),
          String(user?.username || user?.userId || body?.operator || 'SYS'),
          this.nonEmptyString(body?.ref_no),
          this.nonEmptyString(body?.order_no),
          this.nonEmptyString(body?.remark),
          this.nonEmptyString(body?.attachment_url),
          this.nonEmptyString(body?.site_code),
          companyCode,
          this.nonEmptyString(body?.store_code) || 'ALL',
          quantitySnapshot == null ? null : JSON.stringify(quantitySnapshot),
        ],
      );
      return { code: 200, msg: '出库单已创建，待确认扣减库存', data: rows[0] };
    });
  }

  /**
   * Internal handling of non-saleable egg grades. The disposition envelope is
   * persisted before the inventory mutation so retries with the same number are
   * idempotent, while the batch and both ledger legs stay in one transaction.
   */
  async disposeDefectInventory(body: any, user: any) {
    this.assertDefectDispositionPermission(user);
    const errors = validateDefectDisposition(body || {});
    if (errors.length) throw new BadRequestException({ code: 400, msg: '缺陷库存处置校验失败', errors });

    const dispositionNo = this.nonEmptyString(body?.disposition_no || body?.idempotency_key)!;
    const batchNo = this.nonEmptyString(body?.batch_no)!;
    const action = normalizeDefectDispositionAction(body?.action)!;
    const requestedQty = Number(body?.qty);
    const reason = String(body?.reason).trim();

    return this.em.transaction(async manager => {
      const [prior] = await manager.query(
        `SELECT disposition_no,status,batch_no,qty,action FROM wms_defect_dispositions WHERE disposition_no=$1 FOR UPDATE`,
        [dispositionNo],
      );
      if (prior) {
        if (prior.status === 'DONE') {
          return { code: 200, msg: `缺陷库存处置 ${dispositionNo} 已完成`, idempotent: true, data: prior };
        }
        throw new BadRequestException(`缺陷库存处置 ${dispositionNo} 已在处理中或参数冲突`);
      }

      const [batch] = await manager.query(
        `SELECT batch_no, product_code, sku_code, material_code, item_type, material_type, unit,
                qty, qty_available, status, quality_grade, grade_code_std, warehouse_code,
                location_code, store_code, company_code, expire_date, egg_date, packaging_spec,
                spec_code, source_type, source_no, inbound_date,base_quantity_version,inventory_class,variety_code,
                source_profile_code,source_profile_snapshot,packaging_batch_ref,collection_batch_ref
           FROM inv_batches WHERE batch_no=$1 FOR UPDATE`,
        [batchNo],
      );
      if (!batch) throw new BadRequestException(`库存批次 ${batchNo} 不存在`);
      await assertTempProductionReferenceAllowed(manager, [batchNo]);
      const grade = normalizeDefectGrade(batch.grade_code_std || batch.quality_grade);
      if (!grade) throw new BadRequestException(`批次 ${batchNo} 不是 DIRTY/BROKEN 缺陷库存（8 档制终态；CRACKED/DAMAGED 已永久退役）`);
      const claimedGrade = body?.grade_code == null ? null : normalizeDefectGrade(body.grade_code);
      if (body?.grade_code != null && (!claimedGrade || claimedGrade !== grade)) {
        throw new BadRequestException(`批次 ${batchNo} 等级与请求不一致`);
      }
      const status = String(batch.status || '').toUpperCase();
      if (!['QUARANTINE', 'DAMAGED'].includes(status)) {
        throw new BadRequestException(`批次 ${batchNo} 当前状态 ${status || '(空)'} 不允许缺陷处置`);
      }
      if (!batch.warehouse_code) throw new ForbiddenException(`批次 ${batchNo} 缺少仓库归属`);
      await this.assertWritableWarehouse(batch.warehouse_code, `缺陷批次 ${batchNo}`);
      const companyCode = await this.lockWarehouseCompany(manager, batch.warehouse_code, batch.company_code);
      this.assertBatchCompany(batch, companyCode);
      const available = Number(batch.qty_available),physical=Number(batch.qty);
      if (!Number.isFinite(physical)||physical<0||!Number.isFinite(available)||available<0||available>physical)throw new BadRequestException(`批次 ${batchNo} 实存或可用库存无效`);
      if(physical<requestedQty)throw new BadRequestException(`批次 ${batchNo} 实存 ${physical} 不足 ${requestedQty}`);
      // Restricted batches legitimately have zero saleable availability. Disposal consumes physical stock,
      // but never a still-reserved sales segment; reservation writers share this batch lock.
      const [allocationSchema]=await manager.query("SELECT to_regclass('sal_order_item_batch_allocations') AS allocations");
      if(allocationSchema?.allocations&&(await manager.query(`SELECT 1 FROM sal_order_item_batch_allocations
        WHERE batch_no=$1 AND reserved_qty>outbound_qty+released_qty LIMIT 1`,[batchNo])).length)throw new ConflictException('缺陷批次仍有未释放销售预占，请先解除原单');

      const targetWarehouse = this.nonEmptyString(body?.target_warehouse_code);
      const targetLocation = this.nonEmptyString(body?.target_location_code) || 'DEFECT-TRANSFER';
      let targetCompany: string | null = null;
      if (action === 'TRANSFER') {
        if (targetWarehouse === batch.warehouse_code) throw new BadRequestException('TRANSFER 的目标仓库必须不同于源仓库');
        await this.assertWritableWarehouse(targetWarehouse, '缺陷调拨目标仓库');
        targetCompany = await this.lockWarehouseCompany(manager, targetWarehouse!, undefined);
        await this.assertTransferSku(manager,batch,batch.warehouse_code,targetWarehouse!);
      }

      const inserted = await manager.query(
        `INSERT INTO wms_defect_dispositions
          (disposition_no,batch_no,grade_code,action,qty,warehouse_code,company_code,
           target_warehouse_code,target_location_code,reason,source_reference,operator,status,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5::numeric,$6,$7,$8,$9,$10,$11,$12,'PROCESSING',now(),now())
         ON CONFLICT (disposition_no) DO NOTHING
         RETURNING id`,
        [dispositionNo, batchNo, grade, action, requestedQty, batch.warehouse_code, companyCode,
          targetWarehouse, targetLocation, reason, this.nonEmptyString(body?.source_reference),
          String(user?.username || user?.userId || 'SYS')],
      );
      if (!inserted.length) {
        const [existing] = await manager.query(
          `SELECT disposition_no,status,batch_no,qty,action FROM wms_defect_dispositions WHERE disposition_no=$1 FOR UPDATE`,
          [dispositionNo],
        );
        if (existing?.status === 'DONE') {
          return { code: 200, msg: `缺陷库存处置 ${dispositionNo} 已完成`, idempotent: true, data: existing };
        }
        throw new BadRequestException(`缺陷库存处置 ${dispositionNo} 已在处理中或参数冲突`);
      }

      const changed = await manager.query(
        `WITH changed AS (
           UPDATE inv_batches
              SET qty=GREATEST(COALESCE(qty,0)-$1::numeric,0),
                  qty_available=GREATEST(qty_available-$1::numeric,0), updated_at=now()
            WHERE batch_no=$2 AND warehouse_code=$3
              AND COALESCE(status,'') IN ('QUARANTINE','DAMAGED')
              AND qty >= $1::numeric AND qty_available>=0 AND qty_available<=qty
            RETURNING batch_no
         ) SELECT batch_no FROM changed`,
        [requestedQty, batchNo, batch.warehouse_code],
      );
      if (changed.length !== 1) throw new BadRequestException(`批次 ${batchNo} 状态、归属或数量已变化`);

      const ledgerType = action === 'TRANSFER' ? INV_LEDGER_CHANGE_TYPE.DEFECT_TRANSFER_OUT : `DEFECT_${action}`;
      // INV-301a：统一共享写入器
      await writeInvLedger(manager, {
        batchNo,
        changeType: ledgerType as InvLedgerChangeType,
        qtyChange: -requestedQty,
        operator: String(user?.username || user?.userId || 'SYS'),
        storeCode: batch.store_code || 'ALL',
        refNo: dispositionNo,
        note: `缺陷处置 action=${action} reason=${reason}`,
        qualityGrade: grade,
        skuCode: batch.sku_code || null,
        materialCode: batch.material_code || null,
        warehouseCode: batch.warehouse_code,
        companyCode,
        businessType: 'DEFECT_DISPOSITION',
        unit: batch.unit || null,
      });

      let targetBatchNo: string | null = null;
      if (action === 'TRANSFER') {
        targetBatchNo = `${batchNo}-D-${dispositionNo}`.slice(0, 100);
        await qualifyDerivedInventory(manager,[{batch_no:batchNo}],{batchNo:targetBatchNo,companyCode:targetCompany!,warehouseCode:targetWarehouse!,
          productCode:batch.product_code,skuCode:batch.sku_code,sourceType:'DEFECT_TRANSFER',sourceNo:dispositionNo,ownershipTransfer:true,actor:String(user?.username||'SYS')});
        const targetRows = await manager.query(
          `INSERT INTO inv_batches
            (batch_no,product_code,sku_code,material_code,item_type,material_type,unit,qty,qty_available,
             warehouse_code,location_code,store_code,company_code,quality_grade,grade_code_std,
             packaging_spec,spec_code,egg_date,expire_date,source_type,source_no,inbound_date,status,
             base_quantity_version,inventory_class,variety_code,source_profile_code,source_profile_snapshot,packaging_batch_ref,collection_batch_ref)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::numeric,0,$9,$10,$11,$12,$13,$13,$14,$15,$16,$17,'DEFECT_TRANSFER',$18,CURRENT_DATE,$19,
             $20,$21,$22,$23,$24::jsonb,$25,$26)
           ON CONFLICT (batch_no) DO NOTHING RETURNING batch_no`,
          [targetBatchNo, batch.product_code || null, batch.sku_code || null, batch.material_code || null,
            batch.item_type || null, batch.material_type || null, batch.unit || null, requestedQty,
            targetWarehouse, targetLocation, batch.store_code || 'ALL', targetCompany, grade,
            batch.packaging_spec || null, batch.spec_code || null, batch.egg_date || null,
            batch.expire_date || null, dispositionNo,status,batch.base_quantity_version??null,batch.inventory_class??resolveInventoryClass(grade),
            batch.variety_code??null,batch.source_profile_code??null,batch.source_profile_snapshot?JSON.stringify(batch.source_profile_snapshot):null,
            batch.packaging_batch_ref??null,batch.collection_batch_ref??null],
        );
        if (targetRows.length !== 1) throw new BadRequestException(`目标缺陷批次 ${targetBatchNo} 已存在，拒绝重复入账`);
        await inheritFlockProductionSources(manager,batchNo,targetBatchNo,requestedQty);
        // INV-301a：统一共享写入器
        await writeInvLedger(manager, {
          batchNo: targetBatchNo,
          changeType: INV_LEDGER_CHANGE_TYPE.DEFECT_TRANSFER_IN,
          qtyChange: requestedQty,
          operator: String(user?.username || user?.userId || 'SYS'),
          storeCode: batch.store_code || 'ALL',
          refNo: dispositionNo,
          note: `缺陷调拨入库 source=${batchNo} reason=${reason}`,
          qualityGrade: grade,
          skuCode: batch.sku_code || null,
          materialCode: batch.material_code || null,
          warehouseCode: targetWarehouse,
          companyCode: targetCompany,
          businessType: 'DEFECT_DISPOSITION',
          unit: batch.unit || null,
        });
      }

      const [done] = await manager.query(
        `UPDATE wms_defect_dispositions
            SET batch_no=$2,grade_code=$3,warehouse_code=$4,company_code=$5,target_batch_no=$6,status='DONE',updated_at=now()
          WHERE disposition_no=$1 AND status='PROCESSING'
          RETURNING *`,
        [dispositionNo, batchNo, grade, batch.warehouse_code, companyCode, targetBatchNo],
      );
      return { code: 200, msg: '缺陷库存处置完成', idempotent: false, data: done };
    });
  }

  async updateStandaloneOutbound(outboundNo: string, body: any, user: any) {
    const normalizedNo = this.nonEmptyString(outboundNo);
    if (!normalizedNo) throw new BadRequestException('outbound_no 必填');

    return this.em.transaction(async manager => {
      const [existing] = await manager.query(
        `SELECT * FROM wms_outbound WHERE outbound_no = $1 FOR UPDATE`,
        [normalizedNo],
      );
      if (!existing) throw new BadRequestException(`出库单 ${normalizedNo} 不存在`);
      if (String(existing.status).toUpperCase() !== 'PENDING') {
        throw new BadRequestException(`出库单 ${normalizedNo} 已进入作业，不允许编辑`);
      }

      const merged = { ...existing, ...body, outbound_no: normalizedNo };
      await lockTempProductionReferences(manager, [existing.batch_no, merged.batch_no]);
      this.assertOutboundPermission(existing.type, user, 'E');
      this.assertOutboundPermission(merged.type, user, 'E');
      this.validateStandaloneOutbound(merged);
      const warehouseCode = this.nonEmptyString(merged.warehouse_code);
      await this.assertWritableWarehouse(warehouseCode, `出库单 ${normalizedNo}`);
      await this.assertActiveScopedDestination(merged);
      const companyCode = await this.lockWarehouseCompany(manager, warehouseCode!, body?.company_code ?? (warehouseCode === existing.warehouse_code ? existing.company_code : undefined));
      const requestedSku = SkuPolicy.optionalCode(body?.sku_code) ?? this.nonEmptyString(merged.sku_code);
      const identity = await this.resolveInventoryItem(
        manager,
        requestedSku || this.nonEmptyString(merged.item),
        requestedSku ? 'SKU' : this.nonEmptyString(merged.item_type),
        companyCode,
        this.outboundSkuUsage(merged.type),
      );
      this.validateStandaloneOutbound({
        ...merged,
        item: identity.itemCode,
        item_type: identity.itemType,
        material_type: identity.materialType,
      });
      let quantitySnapshot = existing.quantity_snapshot;
      if (body.quantityBasis !== undefined) {
        quantitySnapshot = await resolveQuantity(manager, { qty: Number(merged.qty), skuCode: identity.skuCode ?? undefined, quantityBasis: body.quantityBasis });
      } else if (quantitySnapshot) {
        if (identity.skuCode !== quantitySnapshot.skuCode) throw new BadRequestException('更换 SKU 必须明确新的计量口径');
        quantitySnapshot = { ...quantitySnapshot, baseQty: baseQuantity(Number(merged.qty), quantitySnapshot.factor, quantitySnapshot.baseUnit) };
      }
      const destinationCode = resolveOutboundDestinationCode(merged);
      const rows = await manager.query(
        `UPDATE wms_outbound
            SET date=$2, type=$3, warehouse_code=$4, item=$5, item_name=$6,
                item_type=$7, material_type=$8, material_code=$9, sku_code=$10,
                unit=$11, batch_no=$12, qty=$13::numeric, destination_type=$14,
                destination_code=$15, destination_house_code=$16,
                destination_customer_code=$17, destination_warehouse_code=$18,
                destination_store_code=$19, department_code=$20, project_code=$21,
                receiver_username=$22, purpose_code=$23, picker=$24, operator=$25,
                ref_no=$26, order_no=$27, remark=$28, attachment_url=$29,
                site_code=$30, company_code=$31, store_code=$32, quantity_snapshot=$33::jsonb, updated_at=now()
          WHERE outbound_no=$1
          RETURNING *`,
        [
          normalizedNo,
          merged.date,
          String(merged.type).toUpperCase(),
          warehouseCode,
          identity.itemCode,
          identity.itemName,
          identity.itemType,
          identity.materialType,
          identity.materialCode,
          identity.skuCode,
          identity.unit,
          this.nonEmptyString(merged.batch_no),
          Number(merged.qty),
          String(merged.destination_type).toUpperCase(),
          destinationCode,
          this.nonEmptyString(merged.destination_house_code),
          this.nonEmptyString(merged.destination_customer_code),
          this.nonEmptyString(merged.destination_warehouse_code),
          this.nonEmptyString(merged.destination_store_code),
          this.nonEmptyString(merged.department_code),
          this.nonEmptyString(merged.project_code),
          this.nonEmptyString(merged.receiver_username),
          this.nonEmptyString(merged.purpose_code),
          this.nonEmptyString(merged.picker),
          String(user?.username || user?.userId || merged.operator || 'SYS'),
          this.nonEmptyString(merged.ref_no),
          this.nonEmptyString(merged.order_no),
          this.nonEmptyString(merged.remark),
          this.nonEmptyString(merged.attachment_url),
          this.nonEmptyString(merged.site_code),
          companyCode,
          this.nonEmptyString(merged.store_code) || 'ALL',
          quantitySnapshot == null ? null : JSON.stringify(quantitySnapshot),
        ],
      );
      return { code: 200, msg: '出库单已更新', data: rows[0] };
    });
  }

  private async resolveInventoryItem(
    manager: EntityManager,
    itemCode: string | null,
    requestedType: string | null,
    companyCode?: string,
    usage: 'stock' | 'sale-stock' = 'stock',
  ): Promise<{
    itemCode: string;
    itemName: string;
    itemType: 'MATERIAL' | 'SKU';
    varietyCode: string | null;
    materialType: string | null;
    materialCode: string | null;
    skuCode: string | null;
    productCode: string | null;
    gradeCode: string | null;
    specCode:string|null;
    unit: string;
  }> {
    if (!itemCode) throw new BadRequestException('物料或 SKU 必填');
    const normalizedType = String(requestedType || '').toUpperCase();
    if (!normalizedType) {
      const matches = await manager.query(`SELECT 'MATERIAL' AS item_type FROM mst_materials WHERE material_code=$1
        UNION ALL SELECT 'SKU' AS item_type FROM product_skus WHERE sku_code=$1`, [itemCode]);
      if (matches.length !== 1 || !['SKU','MATERIAL'].includes(matches[0]?.item_type)) throw new BadRequestException('品目类型缺失或同码跨域，请明确 MATERIAL / SKU');
      return this.resolveInventoryItem(manager,itemCode,matches[0].item_type,companyCode,usage);
    }
    if (!['MATERIAL','SKU'].includes(normalizedType)) throw new BadRequestException('库存类型必须为 MATERIAL / SKU');
    if (!normalizedType || normalizedType === 'MATERIAL') {
      const [material] = await manager.query(
        `SELECT material_code, material_name, material_type, unit
           FROM mst_materials
          WHERE material_code = $1 AND status = 'ACTIVE'
          LIMIT 1`,
        [itemCode],
      );
      if (material) {
        return {
          itemCode: material.material_code,
          itemName: material.material_name,
          itemType: 'MATERIAL',
          varietyCode: null,
          materialType: material.material_type || null,
          materialCode: material.material_code,
          skuCode: null,
          productCode: null,
          gradeCode: null,
          specCode:null,
          unit: material.unit || '件',
        };
      }
    }
    if (!normalizedType || normalizedType === 'SKU') {
      const sku = await SkuPolicy.requireUsable(manager, itemCode, usage, companyCode);
      if (sku) {
        return {
          itemCode: sku.sku_code,
          itemName: sku.sku_name,
          itemType: 'SKU',
          varietyCode: sku.variety_code ?? null,
          materialType: 'FINISHED_PRODUCT',
          materialCode: null,
          skuCode: sku.sku_code,
          productCode: sku.product_code || null,
          gradeCode: sku.grade_code || null,
          specCode:sku.spec_code||null,
          unit: sku.base_unit || '枚',
        };
      }
    }
    throw new BadRequestException(`库存品目 ${itemCode} 不存在、已停用或不在生效期`);
  }

  async confirmStandaloneOutbound(outboundNo: string, user: any, managerOverride?: EntityManager) {
    const normalizedNo = this.nonEmptyString(outboundNo);
    if (!normalizedNo) throw new BadRequestException('outbound_no 必填');

    const execute = async (manager: EntityManager) => {
      const rows = await manager.query(
        `SELECT id, outbound_no, status, type, warehouse_code, store_code, company_code,
                item, item_type, material_type, material_code, sku_code, unit,
                batch_no, qty, quantity_snapshot, destination_type, destination_code,
                destination_house_code, destination_customer_code,
                destination_warehouse_code, destination_store_code,
                department_code, project_code, receiver_username, purpose_code
           FROM wms_outbound
          WHERE outbound_no = $1
          FOR UPDATE`,
        [normalizedNo],
      );
      if (!rows.length) {
        throw new BadRequestException(`出库单 ${normalizedNo} 不存在`);
      }

      const order = rows[0];
      this.assertOutboundPermission(order.type, user, 'E');
      this.validateStandaloneOutbound(order);
      const status = String(order.status || 'PENDING').toUpperCase();
      await this.assertWritableWarehouse(order.warehouse_code, `出库单 ${normalizedNo}`);
      if (status === 'DONE') {
        return {
          code: 200,
          msg: `出库单 ${normalizedNo} 已完成`,
          idempotent: true,
          data: { outbound_no: normalizedNo, status: 'DONE' },
        };
      }
      if (!['PENDING', 'PICKING'].includes(status)) {
        throw new BadRequestException(`出库单 ${normalizedNo} 当前状态 ${status} 不允许确认`);
      }

      const qty = savedQuantity(order);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new BadRequestException(`出库单 ${normalizedNo} 的出库数量必须大于 0`);
      }

      order.company_code = await this.lockWarehouseCompany(manager, order.warehouse_code, order.company_code);
      if (order.quantity_snapshot) {
        await SkuPolicy.requireUsable(manager, order.quantity_snapshot.skuCode, this.outboundSkuUsage(order.type), order.company_code);
        await lockQuantityPools(manager,[{ company: order.company_code, warehouses: [order.warehouse_code], snapshot: order.quantity_snapshot }]);
      }
      const batchNo = this.nonEmptyString(order.batch_no);
      const itemCode = this.nonEmptyString(order.item);
      if (batchNo) {
        const [batch] = await manager.query(
          `SELECT batch_no, product_code, sku_code, material_code, item_type,
                  material_type, unit, grade_code_std, spec_code, legacy_source, base_quantity_version, inventory_class, qty, qty_available, warehouse_code, store_code, company_code
             FROM inv_batches
            WHERE batch_no = $1
            FOR UPDATE`,
          [batchNo],
        );
        if (!batch) throw new BadRequestException(`库存批次 ${batchNo} 不存在`);
        if (order.warehouse_code && batch.warehouse_code !== order.warehouse_code) {
          throw new BadRequestException(
            `库存批次 ${batchNo} 属于仓库 ${batch.warehouse_code || '-'}，与出库仓库 ${order.warehouse_code} 不一致`,
          );
        }
        const batchItemCode = this.nonEmptyString(batch.material_code)
          || this.nonEmptyString(batch.sku_code)
          || this.nonEmptyString(batch.product_code);
        if (order.quantity_snapshot) assertBatchPool(batch, order.quantity_snapshot);
        if (!order.quantity_snapshot && itemCode && batchItemCode !== itemCode) {
          throw new BadRequestException(
            `库存批次 ${batchNo} 的品目 ${batchItemCode || '-'} 与出库品目 ${itemCode} 不一致`,
          );
        }
        await this.deductOutboundBatch(manager, batch, qty, normalizedNo, order, user, 'DONE');
      } else if (itemCode) {
        if (!order.item_type && !order.quantity_snapshot) order.item_type=(await this.resolveInventoryItem(manager,itemCode,null,order.company_code,this.outboundSkuUsage(order.type))).itemType;
        await this.deductStandaloneOutboundByItem(
          manager,
          itemCode,
          qty,
          normalizedNo,
          order,
          user,
        );
      } else {
        throw new BadRequestException(`出库单 ${normalizedNo} 缺少库存批次或物料编码`);
      }

      await manager.query(
        `UPDATE wms_outbound
            SET status = 'DONE',
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [order.id],
      );
      return {
        code: 200,
        msg: '出库确认成功，库存与台账已同步扣减',
        data: { outbound_no: normalizedNo, status: 'DONE', qty },
      };
    };
    return managerOverride ? execute(managerOverride) : this.em.transaction(execute);
  }

  private async deductStandaloneOutboundByItem(
    manager: EntityManager,
    itemCode: string,
    qty: number,
    outboundNo: string,
    order: any,
    user: any,
  ): Promise<void> {
    if (!order.quantity_snapshot && !['SKU', 'MATERIAL'].includes(order.item_type)) throw new BadRequestException('历史出库缺少明确品目类型，请先核实');
    const column = order.item_type === 'MATERIAL' ? 'material_code' : 'sku_code';
    const batches = order.quantity_snapshot
      ? await sharedBatches(manager, order.company_code, [order.warehouse_code], order.quantity_snapshot)
      : await manager.query(`SELECT * FROM inv_batches WHERE ${column}=$1 AND warehouse_code=$2
          AND company_code=(SELECT company_code FROM wms_warehouses WHERE warehouse_code=$2)
          AND COALESCE(qty_available,qty,0)>0 AND status='AVAILABLE' AND ${officialInventoryPredicate('inv_batches')}
          AND (expire_date IS NULL OR expire_date>=CURRENT_DATE)
          ORDER BY expire_date NULLS LAST,created_at,batch_no FOR UPDATE`, [itemCode, order.warehouse_code]);

    let remaining = qty;
    for (const batch of batches) {
      if (remaining <= 0) break;
      if(String(order?.type||'').toUpperCase()==='SALE'&&!allowedInventoryClassesForSales('FARM_SALES').some(kind=>kind===String(batch.inventory_class||'STANDARD').toUpperCase()))continue;
      const available = Number(batch.qty_available ?? batch.qty) || 0;
      if (available <= 0) continue;
      const deductQty = Math.min(remaining, available);
      await this.deductOutboundBatch(
        manager,
        batch,
        deductQty,
        outboundNo,
        order,
        user,
        'DONE',
      );
      remaining -= deductQty;
    }
    if (remaining > 0) {
      throw new BadRequestException(`库存不足：${itemCode} 仍缺 ${remaining}`);
    }
  }

  private async deductOutboundBySelector(
    manager: EntityManager,
    column: 'sku_code' | 'product_code',
    value: string,
    qty: number,
    orderNo: string,
    order: any,
    user: any,
    nextStatus: string,
  ): Promise<void> {
    const label = `${column}=${value}`;
    const batches = await manager.query(
      `SELECT batch_no, product_code, sku_code, material_code, item_type,
              material_type, unit, grade_code_std, spec_code, legacy_source, base_quantity_version, inventory_class, qty, qty_available, warehouse_code, store_code, company_code
         FROM inv_batches
        WHERE ${column} = $1
          ${String(order?.type||'').toUpperCase()==='SALE'?"AND COALESCE(inventory_class,'STANDARD') IN('STANDARD','DEFECT_SALE')":''}
          AND COALESCE(qty_available, qty, 0) > 0
          AND COALESCE(status, 'AVAILABLE') = 'AVAILABLE'
        ORDER BY expire_date NULLS LAST, created_at ASC, batch_no ASC
        FOR UPDATE`,
      [value],
    );

    let remaining = qty;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const available = Number(batch.qty_available ?? batch.qty) || 0;
      if (available <= 0) continue;
      const deductQty = Math.min(remaining, available);
      await this.deductOutboundBatch(manager, batch, deductQty, orderNo, order, user, nextStatus);
      remaining -= deductQty;
    }

    if (remaining > 0) {
      throw new Error(`库存不足 ${label} 缺 ${remaining}`);
    }
  }

  private async deductOutboundBatch(
    manager: EntityManager,
    batch: any,
    qty: number,
    orderNo: string,
    order: any,
    user: any,
    nextStatus: string,
  ): Promise<void> {
    const batchNo = this.nonEmptyString(batch.batch_no);
    if (!batchNo) throw new Error('出库批次号缺失');
    // Every caller acquired its pool (if any) and this row before entering.
    await assertTempProductionReferenceAllowed(manager, [batchNo]);
    await this.assertWritableWarehouse(batch.warehouse_code, `出库批次 ${batchNo}`);

    const companyCode = await this.lockWarehouseCompany(manager, batch.warehouse_code, order.company_code);
    this.assertBatchCompany(batch, companyCode);
    const available = Number(batch.qty_available ?? batch.qty) || 0;
    if (available < qty) {
      throw new Error(`batch ${batchNo} 余量 ${available} 不足 ${qty}`);
    }

    const outboundPolicy = resolveOutboundPolicy(order.type || 'SALE');
    if (!outboundPolicy) {
      throw new BadRequestException(`不支持的出库类型：${order.type || '(空)'}`);
    }
    await this.assertDefectSaleOutboundAllowed(manager, batch, order);

    if (order.quantity_snapshot) assertBatchPool(batch, order.quantity_snapshot);
    const selectedSku = order.quantity_snapshot?.skuCode ?? batch.sku_code;
    if (selectedSku != null) await SkuPolicy.requireUsable(manager, selectedSku, this.outboundSkuUsage(order.type || 'SALE'), companyCode);

    const changed = await manager.query(
      `WITH changed AS (
       UPDATE inv_batches
          SET qty = GREATEST(COALESCE(qty, 0) - $1::numeric, 0),
              qty_available = CASE
                WHEN qty_available IS NULL THEN NULL
                ELSE GREATEST(qty_available - $1::numeric, 0)
              END,
              company_code = CASE
                WHEN inv_batches.company_code IS NULL OR inv_batches.company_code = 'ALL'
                  THEN (SELECT company_code FROM wms_warehouses WHERE warehouse_code = $3)
                ELSE inv_batches.company_code
              END,
              updated_at = now()
        WHERE batch_no = $2
          AND warehouse_code = $3
          AND (
            company_code IS NULL
            OR company_code = 'ALL'
            OR company_code=(SELECT company_code FROM wms_warehouses WHERE warehouse_code=$3)
          )
          AND ($4::varchar IS NULL OR company_code=$4 OR company_code='ALL' OR company_code IS NULL)
          AND COALESCE(status,'AVAILABLE') = 'AVAILABLE'
          AND COALESCE(qty_available,qty,0) >= $1::numeric
        RETURNING batch_no
       ) SELECT batch_no FROM changed`,
      [qty, batchNo, batch.warehouse_code, companyCode],
    );
    if (changed.length !== 1) throw new BadRequestException(`出库批次 ${batchNo} 状态、归属或数量已变化`);
    // INV-301a：统一共享写入器（旧手写 SQL 占位符乱序：$1,$8,-$2,...）
    await writeInvLedger(manager, {
      batchNo,
      changeType: resolveOutboundLedgerType(outboundPolicy.type),
      qtyChange: -qty,
      operator: String(user?.userId || user?.username || 'SYS'),
      storeCode: order.store_code || batch.store_code || 'ALL',
      refNo: orderNo,
      note: `出库 type=${outboundPolicy.type} status=${nextStatus} batch=${batchNo} product=${batch.product_code || '-'} sku=${batch.sku_code || '-'} material=${batch.material_code || '-'} qty=${qty}`,
      skuCode: batch.sku_code || null,
      materialCode: batch.material_code || order.material_code || null,
      warehouseCode: batch.warehouse_code || order.warehouse_code || null,
      companyCode,
      businessType: outboundPolicy.businessType,
      destinationType: order.destination_type || null,
      destinationCode: resolveOutboundDestinationCode(order) || null,
      projectCode: order.project_code || null,
      departmentCode: order.department_code || null,
      unit: batch.unit || order.unit || null,
    });
  }

  /**
   * 收货签收 — V3 真实实现
   * body: { receiver, sign_time, items?: [{ batch_no, actual_qty }] }
   */
  async receiveSignOrder(orderNo: string, body: any, user: any) {
    const receiver = body?.receiver || user?.username || 'SYS';
    return await this.em.transaction(async (manager) => {
      await lockTempProductionReferences(manager, (Array.isArray(body?.items) ? body.items : []).map((item: any) => item.batch_no));
      const scope = this.orderStoreScope('store_code', 1);
      const result = await manager.query(
        `UPDATE ord_orders SET status='received', updated_at=CURRENT_TIMESTAMP
         WHERE order_no = $1 AND ${scope.sql}
         RETURNING order_no, store_code`,
        [orderNo, ...scope.params],
      );
      if (!result.length) return { code: 404, msg: '订单不存在' };

      // 签收差异写入 inv_ledger（reconcile path）
      const items: Array<{ batch_no: string; actual_qty: number; expected_qty: number }> =
        Array.isArray(body?.items) ? body.items : [];
      for (const it of items) {
        const diff = Number(it.actual_qty || 0) - Number(it.expected_qty || 0);
        if (diff === 0 || !it.batch_no) continue;
        // INV-301a：统一共享写入器
        await writeInvLedger(manager, {
          batchNo: it.batch_no,
          changeType: diff > 0 ? INV_LEDGER_CHANGE_TYPE.RECEIVE_OVER : INV_LEDGER_CHANGE_TYPE.RECEIVE_SHORT,
          qtyChange: diff,
          operator: receiver,
          storeCode: result[0].store_code || 'ALL',
          refNo: orderNo,
          note: `签收差异 expected=${it.expected_qty} actual=${it.actual_qty} diff=${diff}`,
        });
      }

      return { code: 200, msg: '签收成功' };
    });
  }

  // ─── 库存 (Inventory) ───────────────────────────────────────────────────────
  async getInventoryBatches() {
    try {
      const scope = this.warehouseScope('b.warehouse_code', 0);
      const data = await this.em.query(
        `SELECT b.id, b.batch_no, b.product_code, b.sku_code, b.material_code,
                b.item_type, b.material_type, b.unit, b.qty, b.qty_available,
                b.status, b.inventory_class, b.warehouse_code, b.location_code, b.store_code,
                b.company_code, b.egg_date, b.inbound_date, b.expire_date,
                b.quality_grade, b.packaging_spec, b.source_type, b.source_no,
                b.grade_code_std, b.spec_code, b.packaging_batch_ref,
                b.collection_batch_ref, b.legacy_source, b.created_at, b.updated_at,
                COALESCE(w.warehouse_name_zh, w.warehouse_name, b.warehouse_code) AS warehouse_name,
                w.warehouse_name_zh, w.warehouse_name_en, w.warehouse_name_lo,
                sku.sku_name, sku.sku_name_en, sku.sku_name_lo,
                mat.material_name, mat.material_name_en, mat.material_name_lo,
                prod.product_name, prod.product_name_zh, prod.product_name_en, prod.product_name_lo,
                loc.location_name, store.store_name, store.store_name_en, store.store_name_lo
           FROM inv_batches b
           LEFT JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code
           LEFT JOIN product_skus sku ON sku.sku_code = b.sku_code
           LEFT JOIN mst_materials mat ON b.material_code IS NOT NULL AND mat.material_code = b.material_code
           LEFT JOIN mst_products prod ON b.product_code IS NOT NULL AND prod.product_code = b.product_code
           LEFT JOIN wms_locations loc ON loc.location_code = b.location_code
           LEFT JOIN mst_stores store ON store.store_code = b.store_code
          WHERE COALESCE(b.qty_available, b.qty, 0) > 0 AND ${officialInventoryPredicate('b')} AND ${scope.sql}
          ORDER BY b.inbound_date DESC NULLS LAST, b.batch_no DESC, b.id DESC LIMIT 200`,
        scope.params,
      );
      return { code: 200, data };
    } catch (e) {
      this.logger.error(`getInventoryBatches 查询失败，降级返回空列表: ${(e as Error).message}`);
      return { code: 200, data: [] };
    }
  }

  /**
   * 库存批次概览聚合（前端 analytics/inventory 由"拉 200 行客户端 reduce"改为调本端点）。
   * 复用 getInventoryBatches 同款 DataScope 查询（不猜列名，零 500 风险），在服务端对
   * 全部在范围内活跃批次(qty>0)做 reduce——KPI 覆盖全量而非仅最新 200 行，前端只取小对象。
   * reduce 规则与前端原逻辑逐一对齐（active/totalQty/expiring/grade 桶/recent）。
   */
  async getInventoryBatchesSummary() {
    const empty = { totalCount: 0, activeCount: 0, totalQtyKg: 0, expiringCount: 0, gradeBuckets: { AA: 0, A: 0, B: 0, C: 0 }, recent: [] as any[] };
    try {
      const scope = this.warehouseScope('b.warehouse_code', 0);
      const rows: any[] = await this.em.query(
        `SELECT b.*,
                COALESCE(w.warehouse_name_zh, w.warehouse_name, b.warehouse_code) AS warehouse_name,
                w.warehouse_name_zh, w.warehouse_name_en, w.warehouse_name_lo,
                sku.sku_name, sku.sku_name_en, sku.sku_name_lo,
                loc.location_name, store.store_name, store.store_name_en, store.store_name_lo
           FROM inv_batches b
           LEFT JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code
           LEFT JOIN product_skus sku ON sku.sku_code = b.sku_code
           LEFT JOIN wms_locations loc ON loc.location_code = b.location_code
           LEFT JOIN mst_stores store ON store.store_code = b.store_code
          WHERE COALESCE(b.qty_available, b.qty, 0) > 0 AND ${officialInventoryPredicate('b')} AND ${scope.sql}`,
        scope.params,
      );
      const isActive = (s?: string) => !s || s === 'AVAILABLE' || s === 'LOCKED';
      const remainingDays = (b: any): number | null => {
        if (b.remaining_days != null) return Number(b.remaining_days);
        if (b.expiry_date) return Math.floor((new Date(b.expiry_date).getTime() - Date.now()) / 86400000);
        return null;
      };
      const gradeBuckets = { AA: 0, A: 0, B: 0, C: 0 };
      let totalQtyKg = 0, activeCount = 0, expiringCount = 0;
      for (const b of rows) {
        if (isActive(b.status)) activeCount++;
        totalQtyKg += Number(b.quantity_kg ?? b.qty ?? 0);
        const d = remainingDays(b);
        if (d !== null && d < 7) expiringCount++;
        const g = String(b.grade ?? b.sku_code ?? '').toUpperCase();
        if (g.includes('AA')) gradeBuckets.AA++;
        else if (g.includes('A')) gradeBuckets.A++;
        else if (g.includes('B')) gradeBuckets.B++;
        else if (g.includes('C')) gradeBuckets.C++;
      }
      const recent = [...rows]
        .sort((a, b) => {
          const dateOrder = String(b.egg_date ?? b.grading_date ?? '').localeCompare(String(a.egg_date ?? a.grading_date ?? ''));
          if (dateOrder !== 0) return dateOrder;
          const batchOrder = String(b.batch_no ?? '').localeCompare(String(a.batch_no ?? ''));
          if (batchOrder !== 0) return batchOrder;
          return String(b.id ?? '').localeCompare(String(a.id ?? ''));
        })
        .slice(0, 10);
      return { code: 200, data: { totalCount: rows.length, activeCount, totalQtyKg, expiringCount, gradeBuckets, recent } };
    } catch (e) {
      this.logger.error(`getInventoryBatchesSummary 查询失败，降级返回空汇总: ${(e as Error).message}`);
      return { code: 200, data: empty };
    }
  }

  async getReceivingOrders() {
    try {
      const scope = this.warehouseScope('warehouse_code', 0);
      const data = await this.em.query(
        `SELECT * FROM wms_inbound WHERE status = 'PENDING' AND ${scope.sql} ORDER BY created_at DESC, id DESC`,
        scope.params,
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  async getReceivingOrderItems(orderNo: string) {
    try {
      const data = await this.em.query(
        `SELECT * FROM wms_inbound_items WHERE task_no = $1 ORDER BY id ASC`,
        [orderNo],
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  async confirmReceivingOrder(orderNo: string, _body: any, _user: any) {
    const rows = await this.em.query(
      `SELECT warehouse_code FROM wms_inbound WHERE task_no = $1 LIMIT 1`,
      [orderNo],
    ).catch(() => []);
    if (rows.length > 0) {
      await this.assertWritableWarehouse(rows[0].warehouse_code || null, `收货单 ${orderNo}`);
    }
    await this.em.query(
      `UPDATE wms_inbound SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE task_no = $1`,
      [orderNo],
    ).catch(() => {});
    return { code: 200, msg: '收货确认成功' };
  }

  /**
   * V2 fidelity: PDA 数据同步 — 上传一批 PDA 端记录到服务端
   * body: { entries: [{ op_id, task_no, batch_no, actual_qty, broken_qty?, timestamp }], pda_id }
   * 幂等：每条 op_id 入 pda_sync_log；已存在直接 skip 不重复执行
   * 返回：{ accepted, duplicates, failed[] }
   */
  async syncPda(body: any, user: any) {
    const entries: Array<any> = Array.isArray(body?.entries) ? body.entries : [];
    const pdaId: string = body?.pda_id || 'PDA-UNKNOWN';
    if (entries.length === 0) return { code: 200, msg: 'no entries', data: { accepted: 0, duplicates: 0, failed: [] } };

    // 防御性建表（首次同步即创建 sync 日志表）
    await this.em.query(
      `CREATE TABLE IF NOT EXISTS pda_sync_log (
         id SERIAL PRIMARY KEY,
         op_id      VARCHAR(64) UNIQUE,
         pda_id     VARCHAR(64),
         task_no    VARCHAR(64),
         payload    JSONB,
         status     VARCHAR(20) DEFAULT 'PROCESSED',
         error_msg  TEXT,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
    ).catch(() => {});

    let accepted = 0;
    let duplicates = 0;
    const failed: Array<{ op_id: string; error: string }> = [];

    for (const e of entries) {
      const opId = e?.op_id || '';
      if (!opId) {
        failed.push({ op_id: '(missing)', error: 'op_id 缺失' });
        continue;
      }
      // 幂等检查
      const dup = await this.em.query(
        `SELECT id FROM pda_sync_log WHERE op_id = $1 LIMIT 1`,
        [opId],
      ).catch(() => []);
      if (dup.length > 0) {
        duplicates++;
        continue;
      }
      // 落库 sync log（即使下游执行失败，本条也已记录避免重复尝试）
      try {
        await this.em.query(
          `INSERT INTO pda_sync_log (op_id, pda_id, task_no, payload, status)
           VALUES ($1, $2, $3, $4, 'PROCESSED')`,
          [opId, pdaId, e?.task_no || null, JSON.stringify(e)],
        );
        accepted++;
      } catch (err: any) {
        failed.push({ op_id: opId, error: err?.message || 'unknown' });
      }
    }

    return {
      code: 200,
      msg: `PDA 同步完成：accepted=${accepted} duplicates=${duplicates} failed=${failed.length}`,
      data: { accepted, duplicates, failed, pda_id: pdaId, operator: user?.username || 'SYS' },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // A4: 库存调拨 (transfer) — V3 真实原子事务
  // ────────────────────────────────────────────────────────────────────────────
  /**
   * body: {
   *   from_warehouse, to_warehouse, transfer_no?, items: [{ batch_no, qty }], operator?
   * }
   * 同事务内：
   *   1) INSERT wms_transfer 主表
   *   2) 每个 batch: 源 inv_batches.qty -= qty (FOR UPDATE 防并发) → 写 OUT 流水
   *   3) 每个 batch: 目标 inv_batches.qty += qty (建新 batch_no 或累加到现有目标库位 batch) → 写 IN 流水
   *
   * 注：简化版直接在源 batch 上扣减，目标用新 batch_no 增加（保留追溯链）
   */
  async confirmTransfer(body: any, user: any) {
    const { from_warehouse, to_warehouse, items = [], operator } = body || {};
    if (!from_warehouse || !to_warehouse || from_warehouse === to_warehouse) {
      return { code: 400, msg: '源/目标仓库必填且不能相同' };
    }
    await this.assertWritableWarehouse(from_warehouse, '库存调拨源仓库');
    await this.assertWritableWarehouse(to_warehouse, '库存调拨目标仓库');
    if (!Array.isArray(items) || items.length === 0) {
      return { code: 400, msg: '调拨明细 items 必填' };
    }
    const invalidLines = items.flatMap((item: any, index: number) => {
      const qty = Number(item?.qty);
      const errors: string[] = [];
      if (!this.nonEmptyString(item?.batch_no)) errors.push(`第 ${index + 1} 行批次号必填`);
      if (!Number.isFinite(qty) || qty <= 0 || Math.abs(Math.round(qty * 1000) - qty * 1000) > 1e-7) {
        errors.push(`第 ${index + 1} 行调拨数量必须大于 0，且最多保留 3 位小数`);
      }
      return errors;
    });
    if (invalidLines.length > 0) {
      throw new BadRequestException({
        code: 400,
        msg: '调拨业务校验失败',
        errors: invalidLines,
      });
    }
    const transferOutPolicy = resolveOutboundPolicy('TRANSFER');
    const transferInPolicy = resolveInboundPolicy('TRANSFER_RECEIVE');
    if (!transferOutPolicy || !transferInPolicy) {
      throw new BadRequestException('库存调拨策略不可用');
    }

    const transferNo = body.transfer_no ||
      `TR-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

    return await this.em.transaction(async (manager) => {
      // 1) 主表
      await lockTempProductionReferences(manager, items.map((item: any) => item.batch_no));
      await manager.query(
        `INSERT INTO wms_transfer (
           transfer_no, from_warehouse, to_warehouse, from_zone, to_zone,
           from_location, to_location, batch_no, qty, reason, attachment_url,
           operator, status, operator_id, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10,$11,$12,'PENDING',$13,now(),now())`,
        [
          transferNo, from_warehouse, to_warehouse,
          this.nonEmptyString(body?.from_zone), this.nonEmptyString(body?.to_zone),
          this.nonEmptyString(body?.from_location), this.nonEmptyString(body?.to_location),
          this.nonEmptyString(items[0]?.batch_no), Number(items[0]?.qty),
          this.nonEmptyString(body?.reason), this.nonEmptyString(body?.attachment_url),
          String(user?.username || operator || 'SYS'), user?.userId || null,
        ],
      );

      // 2) + 3) 逐 batch 原子扣减 + 增加
      const opName = String(user?.username || operator || 'SYS');
      for (const it of [...items].sort((a,b)=>String(a.batch_no).localeCompare(String(b.batch_no)))) {
        const qty = Number(it.qty);

        const [src] = await manager.query(
          `SELECT batch_no, product_code, sku_code, material_code, item_type, material_type,
                  unit, grade_code_std, spec_code, quality_grade, packaging_spec, egg_date, legacy_source, base_quantity_version, packaging_batch_ref, collection_batch_ref, variety_code, source_profile_code, source_profile_snapshot, qty, qty_available, status, inventory_class, expire_date, store_code, warehouse_code, company_code
             FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
          [it.batch_no],
        );
        if (!src) throw new Error(`源 batch ${it.batch_no} 不存在`);
        await this.assertWritableWarehouse(src.warehouse_code, `调拨源批次 ${it.batch_no}`);
        if (src.warehouse_code !== from_warehouse) {
          throw new BadRequestException(
            `源 batch ${it.batch_no} 属于仓库 ${src.warehouse_code || '-'}，与调拨源仓库 ${from_warehouse} 不一致`,
          );
        }
        if (String(src.status || 'AVAILABLE').toUpperCase() !== 'AVAILABLE') {
          throw new BadRequestException(`源 batch ${it.batch_no} 状态 ${src.status} 不允许调拨`);
        }
        if (String(src.inventory_class || '').toUpperCase() === 'DEFECT_SALE') {
          throw new BadRequestException('DEFECT_SALE 缺陷销售库存不能通过普通调拨');
        }
        const available = Number(src.qty_available ?? src.qty) || 0;
        if (available < qty) throw new Error(`源 batch ${it.batch_no} 可用量 ${available} 不足 ${qty}`);

        if (src.base_quantity_version===1) baseQuantity(qty,1,src.unit);
        await this.assertTransferSku(manager, src, from_warehouse, to_warehouse);

        // 源 -
        const changed = await manager.query(
          `WITH changed AS (
           UPDATE inv_batches
              SET qty = GREATEST(COALESCE(qty, 0) - $1::numeric, 0),
                  qty_available = CASE
                    WHEN qty_available IS NULL THEN NULL
                    ELSE GREATEST(qty_available - $1::numeric, 0)
                  END,
                  updated_at = now()
            WHERE batch_no = $2
              AND warehouse_code = $3
              AND company_code=(SELECT company_code FROM wms_warehouses WHERE warehouse_code=$3)
              AND COALESCE(status,'AVAILABLE') = 'AVAILABLE'
              AND COALESCE(qty_available,qty,0) >= $1::numeric
            RETURNING batch_no
           ) SELECT batch_no FROM changed`,
          [qty, it.batch_no, from_warehouse],
        );
        if (changed.length !== 1) throw new BadRequestException(`源 batch ${it.batch_no} 状态、归属或数量已变化`);
        // INV-301a：统一共享写入器（旧手写 SQL 占位符乱序：$1,$7,-$2,...）
        await writeInvLedger(manager, {
          batchNo: it.batch_no,
          changeType: transferOutPolicy.ledgerType,
          qtyChange: -qty,
          operator: opName,
          storeCode: src.store_code || 'ALL',
          refNo: transferNo,
          note: `调拨出 → ${to_warehouse}`,
          skuCode: src.sku_code || null,
          materialCode: src.material_code || null,
          warehouseCode: from_warehouse,
          businessType: transferOutPolicy.businessType,
          unit: src.unit || null,
          companyCode: src.company_code,
        });

        // 目标 + （新建一条目标 batch，追溯链保留）
        const targetIdentity = await this.resolveTransferTargetIdentity(manager, to_warehouse, src.store_code,src.company_code);
        const dstBatchNo = targetIdentity.companyCode!==src.company_code?`XFR-${randomUUID().replace(/-/g,'')}`:`${it.batch_no}-T-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
        await qualifyDerivedInventory(manager,[{batch_no:it.batch_no}],{batchNo:dstBatchNo,companyCode:targetIdentity.companyCode,warehouseCode:to_warehouse,
          productCode:src.product_code,skuCode:src.sku_code,sourceType:'TRANSFER',sourceNo:transferNo,ownershipTransfer:true,actor:opName});
        await manager.query(
          `INSERT INTO inv_batches (
             batch_no, product_code, sku_code, material_code, item_type, material_type,
             unit, qty, qty_available, status, inventory_class, warehouse_code, location_code, expire_date, store_code, company_code, inbound_date,grade_code_std,spec_code,quality_grade,packaging_spec,egg_date,legacy_source,base_quantity_version,packaging_batch_ref,collection_batch_ref,variety_code,source_profile_code,source_profile_snapshot,source_type,source_no
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $8::numeric, 'AVAILABLE', COALESCE($14,'STANDARD'), $9, $10, $11, $12, $13, CURRENT_DATE,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,'TRANSFER',$27)`,
          [
            dstBatchNo, src.product_code || null, src.sku_code || null, src.material_code || null,
            src.item_type || null, src.material_type || null, src.unit || null, qty,
            to_warehouse, 'TRANSFER-IN', src.expire_date, targetIdentity.storeCode, targetIdentity.companyCode,
            src.inventory_class ?? 'STANDARD', src.grade_code_std ?? null, src.spec_code ?? null, src.quality_grade ?? null, src.packaging_spec ?? null, src.egg_date ?? null, src.legacy_source ?? null, src.base_quantity_version ?? null, src.packaging_batch_ref ?? null, src.collection_batch_ref ?? null,
            src.variety_code ?? null, src.source_profile_code ?? null,
            src.source_profile_snapshot == null ? null : JSON.stringify(src.source_profile_snapshot),transferNo,
          ],
        );
        await inheritFlockProductionSources(manager,it.batch_no,dstBatchNo,qty);
        // INV-301a：统一共享写入器（旧手写 SQL 占位符乱序：$1,$7,$2,...）
        await writeInvLedger(manager, {
          batchNo: dstBatchNo,
          changeType: transferInPolicy.ledgerType,
          qtyChange: qty,
          operator: opName,
          storeCode: targetIdentity.storeCode,
          refNo: transferNo,
          note: `调拨入 ← ${from_warehouse} 源 batch=${it.batch_no}`,
          skuCode: src.sku_code || null,
          materialCode: src.material_code || null,
          warehouseCode: to_warehouse,
          businessType: transferInPolicy.businessType,
          unit: src.unit || null,
          companyCode: targetIdentity.companyCode,
        });
        await manager.query(
          `INSERT INTO wms_transfer_items (
             transfer_no,source_batch_no,target_batch_no,expected_qty,received_qty,difference_qty,source_snapshot
           ) VALUES ($1,$2,$3,$4::numeric,$4::numeric,0,$5::jsonb)`,
          [transferNo, it.batch_no, dstBatchNo, qty, JSON.stringify(src)],
        );
      }

      const totalQty = items.reduce((sum: number, item: any) => sum + Number(item.qty), 0);
      await manager.query(
        `UPDATE wms_transfer SET status='COMPLETED',in_transit_qty=$2::numeric,received_qty=$2::numeric,
          dispatched_at=now(),dispatched_by=$3,received_at=now(),received_by=$3,
          completed_at=now(),updated_at=now() WHERE transfer_no=$1 AND status='PENDING'`,
        [transferNo, totalQty, opName],
      );

      return { code: 200, msg: '调拨完成', transfer_no: transferNo };
    });
  }

  private validateTransferInput(body: any): { fromWarehouse: string; toWarehouse: string; items: any[] } {
    const fromWarehouse = String(body?.from_warehouse || '').trim();
    const toWarehouse = String(body?.to_warehouse || '').trim();
    if (!fromWarehouse || !toWarehouse || fromWarehouse === toWarehouse) {
      throw new BadRequestException('源/目标仓库必填且不能相同');
    }
    const items = Array.isArray(body?.items) ? body.items : [];
    const errors = items.flatMap((item: any, index: number) => {
      const qty = Number(item?.qty);
      const lineErrors: string[] = [];
      if (!this.nonEmptyString(item?.batch_no)) lineErrors.push(`第 ${index + 1} 行批次号必填`);
      if (!Number.isFinite(qty) || qty <= 0 || Math.abs(Math.round(qty * 1000) - qty * 1000) > 1e-7) {
        lineErrors.push(`第 ${index + 1} 行调拨数量必须大于 0，且最多保留 3 位小数`);
      }
      return lineErrors;
    });
    if (!items.length) errors.push('调拨明细 items 必填');
    if (errors.length) throw new BadRequestException({ code: 400, msg: '调拨业务校验失败', errors });
    return { fromWarehouse, toWarehouse, items };
  }

  async createTransfer(body: any, user: any) {
    const { fromWarehouse, toWarehouse, items } = this.validateTransferInput(body);
    await this.assertWritableWarehouse(fromWarehouse, '库存调拨源仓库');
    await this.assertWritableWarehouse(toWarehouse, '库存调拨目标仓库');
    return this.persistPendingTransfer(body, user, fromWarehouse, toWarehouse, items);
  }

  /**
   * Server-internal orchestration entry point for store replenishment.
   * The source remains actor-scoped; the target authority comes exclusively from
   * StoreScopePolicy.resolveStoreContext(storeCode, 'SALES'). Controllers never
   * accept or forward this context.
   */
  async createStoreReplenishmentTransfer(
    body: any,
    user: any,
    storeContext: { storeCode: string; warehouseCodes: string[] },
  ) {
    const { fromWarehouse, toWarehouse, items } = this.validateTransferInput(body);
    await this.assertWritableWarehouse(fromWarehouse, '库存调拨源仓库');
    const bindings = Array.isArray(storeContext?.warehouseCodes) ? storeContext.warehouseCodes : [];
    if (!storeContext?.storeCode || !bindings.includes(toWarehouse)) {
      throw new ForbiddenException('补货调拨目标仓不是该门店有效 SALES 绑定仓');
    }
    return this.persistPendingTransfer(body, user, fromWarehouse, toWarehouse, items);
  }

  private async persistPendingTransfer(
    body: any,
    user: any,
    fromWarehouse: string,
    toWarehouse: string,
    items: any[],
  ) {
    const transferNo = body.transfer_no ||
      `TR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    return this.em.transaction(async manager => {
      await lockTempProductionReferences(manager, items.map(item => item.batch_no));
      await assertOfficialInventoryBatches(manager,items.map(item=>item.batch_no));
      for (const item of items) {
        const [batch] = await manager.query('SELECT sku_code, warehouse_code, company_code FROM inv_batches WHERE batch_no=$1 FOR SHARE', [item.batch_no]);
        if (!batch || batch.warehouse_code !== fromWarehouse) throw new BadRequestException('调拨批次不存在或不属于源仓');
        await this.assertTransferSku(manager, batch, fromWarehouse, toWarehouse);
      }
      await manager.query(
        `INSERT INTO wms_transfer (
          transfer_no,from_warehouse,to_warehouse,from_zone,to_zone,from_location,to_location,
          batch_no,qty,reason,attachment_url,operator,status,operator_id,created_at,updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10,$11,$12,'PENDING',$13,now(),now())`,
        [transferNo, fromWarehouse, toWarehouse, this.nonEmptyString(body.from_zone),
          this.nonEmptyString(body.to_zone), this.nonEmptyString(body.from_location),
          this.nonEmptyString(body.to_location), items[0].batch_no, Number(items[0].qty),
          this.nonEmptyString(body.reason), this.nonEmptyString(body.attachment_url),
          String(user?.username || body.operator || 'SYS'), user?.userId || null],
      );
      for (const item of items) {
        await manager.query(
          `INSERT INTO wms_transfer_items (transfer_no,source_batch_no,expected_qty)
           VALUES ($1,$2,$3::numeric)`,
          [transferNo, item.batch_no, Number(item.qty)],
        );
      }
      return { code: 200, msg: '调拨单已创建', transfer_no: transferNo, status: 'PENDING' };
    });
  }

  async dispatchTransfer(transferNo: string, user: any) {
    return this.em.transaction(async manager => {
      const [transfer] = await manager.query(
        `SELECT * FROM wms_transfer WHERE transfer_no=$1 FOR UPDATE`, [transferNo],
      );
      if (!transfer) throw new BadRequestException('调拨单不存在');
      if (transfer.status !== 'PENDING') throw new BadRequestException(`调拨单状态 ${transfer.status} 不允许发运`);
      await this.assertWritableWarehouse(transfer.from_warehouse, '库存调拨源仓库');
      const items = await manager.query(
        `SELECT * FROM wms_transfer_items WHERE transfer_no=$1 ORDER BY id FOR UPDATE`, [transferNo],
      );
      if (!items.length) throw new BadRequestException('调拨明细不存在');
      await lockTempProductionReferences(manager, items.map((item: any) => item.source_batch_no));
      const policy = resolveOutboundPolicy('TRANSFER');
      if (!policy) throw new BadRequestException('库存调拨出库策略不可用');
      let total = 0;
      for (const item of [...items].sort((a,b)=>String(a.source_batch_no).localeCompare(String(b.source_batch_no)))) {
        const qty = Number(item.expected_qty);
        const [src] = await manager.query(
          `SELECT batch_no,product_code,sku_code,material_code,item_type,material_type,unit,qty,
                  qty_available,status,inventory_class,expire_date,store_code,warehouse_code,company_code,grade_code_std,spec_code,quality_grade,packaging_spec,egg_date,legacy_source,base_quantity_version,packaging_batch_ref,collection_batch_ref,variety_code,source_profile_code,source_profile_snapshot
             FROM inv_batches WHERE batch_no=$1 FOR UPDATE`, [item.source_batch_no],
        );
        if (!src || src.warehouse_code !== transfer.from_warehouse) throw new BadRequestException(`源 batch ${item.source_batch_no} 不属于源仓库`);
        if (String(src.status).toUpperCase() !== 'AVAILABLE') throw new BadRequestException(`源 batch ${item.source_batch_no} 状态不允许调拨`);
        if (String(src.inventory_class || '').toUpperCase() === 'DEFECT_SALE') {
          throw new BadRequestException('DEFECT_SALE 缺陷销售库存不能通过普通调拨');
        }
        const available = Number(src.qty_available ?? src.qty) || 0;
        if (available < qty) throw new BadRequestException(`源 batch ${item.source_batch_no} 可用量 ${available} 不足 ${qty}`);
        if (src.base_quantity_version===1) baseQuantity(qty,1,src.unit);
        await this.assertTransferSku(manager, src, transfer.from_warehouse, transfer.to_warehouse);
        const changed = await manager.query(
          `WITH changed AS (
           UPDATE inv_batches SET qty=qty-$1::numeric,
            qty_available=CASE WHEN qty_available IS NULL THEN NULL ELSE qty_available-$1::numeric END,
            updated_at=now()
           WHERE batch_no=$2
             AND warehouse_code=$3
             AND company_code=(SELECT company_code FROM wms_warehouses WHERE warehouse_code=$3)
             AND status='AVAILABLE'
             AND COALESCE(qty_available,qty,0) >= $1::numeric
           RETURNING batch_no
          ) SELECT batch_no FROM changed`,
          [qty, item.source_batch_no, transfer.from_warehouse],
        );
        if (changed.length !== 1) throw new BadRequestException(`源 batch ${item.source_batch_no} 状态、归属或数量已变化`);
        await manager.query(
          `UPDATE wms_transfer_items SET source_snapshot=$2::jsonb,updated_at=now() WHERE id=$1`,
          [item.id, JSON.stringify(src)],
        );
        // INV-301a：统一共享写入器
        await writeInvLedger(manager, {
          batchNo: item.source_batch_no,
          changeType: policy.ledgerType,
          qtyChange: -qty,
          operator: String(user?.username || 'SYS'),
          storeCode: src.store_code || 'ALL',
          refNo: transferNo,
          note: `调拨发运 → ${transfer.to_warehouse}（在途）`,
          skuCode: src.sku_code || null,
          materialCode: src.material_code || null,
          warehouseCode: transfer.from_warehouse,
          businessType: policy.businessType,
          unit: src.unit || null,
          companyCode: src.company_code,
        });
        total += qty;
      }
      await manager.query(
        `UPDATE wms_transfer SET status='IN_TRANSIT',in_transit_qty=$2::numeric,
          dispatched_at=now(),dispatched_by=$3,updated_at=now()
         WHERE transfer_no=$1 AND status='PENDING'`,
        [transferNo, total, String(user?.username || 'SYS')],
      );
      return { code: 200, msg: '调拨已发运', transfer_no: transferNo, status: 'IN_TRANSIT', in_transit_qty: total };
    });
  }

  async receiveTransfer(transferNo: string, body: any, user: any) {
    return this.em.transaction(async manager => {
      const [transfer] = await manager.query(`SELECT * FROM wms_transfer WHERE transfer_no=$1 FOR UPDATE`, [transferNo]);
      if (!transfer) throw new BadRequestException('调拨单不存在');
      if (transfer.status !== 'IN_TRANSIT') throw new BadRequestException(`调拨单状态 ${transfer.status} 不允许签收`);
      await this.assertWritableWarehouse(transfer.to_warehouse, '库存调拨目标仓库');
      const items = await manager.query(`SELECT * FROM wms_transfer_items WHERE transfer_no=$1 ORDER BY id FOR UPDATE`, [transferNo]);
      await lockTempProductionReferences(manager, items.map((item: any) => item.source_batch_no));
      const receivedInput = new Map((Array.isArray(body?.items) ? body.items : []).map((x: any) => [String(x.batch_no), x]));
      const inboundPolicy = resolveInboundPolicy('TRANSFER_RECEIVE');
      if (!inboundPolicy) throw new BadRequestException('库存调拨入库策略不可用');
      let totalReceived = 0; let totalDifference = 0;
      for (const item of items) {
        const expected = Number(item.expected_qty);
        const supplied: any = body?.receive_all ? { received_qty: expected, damaged_qty: 0 } : receivedInput.get(String(item.source_batch_no));
        if (!supplied) throw new BadRequestException(`缺少批次 ${item.source_batch_no} 的签收数量`);
        const received = Number(supplied.received_qty ?? 0);
        const damaged = Number(supplied.damaged_qty ?? 0);
        if (![received, damaged].every(Number.isFinite) || received < 0 || damaged < 0 || received + damaged > expected) {
          throw new BadRequestException(`批次 ${item.source_batch_no} 签收/破损数量不合法`);
        }
        const shortage = expected - received - damaged;
        const snapshot = typeof item.source_snapshot === 'string' ? JSON.parse(item.source_snapshot) : item.source_snapshot;
        if (!snapshot || snapshot.warehouse_code !== transfer.from_warehouse) throw new BadRequestException('调拨源快照与源仓库不一致');
        if (snapshot.base_quantity_version === 1 || snapshot.unit === '枚') {
          for (const amount of [received, damaged, shortage]) if (amount > 0) baseQuantity(amount, 1, snapshot.unit);
        }
        let targetBatchNo: string | null = null;
        if (received > 0) {
          if (!snapshot || snapshot.warehouse_code !== transfer.from_warehouse) throw new BadRequestException('调拨源快照与源仓库不一致');
          await this.assertTransferSku(manager, snapshot, transfer.from_warehouse, transfer.to_warehouse);
          const targetIdentity = await this.resolveTransferTargetIdentity(
            manager,
            transfer.to_warehouse,
            snapshot.store_code,
            snapshot.company_code,
          );
          targetBatchNo = targetIdentity.companyCode!==snapshot.company_code?`XFR-${randomUUID().replace(/-/g,'')}`:`${item.source_batch_no}-T-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
          await qualifyDerivedInventory(manager,[{batch_no:item.source_batch_no}],{batchNo:targetBatchNo,companyCode:targetIdentity.companyCode,warehouseCode:transfer.to_warehouse,
            productCode:snapshot.product_code,skuCode:snapshot.sku_code,sourceType:'TRANSFER',sourceNo:transferNo,ownershipTransfer:true,actor:String(user?.username||'SYS')});
          await manager.query(
            `INSERT INTO inv_batches (batch_no,product_code,sku_code,material_code,item_type,material_type,
            unit,qty,qty_available,status,inventory_class,warehouse_code,location_code,expire_date,store_code,company_code,inbound_date,grade_code_std,spec_code,quality_grade,packaging_spec,egg_date,legacy_source,base_quantity_version,packaging_batch_ref,collection_batch_ref,variety_code,source_profile_code,source_profile_snapshot,source_type,source_no)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$8::numeric,'AVAILABLE',$9,$10,$11,$12,$13,$14,CURRENT_DATE,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,'TRANSFER',$27)`,
            [targetBatchNo, snapshot.product_code || null, snapshot.sku_code || null, snapshot.material_code || null,
              snapshot.item_type || null, snapshot.material_type || null, snapshot.unit || null, received,
              snapshot.inventory_class || 'STANDARD', transfer.to_warehouse, this.nonEmptyString(body?.to_location) || transfer.to_location || 'TRANSFER-IN',
              snapshot.expire_date || null, targetIdentity.storeCode, targetIdentity.companyCode,
              snapshot.grade_code_std ?? null, snapshot.spec_code ?? null, snapshot.quality_grade ?? null, snapshot.packaging_spec ?? null, snapshot.egg_date ?? null, snapshot.legacy_source ?? null, snapshot.base_quantity_version ?? null, snapshot.packaging_batch_ref ?? null, snapshot.collection_batch_ref ?? null,
              snapshot.variety_code ?? null, snapshot.source_profile_code ?? null,
              snapshot.source_profile_snapshot == null ? null : JSON.stringify(snapshot.source_profile_snapshot),transferNo],
          );
          await inheritFlockProductionSources(manager,item.source_batch_no,targetBatchNo,received);
          // INV-301a：统一共享写入器
          await writeInvLedger(manager, {
            batchNo: targetBatchNo,
            changeType: inboundPolicy.ledgerType,
            qtyChange: received,
            operator: String(user?.username || 'SYS'),
            storeCode: targetIdentity.storeCode,
            refNo: transferNo,
            note: `调拨签收 ← ${transfer.from_warehouse} 源 batch=${item.source_batch_no}`,
            skuCode: snapshot.sku_code || null,
            materialCode: snapshot.material_code || null,
            warehouseCode: transfer.to_warehouse,
            businessType: inboundPolicy.businessType,
            unit: snapshot.unit || null,
            companyCode: targetIdentity.companyCode,
          });
        }
        if (damaged > 0) {
          if (!snapshot || snapshot.warehouse_code !== transfer.from_warehouse) {
            throw new BadRequestException('调拨源快照与源仓库不一致');
          }
          const targetIdentity = await this.resolveTransferTargetIdentity(manager, transfer.to_warehouse, snapshot.store_code,snapshot.company_code);
          let damagedSku:string|null=null;
          if(snapshot.sku_code){
            const original=await SkuPolicy.requireUsable(manager,snapshot.sku_code,'stock',targetIdentity.companyCode);
            const candidates=await manager.query(`SELECT sku_code FROM product_skus WHERE product_code=$1 AND grade_code='BROKEN' AND spec_code=$2
              AND variety_code IS NOT DISTINCT FROM $3 AND status='ACTIVE' ORDER BY sku_code FOR SHARE`,[original.product_code,original.spec_code,original.variety_code??null]);
            if(candidates.length!==1)throw new BadRequestException('途中破损须有同产品/商业品种/规格的唯一有效BROKEN SKU，请先核对主数据');
            const broken=await SkuPolicy.requireUsable(manager,candidates[0].sku_code,'stock',targetIdentity.companyCode);
            if(broken.grade_code!=='BROKEN')throw new BadRequestException('破损库存SKU等级不一致');
            damagedSku=broken.sku_code;
          }
          const damagedBatchNo = targetIdentity.companyCode!==snapshot.company_code?`XFR-D-${randomUUID().replace(/-/g,'')}`:`${item.source_batch_no}-BROKEN-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
          await qualifyDerivedInventory(manager,[{batch_no:item.source_batch_no}],{batchNo:damagedBatchNo,companyCode:targetIdentity.companyCode,warehouseCode:transfer.to_warehouse,
            productCode:snapshot.product_code,skuCode:damagedSku,sourceType:'TRANSFER_DAMAGE',sourceNo:transferNo,ownershipTransfer:true,allowSkuConversion:true,actor:String(user?.username||'SYS')});
          await manager.query(
            `INSERT INTO inv_batches (
               batch_no,product_code,sku_code,material_code,item_type,material_type,
               unit,qty,qty_available,status,quality_grade,grade_code_std,inventory_class,
               warehouse_code,location_code,expire_date,store_code,company_code,inbound_date,source_type,source_no,variety_code,source_profile_code,source_profile_snapshot,egg_date,packaging_batch_ref,collection_batch_ref,spec_code,packaging_spec,base_quantity_version,legacy_source)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$8::numeric,'AVAILABLE','BROKEN','BROKEN','DEFECT_SALE',
                     $9,$10,$11,$12,$13,CURRENT_DATE,'TRANSFER_DAMAGE',$14,$15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23,$24)`,
            [damagedBatchNo, snapshot.product_code || null, damagedSku, snapshot.material_code || null,
              snapshot.item_type || null, snapshot.material_type || null, snapshot.unit || null, damaged,
              transfer.to_warehouse, this.nonEmptyString(body?.to_location) || transfer.to_location || 'TRANSFER-IN',
              snapshot.expire_date || null, targetIdentity.storeCode, targetIdentity.companyCode,transferNo,snapshot.variety_code??null,
              snapshot.source_profile_code??null,snapshot.source_profile_snapshot==null?null:JSON.stringify(snapshot.source_profile_snapshot),
              snapshot.egg_date??null,snapshot.packaging_batch_ref??null,snapshot.collection_batch_ref??null,snapshot.spec_code??null,
              snapshot.packaging_spec??null,snapshot.base_quantity_version??null,snapshot.legacy_source??null],
          );
          await inheritFlockProductionSources(manager,item.source_batch_no,damagedBatchNo,damaged);
          await bindTransferDamageBatch(manager,item.id,damagedBatchNo);
          // INV-301a：统一共享写入器
          await writeInvLedger(manager, {
            batchNo: damagedBatchNo,
            changeType: INV_LEDGER_CHANGE_TYPE.TRANSFER_DAMAGE_INBOUND,
            qtyChange: damaged,
            operator: String(user?.username || 'SYS'),
            storeCode: targetIdentity.storeCode,
            refNo: transferNo,
            note: `调拨途中破损 → 缺陷销售库存 source=${item.source_batch_no}`,
            qualityGrade: 'BROKEN',
            skuCode: damagedSku,
            materialCode: snapshot.material_code || null,
            warehouseCode: transfer.to_warehouse,
            businessType: inboundPolicy.businessType,
            unit: snapshot.unit || null,
            companyCode: targetIdentity.companyCode,
          });
        }
        await manager.query(
          `UPDATE wms_transfer_items SET target_batch_no=$2,received_qty=$3::numeric,
            damaged_qty=$4::numeric,difference_qty=$5::numeric,updated_at=now() WHERE id=$1`,
          [item.id, targetBatchNo, received, damaged, shortage + damaged],
        );
        for (const discrepancy of [{ type: 'SHORTAGE', qty: shortage }, { type: 'DAMAGE', qty: damaged }]) {
          if (discrepancy.qty > 0) await manager.query(
            `INSERT INTO wms_transfer_discrepancies
              (transfer_no,transfer_item_id,discrepancy_type,qty,note,created_by)
             VALUES ($1,$2,$3,$4::numeric,$5,$6)`,
            [transferNo, item.id, discrepancy.type, discrepancy.qty, this.nonEmptyString(supplied.note), String(user?.username || 'SYS')],
          );
        }
        totalReceived += received; totalDifference += shortage + damaged;
      }
      await manager.query(
        `UPDATE wms_transfer SET status='RECEIVED',received_qty=$2::numeric,difference_qty=$3::numeric,
          received_at=now(),received_by=$4,updated_at=now() WHERE transfer_no=$1 AND status='IN_TRANSIT'`,
        [transferNo, totalReceived, totalDifference, String(user?.username || 'SYS')],
      );
      if (totalDifference === 0) {
        await manager.query(`UPDATE wms_transfer SET status='COMPLETED',completed_at=now(),updated_at=now() WHERE transfer_no=$1 AND status='RECEIVED'`, [transferNo]);
      }
      return { code: 200, msg: totalDifference ? '调拨已签收，差异待处理' : '调拨已签收完成', transfer_no: transferNo,
        status: totalDifference ? 'RECEIVED' : 'COMPLETED', received_qty: totalReceived, difference_qty: totalDifference };
    });
  }

  async completeTransfer(transferNo: string, body: any, user: any) {
    const resolutions = Array.isArray(body?.resolutions) ? body.resolutions : [];
    return this.em.transaction(async manager => {
      const [transfer] = await manager.query(`SELECT * FROM wms_transfer WHERE transfer_no=$1 FOR UPDATE`, [transferNo]);
      if (!transfer || transfer.status !== 'RECEIVED') throw new BadRequestException('仅差异待处理的 RECEIVED 调拨可完成');
      await this.assertWritableWarehouse(transfer.to_warehouse, '库存调拨目标仓库');
      const open = await manager.query(
        `SELECT id FROM wms_transfer_discrepancies WHERE transfer_no=$1 AND resolved_at IS NULL ORDER BY id FOR UPDATE`, [transferNo],
      );
      const byId = new Map(resolutions.map((x: any) => [String(x.id), x]));
      for (const row of open) {
        const resolution: any = byId.get(String(row.id));
        if (!resolution || !['LOSS', 'ADJUSTMENT'].includes(String(resolution.resolution_type)) || !this.nonEmptyString(resolution.resolution_ref)) {
          throw new BadRequestException(`差异 ${row.id} 必须关联报损或调整单号后才能完成`);
        }
        await manager.query(
          `UPDATE wms_transfer_discrepancies SET resolution_type=$2,resolution_ref=$3,resolved_at=now()
            WHERE id=$1 AND resolved_at IS NULL`,
          [row.id, resolution.resolution_type, resolution.resolution_ref],
        );
      }
      await manager.query(
        `UPDATE wms_transfer SET status='COMPLETED',completed_at=now(),updated_at=now()
          WHERE transfer_no=$1 AND status='RECEIVED'`, [transferNo],
      );
      return { code: 200, msg: '调拨差异已关联处理单并完成', transfer_no: transferNo, status: 'COMPLETED', completed_by: String(user?.username || 'SYS') };
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // A5: 盘点审批 (stocktake approve) — 差额写 inv_ledger + 调 inv_batches.qty
  // ────────────────────────────────────────────────────────────────────────────
  /**
   * body: { stocktake_no, batch_no, diff_qty, item }
   * 差额 > 0 写 ADJUST_UP，< 0 写 ADJUST_DOWN；同步 inv_batches.qty
   */
  async approveStocktake(body: any, user: any) {
    const { stocktake_no, batch_no, diff_qty, item } = body || {};
    const validationErrors: string[] = [];
    if (!stocktake_no) validationErrors.push('stocktake_no 必填');
    const diff = Number(diff_qty) || 0;
    if (diff !== 0 && !batch_no) validationErrors.push('存在盘点差异时批次号必填');
    if (validationErrors.length > 0) {
      throw new BadRequestException({ code: 400, msg: '盘点业务校验失败', errors: validationErrors });
    }
    const opName = String(user?.username || 'SYS');

    return await this.em.transaction(async (manager) => {
      // 标记盘点单已审核
      const stocktakeRows = await manager.query(
        `SELECT warehouse_code, status FROM wms_stocktake WHERE stocktake_no=$1 FOR UPDATE`,
        [stocktake_no],
      ).catch(() => []);
      if (stocktakeRows.length === 0) throw new BadRequestException(`盘点单 ${stocktake_no} 不存在`);
      await this.assertWritableWarehouse(stocktakeRows[0].warehouse_code || null, `盘点单 ${stocktake_no}`);
      const stocktake = stocktakeRows[0];
      await lockTempProductionReferences(manager, [batch_no]);
      if (String(stocktake.status || '').toUpperCase() === 'APPROVED') {
        throw new BadRequestException(`盘点单 ${stocktake_no} 已审核，不能重复审批`);
      }
      if (String(stocktake.status || '').toUpperCase() !== 'DONE') {
        throw new BadRequestException(`盘点单状态 ${stocktake.status || '(空)'} 不允许审批`);
      }
      await manager.query(
        `UPDATE wms_stocktake SET status='APPROVED', auditor=$1, updated_at=now() WHERE stocktake_no=$2 AND status='DONE'`,
        [opName, stocktake_no],
      );

      // 差额必须有 batch_no 才能真扣账
      if (batch_no && diff !== 0) {
        const batchRows = await manager.query(
          `SELECT warehouse_code, store_code, qty, qty_available
             FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
          [batch_no],
        );
        if (!batchRows.length) throw new Error(`batch ${batch_no} 不存在`);
        const batch = batchRows[0];
        await this.assertWritableWarehouse(batch.warehouse_code, `盘点批次 ${batch_no}`);
        const nextQty = Number(batch.qty || 0) + diff;
        if (nextQty < 0) {
          throw new BadRequestException(`盘亏后库存不能为负：当前 ${batch.qty}，差额 ${diff}`);
        }
        await manager.query(
          `UPDATE inv_batches
              SET qty = COALESCE(qty, 0) + $1::numeric,
                  qty_available = CASE
                    WHEN qty_available IS NULL THEN NULL
                    ELSE GREATEST(qty_available + $1::numeric, 0)
                  END,
                  updated_at = now()
            WHERE batch_no = $2`,
          [diff, batch_no],
        );
        // INV-301a：统一共享写入器
        await writeInvLedger(manager, {
          batchNo: batch_no,
          changeType: diff > 0 ? INV_LEDGER_CHANGE_TYPE.STOCKTAKE_UP : INV_LEDGER_CHANGE_TYPE.STOCKTAKE_DOWN,
          qtyChange: diff,
          operator: opName,
          storeCode: batch.store_code || 'ALL',
          refNo: stocktake_no,
          note: `盘点差额 item=${item || '—'} diff=${diff}`,
          businessType: diff > 0 ? 'STOCKTAKE_GAIN' : 'STOCKTAKE_LOSS',
        });
      }

      return { code: 200, msg: `盘点单 ${stocktake_no} 已审核`, diff_applied: diff };
    });
  }

  /**
   * PDA 盘点录入 — 现场操作员逐批扫码盘点，按批次差额即时入账（与入库/出库终端一致：
   * 写 wms_stocktake(APPROVED, count_type='PDA') + 调整 inv_batches + 写 inv_ledger 守恒流水）。
   * body: { lines: [{ batch_no, counted_qty }] }
   * 仅在仓库可写范围内执行（assertWritableWarehouse）；批次不存在/非数则跳过并回报。
   */
  async pdaStocktakeCount(body: any, user: any) {
    const lines: Array<{ batch_no?: string; counted_qty?: number }> = Array.isArray(body?.lines) ? body.lines : [];
    if (!lines.length) throw new BadRequestException('lines 必填');
    const op = String(user?.username || user?.userId || 'SYS');
    const today = new Date().toISOString().slice(0, 10);
    const stamp = Date.now().toString(36).toUpperCase();

    return await this.em.transaction(async (manager) => {
      await lockTempProductionReferences(manager, lines.map(line => line.batch_no));
      const results: any[] = [];
      let idx = 0;
      for (const ln of lines) {
        const batchNo = String(ln.batch_no || '').trim();
        const counted = Number(ln.counted_qty);
        if (!batchNo || !Number.isFinite(counted) || counted < 0) {
          results.push({ batch_no: batchNo, error: '批次号或盘点数无效' });
          continue;
        }
        const rows = await manager.query(
          `SELECT qty, warehouse_code, store_code FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
          [batchNo],
        );
        if (!rows.length) { results.push({ batch_no: batchNo, error: '批次不存在' }); continue; }
        const b = rows[0];
        await this.assertWritableWarehouse(b.warehouse_code, `盘点批次 ${batchNo}`);
        const sysQty = Math.trunc(Number(b.qty) || 0);
        const diff = counted - sysQty;
        const storeCode = b.store_code || 'ALL';
        const stNo = `ST-${today.replace(/-/g, '')}-${stamp}-${idx++}`;

        await manager.query(
          `INSERT INTO wms_stocktake
             (stocktake_no, warehouse_code, item, sys_qty, act_qty, diff_qty, status, auditor, date, count_type, store_code)
           VALUES ($1,$2,$3,$4::int,$5::int,$6::int,'APPROVED',$7,$8,'PDA',$9)`,
          [stNo, b.warehouse_code, batchNo, sysQty, counted, diff, op, today, storeCode],
        );

        if (diff !== 0) {
          await manager.query(
            `UPDATE inv_batches SET qty = qty + $1::int, updated_at = now() WHERE batch_no = $2`,
            [diff, batchNo],
          );
          // INV-301a：统一共享写入器
          await writeInvLedger(manager, {
            batchNo,
            changeType: diff > 0 ? INV_LEDGER_CHANGE_TYPE.STOCKTAKE_UP : INV_LEDGER_CHANGE_TYPE.STOCKTAKE_DOWN,
            qtyChange: diff,
            operator: op,
            storeCode,
            refNo: stNo,
            note: `PDA盘点 sys=${sysQty} act=${counted} diff=${diff}`,
          });
        }
        results.push({ batch_no: batchNo, sys_qty: sysQty, act_qty: counted, diff_qty: diff, stocktake_no: stNo });
      }
      return { code: 200, applied: results.filter(r => !r.error).length, results };
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // A5: 损耗审批 (loss approve) — 类似盘点，但永远是减
  // ────────────────────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────────
  // A6: 日结 (daily-close)
  //   前端 daily-close/page.tsx 调 /api/stocktake/daily-close (旧路由不存在)
  //   新挂在 /api/inventory/daily-close 下（同 inventory.controller）
  // ────────────────────────────────────────────────────────────────────────────
  async getDailyCloseSummary(date: string) {
    const d = date || new Date().toISOString().slice(0, 10);
    try {
      const corrections=[INV_LEDGER_CHANGE_TYPE.TEMP_PRODUCTION_REVERSAL,INV_LEDGER_CHANGE_TYPE.PRODUCTION_INBOUND_REVERSAL];
      const [agg]: Array<{ inbound_qty: string; outbound_qty: string; correction_net_qty: string }> = await this.em.query(
        `SELECT
           COALESCE(SUM(CASE WHEN qty_change > 0 AND (change_type IS NULL OR change_type<>ALL($2::text[])) THEN qty_change ELSE 0 END), 0) AS inbound_qty,
           COALESCE(SUM(CASE WHEN qty_change < 0 AND (change_type IS NULL OR change_type<>ALL($2::text[])) THEN -qty_change ELSE 0 END), 0) AS outbound_qty,
           COALESCE(SUM(CASE WHEN change_type=ANY($2::text[]) THEN qty_change ELSE 0 END), 0) AS correction_net_qty
         FROM inv_ledger
         WHERE ${officialLedgerPredicate()} AND CASE WHEN change_type=ANY($2::text[]) THEN log_date=$1::date
                    ELSE DATE(created_at::timestamp)=$1::date END`,
        [d,corrections],
      ).catch(() => [{ inbound_qty: '0', outbound_qty: '0', correction_net_qty: '0' }]);
      const [stk]: Array<{ stock: string }> = await this.em.query(
        `SELECT COALESCE(SUM(qty), 0) AS stock FROM inv_batches WHERE qty > 0 AND ${officialInventoryPredicate('inv_batches')}`,
      ).catch(() => [{ stock: '0' }]);
      // 复用 wms_stocktake 表存日结记录 (stocktake_no 以 DC- 开头)
      const closedRows = await this.em.query(
        `SELECT stocktake_no AS close_no FROM wms_stocktake
         WHERE stocktake_no LIKE $1 AND status = 'APPROVED'
         LIMIT 1`,
        [`DC-${d.replace(/-/g, '')}-%`],
      ).catch(() => []);
      const lastStocktake = await this.em.query(
        `SELECT stocktake_no, date, act_qty, diff_qty FROM wms_stocktake
         WHERE stocktake_no NOT LIKE 'DC-%' AND stocktake_no NOT LIKE 'LR-%'
         ORDER BY created_at DESC LIMIT 1`,
      ).catch(() => []);
      return {
        code: 200,
        data: {
          inbound_qty: Number(agg.inbound_qty) || 0,
          outbound_qty: Number(agg.outbound_qty) || 0,
          correction_net_qty: Number(agg.correction_net_qty) || 0,
          current_stock: Number(stk.stock) || 0,
          closed_today: closedRows.length > 0 ? closedRows[0] : null,
          last_stocktake: lastStocktake.length > 0 ? lastStocktake[0] : null,
        },
      };
    } catch (e: any) {
      console.warn('[getDailyCloseSummary][WARN]', e?.message);
      return { code: 200, data: { inbound_qty: 0, outbound_qty: 0, correction_net_qty: 0, current_stock: 0, closed_today: null, last_stocktake: null } };
    }
  }

  async executeDailyClose(body: any, user: any) {
    const operator = body?.operator || user?.username || 'SYS';
    const d = new Date().toISOString().slice(0, 10);
    const closeNo = `DC-${d.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    try {
      // 防重：今日已 APPROVED 日结记录 → 拒绝
      const existing = await this.em.query(
        `SELECT stocktake_no FROM wms_stocktake
         WHERE stocktake_no LIKE $1 AND status = 'APPROVED' LIMIT 1`,
        [`DC-${d.replace(/-/g, '')}-%`],
      );
      if (existing.length > 0) {
        return { code: 400, msg: '今日已完成日结，不可重复', data: { close_no: existing[0].stocktake_no } };
      }
      await this.em.query(
        `INSERT INTO wms_stocktake (stocktake_no, status, auditor, date, created_at, updated_at)
         VALUES ($1, 'APPROVED', $2, $3, NOW()::text, NOW()::text)`,
        [closeNo, operator, d],
      );
      return { code: 200, msg: '日结完成', data: { close_no: closeNo } };
    } catch (e: any) {
      console.error('[executeDailyClose][ERR]', e?.message);
      return { code: 500, msg: e?.message || '日结失败' };
    }
  }

  async approveLoss(body: any, user: any) {
    const { loss_no, batch_no, loss_qty, reason } = body || {};
    const validationErrors: string[] = [];
    if (!loss_no) validationErrors.push('loss_no 必填');
    const qty = Math.abs(Number(loss_qty) || 0);
    if (qty <= 0) validationErrors.push('loss_qty 必须大于 0');
    if (!batch_no) validationErrors.push('报损批次号必填');
    if (validationErrors.length > 0) {
      throw new BadRequestException({ code: 400, msg: '报损业务校验失败', errors: validationErrors });
    }
    const opName = String(user?.username || 'SYS');

    return await this.em.transaction(async (manager) => {
      // loss-report 复用 wms_stocktake 表 + LR- 前缀（前端约定）
      const lossRows = await manager.query(
        `SELECT warehouse_code, status FROM wms_stocktake WHERE stocktake_no=$1 FOR UPDATE`,
        [loss_no],
      ).catch(() => []);
      if (lossRows.length === 0) throw new BadRequestException(`损耗单 ${loss_no} 不存在`);
      await this.assertWritableWarehouse(lossRows[0].warehouse_code || null, `损耗单 ${loss_no}`);
      const loss = lossRows[0];
      await lockTempProductionReferences(manager, [batch_no]);
      if (String(loss.status || '').toUpperCase() === 'APPROVED') {
        throw new BadRequestException(`损耗单 ${loss_no} 已审批，不能重复审批`);
      }
      if (String(loss.status || '').toUpperCase() !== 'DONE') {
        throw new BadRequestException(`损耗单状态 ${loss.status || '(空)'} 不允许审批`);
      }
      await manager.query(
        `UPDATE wms_stocktake SET status='APPROVED', auditor=$1, updated_at=now()
         WHERE stocktake_no=$2 AND status='DONE'`,
        [opName, loss_no],
      );

      if (batch_no) {
        const batchRows = await manager.query(
          `SELECT warehouse_code, store_code, qty, qty_available
             FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
          [batch_no],
        );
        if (!batchRows.length) throw new Error(`batch ${batch_no} 不存在`);
        const batch = batchRows[0];
        await this.assertWritableWarehouse(batch.warehouse_code, `损耗批次 ${batch_no}`);
        const available = Number(batch.qty_available ?? batch.qty) || 0;
        if (available < qty) {
          throw new BadRequestException(`损耗数量 ${qty} 超过批次 ${batch_no} 可用库存 ${available}`);
        }
        await manager.query(
          `UPDATE inv_batches
              SET qty = GREATEST(COALESCE(qty, 0) - $1::numeric, 0),
                  qty_available = CASE
                    WHEN qty_available IS NULL THEN NULL
                    ELSE GREATEST(qty_available - $1::numeric, 0)
                  END,
                  updated_at = now()
            WHERE batch_no = $2`,
          [qty, batch_no],
        );
        // INV-301a：统一共享写入器
        await writeInvLedger(manager, {
          batchNo: batch_no,
          changeType: INV_LEDGER_CHANGE_TYPE.LOSS,
          qtyChange: -qty,
          operator: opName,
          storeCode: batch.store_code || 'ALL',
          refNo: loss_no,
          note: `损耗 ${reason || '未填'} qty=${qty}`,
          businessType: 'SCRAP',
        });
      }

      return { code: 200, msg: `损耗单 ${loss_no} 已审批`, applied_qty: qty };
    });
  }
}
