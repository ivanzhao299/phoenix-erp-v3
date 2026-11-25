import { assertApprovedEggSku, checkApprovedEggSource, requireEggProductDomain } from '../../product-master/services/egg-source-change-facts';
import { assertFlockOpenForHandover } from '../../farm/flock-handover-blockers';
import { assertNewHandoverGrades } from '../../farm/daily-report-grades';
import { FINANCE_PROOF_PREFIX, FINANCE_REVIEW, financeSigningMenu, requireReviewFile, reviewSnapshotHash } from '../../wms/production-finance-review';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { stableProductionJson,productionContentHash,inspectProductionSourceReports,lockProductionSourceReports,lockProductionHandoverEvidence,assertHandoverNotClaimedByRaw,
  lockProductionEntryMode,lockRawCollectionReference,assertRawCollectionTotals } from './production-source-facts';
export { stableProductionJson,productionContentHash } from './production-source-facts';
import { EggInventoryService, assertEggDate } from './egg-inventory.service';
import { ProductionInboundService } from './production-inbound.service';
import { SkuAvailabilityService } from '../../product-master/services/sku-availability.service';
import { deriveOrgScope } from '../../farm/farm.service';
import { withFormalProductionLine, FormalSourceAllocation } from '../../wms/formal-production-context';
import { singaporeBusinessDate } from '../../wms/temp-production-reversal';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { hasPerm } from '../../../auth/permissions.util';
import { writeInvLedger } from '../../wms/inventory-ledger.writer';
import { INV_LEDGER_CHANGE_TYPE } from '../../wms/inv-ledger-change-types';
import { guardedBatchUpdate } from '../../wms/inventory-guarded-update.util';
import { assertOfficialInventoryBatches } from '../../wms/official-inventory';
import { FileAccessService } from '../../file/file-access.service';
import { StockBatch, StockBatchFilter, StockTraceScope, stockBatchQuery, stockByGrade,
  stockCsvCell, validateStockFilter } from './production-stock-trace';
import { lockQuantityPools } from '../../product-master/services/quantity-contract';

export interface InboundDraftItem {
  gradeCode: string; quantity: number; specCode?: string;
  allocations?: Array<{ dailyLogId: number; quantity: number; evidenceFileId?: string }>;
}
export interface InboundDraftInput {
  companyCode: string; houseCode: string; eggDate: string; warehouseCode: string; locationCode: string;
  intentKey: string; handoverRef?: string; remark?: string; evidenceFileIds?: string[]; items: InboundDraftItem[];
}
type Document = Record<string, any>;
type FrozenItem = InboundDraftItem & { skuCode: string; productCode: string; specCode: string;
  varietyCode: string | null; inventoryStatus: string; sourceDomainId?: string | null; sources: FormalSourceAllocation[] };

type SourceUsage = { ordinaryNet: number; rawUsedQty: number };
type SourceUsageRow = { daily_log_id: string; grade_code: string; quantity: number };

function sourceQuotaKey(dailyLogId: number | string, gradeCode: string) {
  return `${dailyLogId}:${gradeCode}`;
}

function sourceQuota(confirmedQty: number, usage?: SourceUsage) {
  const { ordinaryNet = 0, rawUsedQty = 0 } = usage ?? {};
  const remaining = confirmedQty - ordinaryNet - rawUsedQty;
  if (ordinaryNet < 0 || rawUsedQty < 0 || remaining < 0) {
    throw new ConflictException({ code:'PRODUCTION_SOURCE_QUOTA_REVIEW_REQUIRED', message:'正式来源累计量异常，请核对原日报、入库、冲销和原始收蛋' });
  }
  return { confirmedQty, ordinaryNet, rawUsedQty, remaining };
}

const text = (value: unknown, name: string, max = 100): string => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max) throw new BadRequestException(`${name}无效`);
  return value;
};
const count = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 2147483647) throw new BadRequestException('本次交库数量必须为正整数枚');
  return value;
};
const recordedCost = (value: unknown): number | null => {
  if (value === null) return null;
  if ((typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)))
    || !Number.isFinite(Number(value)) || Number(value)<0) throw new ConflictException('原成本状态无效，须由财务核对');
  return Number(value);
};

@Injectable()
export class ProductionInboundDocumentsService {
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly cls: ClsService,
    private readonly master: ProductionInboundService, private readonly inventory: EggInventoryService,
    private readonly skus: SkuAvailabilityService,@Optional() private readonly files?: FileAccessService) {}

  private actor(): string {
    const user = this.cls.get('user') as any;
    return text(String(user?.userId ?? user?.id ?? user?.username ?? ''), '制单人');
  }
  private authorize(company: string, warehouse?: string): void {
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    if (!scope || typeof scope.isGlobal !== 'boolean') throw new ForbiddenException('缺少有效数据范围');
    if (!scope.isGlobal && (!scope.allowedCompanyCodes?.includes(company)
      || warehouse && !scope.allowedWarehouseCodes?.includes(warehouse))) throw new ForbiddenException('无权操作该公司或仓库的生产交库单');
  }
  async context(company: string,house: string) {
    text(company,'公司');text(house,'鸡舍');
    const owner=await new OrgOwnershipService(this.db.manager).resolveHouseIdentity(house);
    if(owner.companyCode!==company)throw new ForbiddenException('鸡舍公司归属不匹配');
    const dataScope=this.cls.get('dataScope') as DataScopeContext|undefined;
    if(!dataScope||typeof dataScope.isGlobal!=='boolean')throw new ForbiddenException('缺少有效数据范围');
    const allowed=deriveOrgScope({dataScope});
    if(!allowed.isGlobal&&!allowed.companyCodes?.includes(company)&&!allowed.farmCodes?.includes(owner.farmCode)
      &&!allowed.siteCodes?.includes(owner.siteCode??''))throw new ForbiddenException('无权查看该鸡舍的正式日报范围');
    const [scope]=await this.db.query(`SELECT id,state,first_production_date::text AS first_production_date
      FROM production_cutover_scopes WHERE company_code=$1 AND house_code=$2 AND state<>'DRAFT'`,[company,house]);
    return {state:scope?.state??'OFF',firstProductionDate:scope?.first_production_date??null};
  }
  async locations(company:string,house:string,warehouse:string) {
    text(company,'公司');text(house,'鸡舍');text(warehouse,'仓库');this.authorize(company,warehouse);
    const rows=await this.db.query(`SELECT l.location_code,l.warehouse_code,l.status,
      to_jsonb(l)->>'location_name' AS location_name,to_jsonb(l)->>'zone_code' AS zone_code
      FROM wms_locations l JOIN wms_warehouses w ON w.warehouse_code=l.warehouse_code
      WHERE l.warehouse_code=$3 AND w.company_code=$1 AND w.status='ACTIVE' AND l.status IN ('ACTIVE','NORMAL')
      AND EXISTS(SELECT 1 FROM production_inventory_domains d JOIN production_cutover_scopes s ON s.id=d.scope_id
        WHERE s.company_code=$1 AND s.house_code=$2 AND s.state IN ('ACTIVE','SUSPENDED')
        AND d.company_code=$1 AND d.warehouse_code=$3) ORDER BY l.location_code LIMIT 500`,[company,house,warehouse]);
    return rows;
  }
  async postingPeriod(company: string,month: string) {
    this.authorize(company);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new BadRequestException('期间无效');
    const [period]=await this.db.query('SELECT company_code,period_month,state,version FROM production_posting_periods WHERE company_code=$1 AND period_month=$2',[company,month]);
    return period??{company_code:company,period_month:month,state:null,version:0};
  }
  async evidence(kind: 'document'|'handover',id: string,fileId: string) {
    const d=kind==='document'?await this.identity(id):(await this.db.query('SELECT * FROM production_physical_handovers WHERE id=$1',[id]))[0];
    if(!d||!this.files)throw new NotFoundException('附件不可访问');this.authorize(d.company_code,d.payload.warehouseCode);
    const ids=new Set<string>([...(d.payload.evidenceFileIds??[]),...(d.payload.sources??[]).map((a:any)=>a.evidenceFileId),
      ...(d.payload.items??[]).flatMap((i:any)=>(i.sources??[]).map((a:any)=>a.snapshot?.evidenceFileId??a.sourceSnapshot?.evidenceFileId))].filter(Boolean));
    if(!ids.has(fileId)&&kind==='document') {
      const permissions=(this.cls.get('user') as any)?.permissions;
      if(hasPerm(permissions,'MENU_PROD_INBOUND','A')||hasPerm(permissions,'MENU_FIN2_AR_LEDGER','E')) {
        const [clearance]=await this.db.query(`SELECT 1 FROM production_financial_clearances c JOIN file_metadata f
          ON f.file_id=c.evidence_file_id AND f.checksum=c.evidence_checksum
          WHERE c.document_id=$1 AND c.evidence_file_id=$2`,[id,fileId]);if(clearance)ids.add(fileId);
      }
    }
    if(!ids.has(fileId))throw new NotFoundException('附件不属于该原单');
    const owner=await new OrgOwnershipService(this.db.manager).resolveHouseIdentity(d.house_code);
    return this.files.openProtectedFile(fileId,{moduleCode:'PRODUCTION_INBOUND',ownerType:'HOUSE',ownerId:d.house_code,
      companyCode:d.company_code,storeCode:owner.siteCode??undefined,requiredMenu:'MENU_PROD_INBOUND'},'preview');
  }
  private normalize(input: InboundDraftInput) {
    assertEggDate(input.eggDate);
    for (const field of ['companyCode','houseCode','warehouseCode','locationCode','intentKey'] as const) text(input[field],field);
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) throw new BadRequestException('交库明细须为1至100行');
    const keys = new Set<string>();
    const items = input.items.map(item => {
      const gradeCode = text(item.gradeCode,'等级'); const specCode = text(item.specCode ?? 'LOOSE','规格');
      const key = `${gradeCode}:${specCode}`;
      if (keys.has(key)) throw new BadRequestException('同一单内等级和规格重复，请合并同质明细'); keys.add(key);
      const allocations = item.allocations?.map(a => ({ dailyLogId: count(a.dailyLogId),quantity: count(a.quantity),
        ...(a.evidenceFileId ? { evidenceFileId:text(a.evidenceFileId,'来源交接附件') } : {}) }));
      if (allocations && (new Set(allocations.map(a => a.dailyLogId)).size !== allocations.length
        || allocations.reduce((n,a) => n+a.quantity,0) !== item.quantity)) throw new BadRequestException('班次分配不得重复且合计须等于本次数量');
      return { gradeCode,specCode,quantity: count(item.quantity),...(allocations ? { allocations } : {}) };
    });
    const payload = { warehouseCode: input.warehouseCode,locationCode: input.locationCode,
      remark: typeof input.remark === 'string' ? input.remark.slice(0,1000) : '',
      evidenceFileIds:[...new Set((input.evidenceFileIds ?? []).map(id => text(id,'交接附件')))],items };
    return { ...input,handoverRef: input.handoverRef ? text(input.handoverRef,'实物交接号') : null,payload };
  }
  private async identity(id: string, db: Pick<DataSource,'query'> = this.db): Promise<Document> {
    text(id,'单据ID');
    const [doc] = await db.query('SELECT *,production_date::text AS production_date,expected_posting_date::text AS expected_posting_date FROM production_inbound_documents WHERE id=$1', [id]);
    if (!doc) throw new NotFoundException('生产交库单不存在');
    this.authorize(doc.company_code,doc.payload.warehouseCode); return doc;
  }
  private async lockDay(m: EntityManager, d: Document, requireActive = true, createDay = true) {
    await m.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1))",[d.house_code]);
    const [scope] = await m.query(`SELECT *,first_production_date::text AS first_production_date
      FROM production_cutover_scopes WHERE company_code=$1 AND house_code=$2 AND state<>'DRAFT'
        AND EXISTS(SELECT 1 FROM production_inventory_domains domain WHERE domain.scope_id=production_cutover_scopes.id
          AND domain.company_code=$1 AND domain.warehouse_code=$3) FOR SHARE`, [d.company_code,d.house_code,d.payload.warehouseCode]);
    if (!scope || d.production_date < scope.first_production_date || d.scope_id && d.scope_id !== scope.id
      || requireActive && scope.state !== 'ACTIVE') throw new ConflictException({ code:'PRODUCTION_SCOPE_CLOSED',
      message:'测试期记录已归档或该范围尚未启用，请在正式期间新建交库单' });
    this.authorize(d.company_code,d.payload.warehouseCode);
    if (createDay) await m.query(`INSERT INTO production_inbound_days(company_code,house_code,production_date,scope_id)
      VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [d.company_code,d.house_code,d.production_date,scope.id]);
    await m.query('SELECT company_code FROM production_inbound_days WHERE company_code=$1 AND house_code=$2 AND production_date=$3 FOR UPDATE', [d.company_code,d.house_code,d.production_date]);
    return scope;
  }
  private async reports(m: EntityManager, d: Document) {
    return lockProductionSourceReports(m,{companyCode:d.company_code,houseCode:d.house_code,productionDate:d.production_date},d.kind==='REVERSAL');
  }
  private async usage(m: Pick<DataSource,'query'>, d: Document) {
    const rows: SourceUsageRow[] = await m.query(`SELECT a.daily_log_id::text,l.grade_code,SUM(a.quantity*a.direction)::int AS quantity
      FROM production_inbound_allocations a JOIN production_inbound_lines l ON l.document_id=a.document_id AND l.line_no=a.line_no
      JOIN production_inbound_documents doc ON doc.id=a.document_id
      WHERE doc.company_code=$1 AND doc.house_code=$2 AND doc.production_date=$3 AND doc.state='POSTED'
      GROUP BY a.daily_log_id,l.grade_code`, [d.company_code,d.house_code,d.production_date]);
    const usage = new Map<string,SourceUsage>(rows.map(row => [
      sourceQuotaKey(row.daily_log_id,row.grade_code), {ordinaryNet:row.quantity,rawUsedQty:0},
    ]));
    const [schema]=await m.query("SELECT to_regclass('production_raw_receipt_segments') AS raw");
    if (schema?.raw) {
      const raw: SourceUsageRow[] = await m.query(`SELECT s.daily_log_id::text,s.grade_code,SUM(s.quantity)::int AS quantity FROM production_raw_receipt_segments s
        JOIN production_raw_receipts r ON r.id=s.receipt_id WHERE r.company_code=$1 AND r.house_code=$2 AND r.production_date=$3
          AND r.state='POSTED' GROUP BY s.daily_log_id,s.grade_code`,[d.company_code,d.house_code,d.production_date]);
      for (const item of raw) {
        const key = sourceQuotaKey(item.daily_log_id,item.grade_code);
        usage.set(key,{ordinaryNet:usage.get(key)?.ordinaryNet ?? 0,rawUsedQty:item.quantity});
      }
    }
    return usage;
  }
  private async currentDocument(m: EntityManager, id: string) {
    const [d] = await m.query('SELECT *,production_date::text AS production_date,expected_posting_date::text AS expected_posting_date FROM production_inbound_documents WHERE id=$1 FOR UPDATE',[id]);
    this.authorize(d.company_code,d.payload.warehouseCode); return d as Document;
  }
  private version(d: Document, expected: number) {
    if (!Number.isSafeInteger(expected) || d.version !== expected) throw new ConflictException('单据已被修改，请找回原单后重试');
  }
  private async lockCreation(m: EntityManager,company: string,intent: string,handover?: string|null) {
    const keys=[`production-intent:${company}:${intent}`,...(handover?[`production-handover:${company}:${handover}`]:[])].sort();
    for (const key of keys) await m.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
  }
  private async handoverEvidence(m: EntityManager,d: Document,sources: any[],creator: string) {
    return lockProductionHandoverEvidence(m,{companyCode:d.company_code,houseCode:d.house_code},sources,creator);
  }
  async createPhysicalHandover(input: { companyCode:string;houseCode:string;eggDate:string;warehouseCode:string;handoverRef:string;
    rawCollectionSourceId?:string;replacesId?:string;segments:Array<{ dailyLogId:number;gradeCode:string;quantity:number;evidenceFileId:string }> }) {
    this.authorize(input.companyCode,input.warehouseCode);assertEggDate(input.eggDate);text(input.handoverRef,'实物交接号');
    const actor=this.actor(); const creationHash=productionContentHash(input);
    if(!Array.isArray(input.segments)||!input.segments.length||input.segments.length>100)throw new BadRequestException('交接须明确列出实际班次、档位及数量');
    if(new Set(input.segments.map(s=>`${s.dailyLogId}:${s.gradeCode}`)).size!==input.segments.length)throw new BadRequestException('交接来源班次和档位重复');
    return this.db.transaction(async m=>{
      if(input.rawCollectionSourceId)await m.query("SELECT pg_advisory_xact_lock(hashtextextended('packaging-chain:false',0))");
      await this.lockCreation(m,input.companyCode,`physical:${input.handoverRef}`,input.handoverRef);
      const history=await m.query('SELECT *,production_date::text AS production_date FROM production_physical_handovers WHERE company_code=$1 AND handover_ref=$2 ORDER BY created_at',[input.companyCode,input.handoverRef]);
      const prior=history.find((d:any)=>d.creation_hash===creationHash);
      if(prior){this.authorize(prior.company_code,prior.payload.warehouseCode);return prior;}
      if(history.some((d:any)=>d.state!=='CANCELLED'))throw new ConflictException('同一实物交接号已有未废止记录，不能改写来源');
      if(history.length) {
        const old=history.find((d:any)=>d.id===input.replacesId);
        if(!old||old.state!=='CANCELLED'||old.house_code!==input.houseCode||old.production_date!==input.eggDate)throw new ConflictException('重新签认须明确引用同舍同日已受控废止的原交接');
      }else if(input.replacesId)throw new ConflictException('被替换的原交接不存在');
      const identity={company_code:input.companyCode,house_code:input.houseCode,production_date:input.eggDate,payload:{warehouseCode:input.warehouseCode}};
      const scope=await this.lockDay(m,identity);
      await assertFlockOpenForHandover(m,input.companyCode,input.houseCode,input.eggDate);
      const reports=await this.reports(m,identity);
      await assertNewHandoverGrades(m, reports.filter(report => input.segments.some(segment => Number(report.id) === segment.dailyLogId)));
      const sources=input.segments.map(a=>{
        count(a.quantity);count(a.dailyLogId);text(a.gradeCode,'等级');text(a.evidenceFileId,'原证据');
        const r=reports.find(r=>Number(r.id)===a.dailyLogId);
        if(!r||a.quantity>Number(r.eggs_by_grade[a.gradeCode]??0))throw new ConflictException('交接来源不属于该舍日报，或数量超过该班次分级量');
        return {id:randomUUID(),...a,reportHash:r.report_hash,occupancyId:r.occupancy_id,flockNo:r.flock_no,
          houseCode:r.house_code,productionDate:r.production_date,shift:r.shift};
      });
      await this.handoverEvidence(m,identity,sources,actor);
      let rawCollection:Record<string,any>|undefined;
      if(input.rawCollectionSourceId){
        if((await m.query(`SELECT 1 FROM production_inbound_documents WHERE company_code=$1 AND handover_ref=$2 AND kind='INBOUND'
          AND state<>'CANCELLED' LIMIT 1`,[input.companyCode,input.handoverRef])).length)throw new ConflictException('该实物交接号已被库存单引用，请先取消未过账单并核验原路径');
        const source=await lockRawCollectionReference(m,input.rawCollectionSourceId,{companyCode:input.companyCode,houseCode:input.houseCode,productionDate:input.eggDate});
        assertRawCollectionTotals(source,sources);
        rawCollection={sourceBatchId:source.id,batchCode:source.batch_code,shiftId:source.shift_id,sourceHash:productionContentHash(source),sourceSnapshot:source};
      }
      const payload={warehouseCode:input.warehouseCode,sources,gradeCoverageVerified:true,...(rawCollection?{rawCollection}:{})};const hash=productionContentHash({company:input.companyCode,
        house:input.houseCode,day:input.eggDate,handoverRef:input.handoverRef,payload});
      const [doc]=await m.query(`INSERT INTO production_physical_handovers(id,company_code,house_code,production_date,scope_id,
        handover_ref,content_hash,creation_hash,payload,created_by,replaces_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [randomUUID(),input.companyCode,input.houseCode,input.eggDate,scope.id,input.handoverRef,hash,creationHash,JSON.stringify(payload),actor,input.replacesId??null]);return doc;
    });
  }
  async confirmPhysicalHandover(id: string,version: number,contentHash: string) {
    const [before]=await this.db.query('SELECT *,production_date::text AS production_date FROM production_physical_handovers WHERE id=$1',[id]);
    if(!before)throw new NotFoundException('实物交接记录不存在');this.authorize(before.company_code,before.payload.warehouseCode);
    const actor=this.actor();if(!hasPerm((this.cls.get('user') as any)?.permissions,'MENU_PROD_INBOUND','E'))throw new ForbiddenException('缺少交接接收确认权限');
    return this.db.transaction(async m=>{
      if(before.payload.rawCollection)await m.query("SELECT pg_advisory_xact_lock(hashtextextended('packaging-chain:false',0))");
      await this.lockDay(m,before,false,false);
      const [d]=await m.query('SELECT *,production_date::text AS production_date FROM production_physical_handovers WHERE id=$1 FOR UPDATE',[id]);
      this.authorize(d.company_code,d.payload.warehouseCode);
      if (d.state === 'CONFIRMED' && d.confirmed_by === actor && d.content_hash === contentHash && d.version === version + 1) return d;
      this.version(d,version);
      if(d.state!=='DRAFT'||d.content_hash!==contentHash||d.created_by===actor)throw new ConflictException('交接须由另一名实名接收人确认原始分段摘要');
      await this.lockDay(m,before);
      const reports=await this.reports(m,before);
      if(d.payload.rawCollection){
        if((await m.query(`SELECT 1 FROM production_inbound_documents WHERE company_code=$1 AND handover_ref=$2 AND kind='INBOUND'
          AND state<>'CANCELLED' LIMIT 1`,[d.company_code,d.handover_ref])).length)throw new ConflictException('该交接已被库存单引用，不能按原始收蛋签认');
        const source=await lockRawCollectionReference(m,d.payload.rawCollection.sourceBatchId,
        {companyCode:d.company_code,houseCode:d.house_code,productionDate:before.production_date});
        if(productionContentHash(source)!==d.payload.rawCollection.sourceHash)throw new ConflictException('接收前实际采集原行或包装班次已变化，须重新交接');}
      await this.handoverEvidence(m,d,d.payload.sources,d.created_by);
      const confirmed=await m.query(`SELECT payload FROM production_physical_handovers WHERE company_code=$1 AND house_code=$2
        AND production_date=$3 AND state='CONFIRMED'`,[d.company_code,d.house_code,d.production_date]);
      const compensations=await this.usage(m,d);
      for(const a of d.payload.sources) {
        const report=reports.find(r=>Number(r.id)===a.dailyLogId);
        if(!report||report.report_hash!==a.reportHash||report.occupancy_id!==a.occupancyId||report.flock_no!==a.flockNo)throw new ConflictException('确认前原日报或占栏发生变化');
        const received=confirmed.flatMap((h:any)=>h.payload.sources).filter((s:any)=>s.dailyLogId===a.dailyLogId&&s.gradeCode===a.gradeCode)
          .reduce((n:number,s:any)=>n+Number(s.quantity),0);
        const [released]=await m.query(`SELECT COALESCE(SUM(a.quantity),0)::int AS n FROM production_inbound_allocations a
          JOIN production_inbound_documents rd ON rd.id=a.document_id AND rd.state='POSTED' AND rd.kind='REVERSAL'
          JOIN production_inbound_lines l ON l.document_id=a.document_id AND l.line_no=a.line_no
          WHERE a.daily_log_id=$1 AND l.grade_code=$2 AND a.direction=-1`,[a.dailyLogId,a.gradeCode]);
        const net=received-Number(released.n);const posted=compensations.get(sourceQuotaKey(a.dailyLogId,a.gradeCode));
        // A physical confirmation records an observed handover; it does not reserve production quota.
        // Conflicting receipts are held by the posting transaction's current report/grade limits.
        if(net<0||net<(posted?.ordinaryNet??0)+(posted?.rawUsedQty??0)||a.quantity>Number(report.eggs_by_grade[a.gradeCode]??0))throw new ConflictException('实物交接来源与已过账净量或该班次日报不一致');
      }
      const [result]=await m.query(`WITH changed AS (UPDATE production_physical_handovers SET state='CONFIRMED',version=version+1,
        confirmed_by=$2,confirmed_at=now() WHERE id=$1 RETURNING *) SELECT *, production_date::text AS production_date FROM changed`,[id,actor]);return result;
    });
  }
  async handovers(company: string,house: string,day: string) {
    this.authorize(company);assertEggDate(day);
    const rows=await this.db.query(`SELECT *,production_date::text AS production_date FROM production_physical_handovers
      WHERE company_code=$1 AND house_code=$2 AND production_date=$3 ORDER BY created_at DESC`,[company,house,day]);
    return rows.filter((d:Document)=>{try{this.authorize(d.company_code,d.payload.warehouseCode);return true;}catch{return false;}});
  }
  async cancelPhysicalHandover(id:string,version:number,reason:string,evidenceFileIds:string[]=[]) {
    text(reason,'交接废止依据',1000);const actor=this.actor();const user=this.cls.get('user') as any;
    const [before]=await this.db.query('SELECT *,production_date::text AS production_date FROM production_physical_handovers WHERE id=$1',[id]);
    if(!before)throw new NotFoundException('原交接不存在');this.authorize(before.company_code,before.payload.warehouseCode);
    return this.db.transaction(async m=>{
      await this.lockDay(m,before,false);const [d]=await m.query('SELECT * FROM production_physical_handovers WHERE id=$1 FOR UPDATE',[id]);
      this.authorize(d.company_code,d.payload.warehouseCode);this.version(d,version);
      const mayCancel=d.state==='DRAFT'?d.created_by===actor&&hasPerm(user?.permissions,'MENU_PROD_INBOUND','C')
        :d.confirmed_by===actor&&hasPerm(user?.permissions,'MENU_PROD_INBOUND','E');
      if(d.state==='CANCELLED'||!mayCancel&&!hasPerm(user?.permissions,'MENU_PROD_INBOUND','A'))throw new ForbiddenException('仅原登记/接收人或独立审核人可废止未过账交接');
      await assertHandoverNotClaimedByRaw(m,d.company_code,d.handover_ref);
      if((await m.query(`SELECT 1 FROM production_inbound_documents WHERE company_code=$1 AND handover_ref=$2
        AND kind='INBOUND' AND state<>'CANCELLED' LIMIT 1`,[d.company_code,d.handover_ref])).length)throw new ConflictException('先取消未过账入库单；已过账交接必须走原单冲销，不能废止或复用');
      const evidence=[...new Set(evidenceFileIds)].map(fileId=>({evidenceFileId:fileId}));
      if(d.state==='CONFIRMED'&&!evidence.length)throw new BadRequestException('已确认实物交接废止须提供实际退交及差异依据');
      if(evidence.length)await this.handoverEvidence(m,d,evidence,actor);
      await m.query(`INSERT INTO production_handover_cancellations(id,handover_id,original_hash,reason,evidence,actor)
        VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),id,d.content_hash,reason,JSON.stringify(evidence),actor]);
      const [result]=await m.query(`WITH changed AS (UPDATE production_physical_handovers SET state='CANCELLED',version=version+1
        WHERE id=$1 RETURNING *) SELECT * FROM changed`,[id]);return result;
    });
  }
  async setPostingPeriod(input: { companyCode:string;houseCode:string;periodMonth:string;state:'OPEN'|'CLOSED';
    expectedVersion:number;evidenceFileId:string;reason:string }) {
    this.authorize(input.companyCode);const actor=this.actor();const user=this.cls.get('user') as any;
    if(!hasPerm(user?.permissions,'MENU_FIN2_AR_LEDGER','E'))throw new ForbiddenException('生产记账期间须由财务负责人签认');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.periodMonth)||!['OPEN','CLOSED'].includes(input.state))throw new BadRequestException('记账期间或状态无效');
    text(input.reason,'期间变更依据',1000);
    return this.db.transaction(async m=>{
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`production-period:${input.companyCode}:${input.periodMonth}`]);
      const [prior]=await m.query('SELECT * FROM production_posting_periods WHERE company_code=$1 AND period_month=$2 FOR UPDATE',[input.companyCode,input.periodMonth]);
      if((prior?.version??0)!==input.expectedVersion)throw new ConflictException('记账期间版本已变化，请刷新');
      if(prior?.state==='CLOSED'&&input.state==='OPEN'&&!hasPerm(user?.permissions,'MENU_FIN2_AR_LEDGER','A'))throw new ForbiddenException('重新开放已关期间须财务独立审批权限');
      const owner=await new OrgOwnershipService(m).resolveHouseIdentity(input.houseCode);
      if(owner.companyCode!==input.companyCode)throw new ForbiddenException('期间签认鸡舍不属于该公司');
      const [signer]=await m.query('SELECT username FROM sys_user WHERE user_id::text=$1',[actor]);
      const [file]=await m.query(`SELECT file_id,checksum FROM file_metadata WHERE file_id=$1 AND status='ACTIVE' AND deleted_at IS NULL
        AND module_code='PRODUCTION_INBOUND' AND owner_type='HOUSE' AND owner_id=$2 AND company_code=$3
        AND visibility IN ('PROTECTED','PRIVATE') AND uploaded_by=$4 AND checksum ~ '^[a-f0-9]{64}$' FOR SHARE`,
      [input.evidenceFileId,input.houseCode,input.companyCode,signer?.username??'']);
      if(!file)throw new ConflictException('期间变更须有财务本人上传且对应公司的核验依据');
      const version=(prior?.version??0)+1;
      if(prior)await m.query(`UPDATE production_posting_periods SET state=$3,version=$4,signed_by=$5,evidence_file_id=$6,
        evidence_checksum=$7,owner_house_code=$8,updated_at=now() WHERE company_code=$1 AND period_month=$2`,
      [input.companyCode,input.periodMonth,input.state,version,actor,file.file_id,file.checksum,input.houseCode]);
      else await m.query(`INSERT INTO production_posting_periods(company_code,period_month,state,version,signed_by,evidence_file_id,evidence_checksum,owner_house_code)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[input.companyCode,input.periodMonth,input.state,version,actor,file.file_id,file.checksum,input.houseCode]);
      await m.query(`INSERT INTO production_posting_period_events(id,company_code,period_month,state,version,signed_by,evidence_file_id,evidence_checksum,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),input.companyCode,input.periodMonth,input.state,version,actor,file.file_id,file.checksum,input.reason]);
      return {companyCode:input.companyCode,periodMonth:input.periodMonth,state:input.state,version};
    });
  }
  private async postingPeriods(m: EntityManager,d: Document) {
    const months=[d.expected_posting_date.slice(0,7)];
    if(d.kind==='REVERSAL') {
      const original=await this.identity(d.original_document_id,m);months.push(original.receipt.postingDate.slice(0,7));
    }
    const expected=[...new Set(months)].sort();
    const rows=await m.query(`SELECT p.* FROM production_posting_periods p JOIN file_metadata f ON f.file_id=p.evidence_file_id
      AND f.checksum=p.evidence_checksum AND f.status='ACTIVE' AND f.deleted_at IS NULL AND f.company_code=p.company_code
      AND f.module_code='PRODUCTION_INBOUND' AND f.owner_type='HOUSE' AND f.owner_id=p.owner_house_code
      AND f.visibility IN ('PROTECTED','PRIVATE')
      JOIN sys_user u ON u.user_id::text=p.signed_by AND u.username=f.uploaded_by AND u.status::text IN ('1','ACTIVE')
      WHERE p.company_code=$1 AND p.period_month=ANY($2::text[]) ORDER BY p.period_month FOR SHARE OF p,f,u`,[d.company_code,expected]);
    if(rows.length!==expected.length||rows.some((p:any)=>p.state!=='OPEN'))throw new ConflictException('实际生产记账期间未签认开放或已经关账，停止过账');
    return rows.map((p:any)=>({periodMonth:p.period_month,version:p.version,evidenceChecksum:p.evidence_checksum}));
  }
  async create(input: InboundDraftInput) {
    const p = this.normalize(input); this.authorize(p.companyCode,p.warehouseCode);
    const actor = this.actor();
    const creationHash = productionContentHash({ company:p.companyCode,house:p.houseCode,day:p.eggDate,
      handoverRef:p.handoverRef,payload:p.payload });
    const recover = (rows: Document[]) => {
      if (rows.length !== 1) throw new ConflictException('创建意图与交接号指向不同原单');
      const old = rows[0]; this.authorize(old.company_code,old.payload.warehouseCode);
      if (old.intent_key === p.intentKey && old.creation_hash !== creationHash) throw new ConflictException('同一创建意图的内容发生变化');
      return old;
    };
    const findExisting = async (m: Pick<DataSource,'query'>) => {
      const byIntent=await m.query('SELECT * FROM production_inbound_documents WHERE company_code=$1 AND intent_key=$2',[p.companyCode,p.intentKey]);
      if (byIntent.length||!p.handoverRef) return byIntent;
      return m.query(`SELECT * FROM production_inbound_documents WHERE company_code=$1 AND handover_ref=$2
        AND kind='INBOUND' AND state<>'CANCELLED'`,[p.companyCode,p.handoverRef]);
    };
    const prior = await findExisting(this.db); if (prior.length) return recover(prior);
    return this.db.transaction(async m => {
      await this.lockCreation(m,p.companyCode,p.intentKey,p.handoverRef);
      const identity = { company_code:p.companyCode,house_code:p.houseCode,production_date:p.eggDate,payload:p.payload };
      const scope = await this.lockDay(m,identity);
      const existing = await findExisting(m); if (existing.length) return recover(existing);
      await assertFlockOpenForHandover(m,p.companyCode,p.houseCode,p.eggDate);
      if(p.handoverRef)await assertHandoverNotClaimedByRaw(m,p.companyCode,p.handoverRef,true);
      const id = randomUUID();
      const [d] = await m.query(`INSERT INTO production_inbound_documents(id,document_no,company_code,house_code,
        production_date,scope_id,kind,intent_key,handover_ref,payload,created_by,creation_hash)
        VALUES($1,$2,$3,$4,$5,$6,'INBOUND',$7,$8,$9,$10,$11) RETURNING *`,
      [id,`PIN-${id}`,p.companyCode,p.houseCode,p.eggDate,scope.id,p.intentKey,p.handoverRef,JSON.stringify(p.payload),actor,creationHash]);
      return d;
    });
  }
  async get(id: string): Promise<Document & { lines: any[] }> {
    return this.db.transaction('REPEATABLE READ',async m => {
    const d = await this.identity(id,m);
    const lines = await m.query(`SELECT l.*,COALESCE(b.qty,0)::numeric AS current_quantity,
      COALESCE(b.qty_available,0)::numeric AS current_available FROM production_inbound_lines l
      LEFT JOIN inv_batches b ON b.batch_no=l.batch_no WHERE l.document_id=$1 ORDER BY line_no`, [id]);
    const allocations=await m.query(`SELECT a.*,
      COALESCE((SELECT SUM(r.quantity) FROM production_inbound_allocations r JOIN production_inbound_documents rd
        ON rd.id=r.document_id AND rd.state='POSTED' WHERE r.original_allocation_id=a.id),0)::int AS reversed_quantity
      FROM production_inbound_allocations a WHERE a.document_id=$1 ORDER BY line_no,id`,[id]);
    const permissions=(this.cls.get('user') as any)?.permissions;
    const finance=hasPerm(permissions,'MENU_FIN2_AR_LEDGER','E');
    const owner=await new OrgOwnershipService(m).resolveHouseIdentity(d.house_code);
    const clearances=finance||hasPerm(permissions,'MENU_PROD_INBOUND','A')?await m.query(`SELECT id,content_hash,posting_date,signed_by,
      evidence_file_id,signed_at FROM production_financial_clearances WHERE document_id=$1 ORDER BY signed_at DESC`,[id]):[];
    const originalBatches=finance&&d.kind==='REVERSAL'?await m.query(`SELECT b.batch_no,b.unit_cost,q.cost_status FROM inv_batches b
      JOIN production_batch_qualifications q ON q.batch_no=b.batch_no WHERE b.batch_no=ANY($1::text[]) ORDER BY b.batch_no`,
      [d.payload.items.map((i:any)=>i.batchNo)]):[];
    return { ...d,siteCode:owner.siteCode??'',clearances,originalBatches,lines:lines.map((line:any)=>({...line,allocations:allocations.filter((a:any)=>a.line_no===line.line_no)})) };
    });
  }
  async recover(company: string, intentKey?: string, handoverRef?: string) {
    this.authorize(company);
    if (!intentKey && !handoverRef) throw new BadRequestException('请提供原创建意图或实物交接号');
    const rows = await this.db.query(`SELECT *,production_date::text AS production_date FROM production_inbound_documents WHERE company_code=$1
      AND (($2::text IS NOT NULL AND intent_key=$2) OR ($3::text IS NOT NULL AND handover_ref=$3))
      ORDER BY created_at DESC`, [company,intentKey ?? null,handoverRef ?? null]);
    return rows.filter((d: Document) => { try { this.authorize(d.company_code,d.payload.warehouseCode); return true; } catch { return false; } });
  }
  async list(company: string, house: string, day: string) {
    this.authorize(company); assertEggDate(day);
    const rows = await this.db.query(`SELECT *,production_date::text AS production_date FROM production_inbound_documents
      WHERE company_code=$1 AND house_code=$2 AND production_date=$3 ORDER BY created_at DESC`, [company,house,day]);
    return rows.filter((d: Document) => { try { this.authorize(d.company_code,d.payload.warehouseCode); return true; } catch { return false; } });
  }
  async edit(id: string, version: number, input: InboundDraftInput) {
    const p = this.normalize(input); const before = await this.identity(id);
    return this.db.transaction(async m => {
      await this.lockDay(m,before,false); const d = await this.currentDocument(m,id); this.version(d,version);
      if (d.state !== 'DRAFT'||d.kind!=='INBOUND') throw new ConflictException('仅入库草稿可编辑；冻结或冲销单请取消并另建新意图');
      if (d.company_code !== p.companyCode || d.house_code !== p.houseCode || d.production_date !== p.eggDate
        || d.intent_key !== p.intentKey || (d.handover_ref ?? null) !== p.handoverRef) throw new ConflictException('不能变更交接身份，请取消后另建单');
      this.authorize(p.companyCode,p.warehouseCode);
      const [result] = await m.query(`WITH changed AS (UPDATE production_inbound_documents SET payload=$2,state='DRAFT',version=version+1,
        content_hash=NULL,submit_key=NULL,expected_posting_date=NULL,approved_by=NULL,approved_hash=NULL,ready_at=NULL
        WHERE id=$1 RETURNING *) SELECT * FROM changed`, [id,JSON.stringify(p.payload)]); return result;
    });
  }
  private async freezeItems(m: EntityManager, d: Document, reports: any[]): Promise<{ items: FrozenItem[]; profile: any }> {
    const context = await this.master.resolveMasterContext({ companyCode:d.company_code,houseCode:d.house_code,
      warehouseCode:d.payload.warehouseCode,locationCode:d.payload.locationCode },m);
    if (context.companyCode !== d.company_code) throw new ConflictException('鸡舍归属已变化，请核对原交接');
    if(d.handover_ref)await assertHandoverNotClaimedByRaw(m,d.company_code,d.handover_ref,true);
    const mode=await lockProductionEntryMode(m,context.farmCode,d.company_code);
    if (mode !== 'TEMP_PRODUCTION_INBOUND') throw new ConflictException('正式交库须先明确启用临时生产入库模式；包装路径不能重复交库');
    const profile = await this.skus.resolveSourceProfile({ companyCode:d.company_code,houseCode:d.house_code,
      eggDate:d.production_date,farmCode:context.farmCode,siteCode:context.siteCode },m);
    const approval = await checkApprovedEggSource(m,profile);
    const medicines = await m.query(`SELECT 1 FROM brd_medication_records WHERE flock_no=ANY($1::text[])
      AND status<>'CANCELLED' AND start_date<=$2 AND (withdraw_until IS NULL OR withdraw_until>=$2) LIMIT 1`,
    [[...new Set(reports.map(r => r.flock_no))],d.production_date]);
    if (medicines.length) throw new ConflictException('鸡群处于用药/休药期，请先完成隔离处置');
    const policies = await this.inventory.getGradePoliciesForInbound(m);
    const [handover]=await m.query(`SELECT *,production_date::text AS production_date FROM production_physical_handovers
      WHERE company_code=$1 AND handover_ref=$2 AND state='CONFIRMED' FOR SHARE`,[d.company_code,d.handover_ref]);
    if(!handover||handover.house_code!==d.house_code||handover.production_date!==d.production_date||handover.scope_id!==d.scope_id
      ||handover.payload.warehouseCode!==d.payload.warehouseCode
      ||handover.created_by===handover.confirmed_by)throw new ConflictException('须先由收发双方确认绑定日报、占栏、班次、档位和数量的实物交接');
    if (handover.payload.gradeCoverageVerified !== true) {
      await assertNewHandoverGrades(m, reports.filter(report => handover.payload.sources.some((source: FormalSourceAllocation) => source.dailyLogId === Number(report.id))));
    }
    await this.handoverEvidence(m,d,handover.payload.sources,handover.created_by);
    const physicalRemaining=new Map<string,number>(handover.payload.sources.map((a:any)=>[`${a.dailyLogId}:${a.gradeCode}`,Number(a.quantity)]));
    const usage = await this.usage(m,d);
    const planned = new Map<string,number>();
    const items: FrozenItem[] = [];
    for (const item of d.payload.items as InboundDraftItem[]) {
      if (reports.length>1 && !item.allocations?.length) throw new ConflictException('多班交接必须逐段指定实际日报和证据，不自动把额度分摊写为精确来源');
      const policy = policies[item.gradeCode]; if (!policy?.stockManaged) throw new ConflictException(`等级 ${item.gradeCode} 未启用库存管理`);
      const sku = await this.skus.resolve({ companyCode:d.company_code,houseCode:d.house_code,eggDate:d.production_date,
        farmCode:context.farmCode,siteCode:context.siteCode,sourceProfileCode:profile.profileCode,
        gradeCode:item.gradeCode,specCode:item.specCode ?? 'LOOSE',usage:'stock' },m);
      assertApprovedEggSku(approval,sku,d.payload.warehouseCode);
      const domain = approval ? { sourceDomainId:await requireEggProductDomain(m,profile,d.scope_id,
        d.payload.warehouseCode,sku.productCode) } : {};
      const sources: FormalSourceAllocation[] = []; let remaining = item.quantity;
      for (const r of reports) {
        const key = sourceQuotaKey(r.id,item.gradeCode);
        const plannedQty = planned.get(key) ?? 0;
        const capacity = sourceQuota(r.eggs_by_grade[item.gradeCode] ?? 0,usage.get(key)).remaining-plannedQty;
        const selected = item.allocations?.find(a => a.dailyLogId === Number(r.id));
        const physical=handover.payload.sources.find((a:any)=>a.dailyLogId===Number(r.id)&&a.gradeCode===item.gradeCode);
        const physicalCapacity=physicalRemaining.get(key)??0;
        const n = item.allocations ? selected?.quantity ?? 0 : Math.min(remaining,capacity,physicalCapacity);
        if(n>physicalCapacity)throw new ConflictException({code:'PRODUCTION_HANDOVER_CAPACITY',gradeCode:item.gradeCode,
          dailyLogId:r.id,remaining:physicalCapacity,message:'拟入分段超过收发双方签认的实际交接数量'});
        if (n>capacity) throw new ConflictException({ code:'PRODUCTION_GRADE_CAPACITY',gradeCode:item.gradeCode,
          dailyLogId:r.id,remaining:capacity,message:`${item.gradeCode} 来源可入余额不足` });
        if (n>0) {
          if(!physical||physical.reportHash!==r.report_hash||physical.occupancyId!==r.occupancy_id
            ||physical.flockNo!==r.flock_no||selected?.evidenceFileId&&selected.evidenceFileId!==physical.evidenceFileId)throw new ConflictException('实际交接分段与原日报、占栏或证据不一致');
          sources.push({ dailyLogId:Number(r.id),reportHash:r.report_hash,quantity:n,occupancyId:r.occupancy_id,
            flockNo:r.flock_no,houseCode:r.house_code,productionDate:r.production_date,
            snapshot:{ ...r,evidenceFileId:physical.evidenceFileId,evidenceChecksum:physical.evidenceChecksum,handoverRef:d.handover_ref,
              handoverId:handover.id,handoverContentHash:handover.content_hash,handoverLineId:physical.id,
              issuedBy:handover.created_by,receivedBy:handover.confirmed_by } });
          planned.set(key,plannedQty+n); remaining-=n;
          physicalRemaining.set(key,physicalCapacity-n);
        }
      }
      if (remaining!==0) throw new ConflictException({ code:'PRODUCTION_GRADE_CAPACITY',gradeCode:item.gradeCode,
        remaining:item.quantity-remaining,message:`${item.gradeCode} 日报可入余额不足或分配来源不一致` });
      items.push({ ...item,...domain,sources,skuCode:sku.skuCode,productCode:sku.productCode,specCode:sku.specCode,
        varietyCode:sku.varietyCode,inventoryStatus:policy.defaultStockStatus });
    }
    if([...physicalRemaining.values()].some(n=>n!==0))throw new ConflictException('本单必须完整承接该次实物交接；请核对遗漏档位或分段');
    return { items,profile };
  }
  private async inboundPeriodVersion(m: EntityManager, company: string, postingDate: string): Promise<number> {
    const month=postingDate.slice(0,7);
    await m.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`production-period:${company}:${month}`]);
    const [period]=await m.query(`SELECT state,version FROM production_posting_periods
      WHERE company_code=$1 AND period_month=$2 FOR SHARE`,[company,month]);
    if (period?.state==='CLOSED') throw new ConflictException({code:'PRODUCTION_PERIOD_CLOSED',
      message:'当前生产记账期间已经关账，停止新过账'});
    // Ordinary inbound has always supported an implicit open period.
    return period?.version ?? 0;
  }
  async ready(id: string, version: number, submitKey: string) {
    text(submitKey,'提交键'); const before = await this.identity(id);
    return this.db.transaction(async m => {
      await this.lockDay(m,before,false,false);
      const d = await this.currentDocument(m,id);
      if (d.state === 'READY' && d.version === version + 1 && d.submit_key === submitKey) return d;
      this.version(d,version);
      if (d.state !== 'DRAFT') throw new ConflictException('仅草稿可冻结');
      const scope = await this.lockDay(m,before);
      const reports = await this.reports(m,before);
      if (d.kind === 'REVERSAL') return this.readyReversal(m,d,submitKey,scope);
      const postingDate = singaporeBusinessDate();
      const periodVersion=await this.inboundPeriodVersion(m,d.company_code,postingDate);
      const frozen = await this.freezeItems(m,d,reports);
      const payload = { ...d.payload,...frozen,scopeVersion:scope.version,periodVersion };
      const digest = productionContentHash({ documentNo:d.document_no,company:d.company_code,house:d.house_code,
        productionDate:d.production_date,scopeId:scope.id,postingDate,payload });
      const [result] = await m.query(`WITH changed AS (UPDATE production_inbound_documents SET state='READY',version=version+1,
        payload=$2,content_hash=$3,submit_key=$4,expected_posting_date=$5,ready_at=now() WHERE id=$1 RETURNING *) SELECT * FROM changed`,
      [id,JSON.stringify(payload),digest,submitKey,postingDate]); return result;
    });
  }
  async cancel(id: string, version: number) {
    const before = await this.identity(id);
    return this.db.transaction(async m => {
      await this.lockDay(m,before,false); const d = await this.currentDocument(m,id); this.version(d,version);
      if (['POSTED','CANCELLED'].includes(d.state)) throw new ConflictException('单据已过账或已取消');
      const [result] = await m.query("WITH changed AS (UPDATE production_inbound_documents SET state='CANCELLED',version=version+1 WHERE id=$1 RETURNING *) SELECT * FROM changed", [id]); return result;
    });
  }
  /** Stable request identity and the old document survive an unknown HTTP outcome. */
  async reissue(id: string, version: number, intentKey: string) {
    text(intentKey, '续制意图');
    const before = await this.identity(id);
    const posted = (doc: Document) => ({ outcome: 'POSTED' as const, documentId: doc.id, receipt: doc.receipt });
    if (before.state === 'POSTED') return posted(before);
    return this.db.transaction(async m => {
      await this.lockCreation(m, before.company_code, intentKey, before.handover_ref);
      const scope = await this.lockDay(m, before, false, false);
      const old = await this.currentDocument(m, id);
      if (old.state === 'POSTED') return posted(old);
      const perms = (this.cls.get('user') as any)?.permissions;
      if (!hasPerm(perms, 'MENU_PROD_INBOUND', 'C') || !hasPerm(perms, 'MENU_PROD_INBOUND', 'E')) {
        throw new ForbiddenException('续制须具备创建与编辑权限');
      }
      const [link] = await m.query(`SELECT successor_id FROM production_inbound_reissues
        WHERE predecessor_id=$1`, [id]);
      const [usedIntent] = await m.query('SELECT id FROM production_inbound_documents WHERE company_code=$1 AND intent_key=$2',
        [old.company_code, intentKey]);
      if (usedIntent && usedIntent.id !== link?.successor_id) throw new ConflictException('续制须使用独立的新意图');
      if (link) return { outcome: 'EXISTING' as const, documentId: link.successor_id };
      this.version(old, version);
      if (scope.state !== 'ACTIVE' || !['READY', 'APPROVED'].includes(old.state)) {
        throw new ConflictException('仅启用范围内的未过账冻结单可续制');
      }
      const [clock] = await m.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date::text AS today");
      if (old.expected_posting_date >= clock.today) throw new ConflictException('仅可续制已跨记账日的冻结单');
      let payload: Document;
      let hash: string;
      if (old.kind === 'INBOUND') {
        const draft = this.normalize({ companyCode:old.company_code, houseCode:old.house_code, eggDate:old.production_date,
          handoverRef:old.handover_ref, warehouseCode:old.payload.warehouseCode, locationCode:old.payload.locationCode,
          intentKey, remark:old.payload.remark, evidenceFileIds:old.payload.evidenceFileIds,
          items:this.sourceDraftItems(old.payload.items) });
        payload = draft.payload;
        hash = productionContentHash({company:draft.companyCode,house:draft.houseCode,day:draft.eggDate,
          handoverRef:draft.handoverRef,payload});
      } else {
        const {warehouseCode,locationCode,reason,evidenceFileIds,evidenceChecksums,originalContentHash,items} = old.payload;
        // The protected physical evidence is still bound to its original uploader. All approvals are acquired anew.
        payload = {warehouseCode,locationCode,reason,evidenceFileIds,evidenceChecksums,originalContentHash,items,
          evidenceOwnerId:old.payload.evidenceOwnerId ?? old.created_by};
        const segments = items.flatMap((item:Document) => item.sources.map((a:Document) =>
          ({allocationId:a.originalAllocationId,quantity:a.quantity})));
        hash = productionContentHash({originalId:old.original_document_id,intentKey,reason,segments,evidenceFileIds});
      }
      const next = randomUUID();
      const actor = this.actor();
      await m.query("UPDATE production_inbound_documents SET state='CANCELLED',version=version+1 WHERE id=$1", [id]);
      await m.query(`INSERT INTO production_inbound_documents
        (id,document_no,company_code,house_code,production_date,scope_id,kind,original_document_id,intent_key,
          handover_ref,creation_hash,payload,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [next, `${old.kind==='INBOUND'?'PIN':'PIR'}-${next}`, old.company_code, old.house_code, old.production_date,
          scope.id, old.kind, old.original_document_id, intentKey, old.handover_ref, hash, JSON.stringify(payload), actor]);
      await m.query(`INSERT INTO production_inbound_reissues
        (predecessor_id,successor_id,company_code,intent_key,predecessor_version,requested_by) VALUES($1,$2,$3,$4,$5,$6)`,
        [id,next,old.company_code,intentKey,version,actor]);
      return {outcome:'DRAFT' as const, documentId:next};
    });
  }

  private sourceDraftItems(items: FrozenItem[]): InboundDraftItem[] {
    return items.map(item => ({gradeCode:item.gradeCode,specCode:item.specCode,quantity:item.quantity,
      allocations:item.sources.map(a => ({dailyLogId:a.dailyLogId,quantity:a.quantity,evidenceFileId:String(a.snapshot.evidenceFileId)}))}));
  }

  private requireCurrentPostingDate(d: Document): void {
    if (d.expected_posting_date !== singaporeBusinessDate()) throw new ConflictException({
      code:'PRODUCTION_POSTING_DAY_CHANGED', documentId:d.id, message:'已跨新加坡记账日，请按原单续制后重新核对'
    });
  }
  private checkSubmission(d: Document, key: string, hash: string) {
    if (d.submit_key !== key || d.content_hash !== hash) throw new ConflictException('提交键或冻结摘要不一致，请先查询原回执');
  }
  async post(id: string, submitKey: string, contentHash: string) {
    const before = await this.identity(id); this.checkSubmission(before,submitKey,contentHash);
    if (before.state === 'POSTED') return before.receipt;
    const actor = this.actor();
    return this.db.transaction(async m => {
      const scope = await this.lockDay(m,before,false);
      const replay=await this.identity(id,m); this.checkSubmission(replay,submitKey,contentHash);
      if (replay.state==='POSTED') return replay.receipt;
      if (!hasPerm((this.cls.get('user') as any)?.permissions,'MENU_PROD_INBOUND','E')) throw new ForbiddenException('缺少正式交库过账权限');
      if (scope.state!=='ACTIVE') throw new ConflictException('正式范围已暂停新过账');
      const reports = await this.reports(m,before);
      const d = await this.currentDocument(m,id); this.checkSubmission(d,submitKey,contentHash);
      if (d.state === 'POSTED') return d.receipt;
      if (d.kind === 'REVERSAL') return this.postReversal(m,d,actor);
      if (d.state !== 'READY') throw new ConflictException('交库单尚未冻结或状态已变化');
      this.requireCurrentPostingDate(d);
      const periodVersion=await this.inboundPeriodVersion(m,d.company_code,d.expected_posting_date);
      // Old frozen documents lack a period snapshot. Version 2+ proves an intervening close/reopen or change.
      if (d.payload.periodVersion===undefined ? periodVersion>1 : d.payload.periodVersion!==periodVersion) {
        throw new ConflictException({code:'PRODUCTION_PERIOD_CHANGED',message:'冻结后记账期间已变化，请重新核对单据'});
      }
      const recheck = await this.freezeItems(m,{ ...d,payload:{ ...d.payload,items:this.sourceDraftItems(d.payload.items) } },reports);
      const items = d.payload.items as FrozenItem[];
      const profileKeys = ['profileCode','productMode','varietyCode','houseCode','companyCode','farmCode','siteCode','effectiveDate'];
    if (profileKeys.some(key => d.payload.profile?.[key] !== recheck.profile[key]) ||
      recheck.items.length !== items.length || recheck.items.some((item,i) => item.skuCode !== items[i].skuCode || item.productCode !== items[i].productCode
        || item.varietyCode !== items[i].varietyCode || item.inventoryStatus !== items[i].inventoryStatus
        || item.sourceDomainId !== items[i].sourceDomainId
        || item.sources.some((a,n) => a.reportHash !== items[i].sources[n]?.reportHash
          || a.snapshot.evidenceChecksum!==items[i].sources[n]?.snapshot.evidenceChecksum
          || a.snapshot.handoverId!==items[i].sources[n]?.snapshot.handoverId
          || a.snapshot.handoverContentHash!==items[i].sources[n]?.snapshot.handoverContentHash))) {
        throw new ConflictException('冻结后日报或主数据已变化，请重新确认单据');
      }
      const batches: any[] = [];
      for (let i=0; i<items.length; i++) {
        const item = items[i]; const lineNo = i+1;
        const batch = await withFormalProductionLine(m,{ documentId:id,documentNo:d.document_no,lineNo,
          scopeId:scope.id,companyCode:d.company_code,houseCode:d.house_code,productionDate:d.production_date,
          postingDate:d.expected_posting_date,
          gradeCode:item.gradeCode,skuCode:item.skuCode,productCode:item.productCode,quantity:item.quantity,
          contentHash,actor,allocations:item.sources }, () => this.inventory.createProductionBatch({
          companyCode:d.company_code,houseCode:d.house_code,warehouseCode:d.payload.warehouseCode,
          locationCode:d.payload.locationCode,eggDate:d.production_date,productCode:item.productCode,
          postingDate:d.expected_posting_date,
          skuCode:item.skuCode,gradeCodeStd:item.gradeCode,qualityGrade:item.gradeCode,specCode:item.specCode,
          packagingSpec:item.specCode,varietyCode:item.varietyCode,sourceProfileCode:d.payload.profile.profileCode,
          farmCode:d.payload.profile.farmCode,siteCode:d.payload.profile.siteCode,qty:item.quantity,
          inventoryStatus:item.inventoryStatus as any,sourceType:'TEMP_PRODUCTION',sourceNo:d.document_no,
          collectionBatchRef:`HOUSE-${d.house_code}`,ledgerChangeType:INV_LEDGER_CHANGE_TYPE.TEMP_PRODUCTION_INBOUND,
        },m));
        const ledgers = await m.query(`SELECT id FROM inv_ledger WHERE batch_no=$1 AND ref_no=$2
          AND change_type='TEMP_PRODUCTION_INBOUND' AND qty_change=$3`,[batch.batch_no,d.document_no,item.quantity]);
        if (ledgers.length !== 1) throw new ConflictException('库存原流水无法唯一对应本次单行');
        await m.query(`INSERT INTO production_inbound_lines(document_id,line_no,grade_code,sku_code,product_code,spec_code,
          quantity,warehouse_code,location_code,batch_no,inventory_ledger_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id,lineNo,item.gradeCode,item.skuCode,item.productCode,item.specCode,item.quantity,d.payload.warehouseCode,d.payload.locationCode,batch.batch_no,ledgers[0].id]);
        for (const a of item.sources) await m.query(`INSERT INTO production_inbound_allocations(id,document_id,line_no,
          daily_log_id,report_hash,quantity,direction,source_key,source_link_id,source_snapshot)
          VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9)`, [randomUUID(),id,lineNo,a.dailyLogId,a.reportHash,a.quantity,
          a.snapshot.sourceKey,a.snapshot.sourceLinkId,JSON.stringify(a.snapshot)]);
        batches.push({ lineNo,batchNo:batch.batch_no,gradeCode:item.gradeCode,quantity:item.quantity,inventoryLedgerId:String(ledgers[0].id) });
      }
      const receipt = { documentId:id,documentNo:d.document_no,companyCode:d.company_code,houseCode:d.house_code,
        eggDate:d.production_date,postingDate:d.expected_posting_date,contentHash,submitKey,batches,
        totalInbound:items.reduce((n,item) => n+item.quantity,0) };
      await m.query(`UPDATE production_inbound_documents SET state='POSTED',version=version+1,receipt=$2,posted_at=now()
        WHERE id=$1`,[id,JSON.stringify(receipt)]); return receipt;
    });
  }
  async createReversal(originalId: string, input: { intentKey:string;reason:string;
    segments:Array<{ allocationId:string;quantity:number }>;evidenceFileIds:string[] }) {
    const original = await this.identity(originalId); text(input.intentKey,'创建意图'); text(input.reason,'冲销依据',1000);
    if (!Array.isArray(input.segments) || !input.segments.length || input.segments.length>100
      || new Set(input.segments.map(s => s.allocationId)).size !== input.segments.length) throw new BadRequestException('须逐段选择原来源且不得重复');
    for (const s of input.segments) { text(s.allocationId,'原分配'); count(s.quantity); }
    const evidenceFileIds = [...new Set((input.evidenceFileIds ?? []).map(id => text(id,'冲销证据')))];
    if (!evidenceFileIds.length) throw new BadRequestException('冲销须有实物及差异依据附件');
    const creationHash = productionContentHash({ originalId,...input,evidenceFileIds });
    const actor = this.actor();
    return this.db.transaction(async m => {
      await this.lockCreation(m,original.company_code,input.intentKey);
      await this.lockDay(m,original);
      const prior = await m.query('SELECT * FROM production_inbound_documents WHERE company_code=$1 AND intent_key=$2', [original.company_code,input.intentKey]);
      if (prior.length) { this.authorize(prior[0].company_code,prior[0].payload.warehouseCode);
        if (prior[0].creation_hash!==creationHash) throw new ConflictException('同一冲销意图内容不同'); return prior[0]; }
      const current = await this.currentDocument(m,originalId);
      if (current.kind !== 'INBOUND' || current.state !== 'POSTED') throw new ConflictException('只能冲销已过账的正式原入库单');
      const allocations = await m.query(`SELECT a.*,l.grade_code,l.sku_code,l.product_code,l.spec_code,l.batch_no,
        l.quantity AS original_line_quantity,l.warehouse_code,l.location_code FROM production_inbound_allocations a
        JOIN production_inbound_lines l ON l.document_id=a.document_id AND l.line_no=a.line_no
        WHERE a.document_id=$1 AND a.direction=1 AND a.id=ANY($2::uuid[]) ORDER BY a.line_no,a.id`,
      [originalId,input.segments.map(s => s.allocationId)]);
      if (allocations.length !== input.segments.length) throw new BadRequestException('冲销分段不属于该正式原单');
      const items: any[] = [];
      for (const a of allocations) {
        const quantity = input.segments.find(s => s.allocationId===a.id)!.quantity;
        const item = items.find(i => i.originalLineNo===a.line_no) ?? (() => {
          const i = { originalLineNo:a.line_no,gradeCode:a.grade_code,skuCode:a.sku_code,productCode:a.product_code,
            specCode:a.spec_code,batchNo:a.batch_no,originalLineQuantity:a.original_line_quantity,
            inventoryStatus:current.payload.items[a.line_no-1].inventoryStatus,quantity:0,sources:[] as any[] };
          items.push(i); return i;
        })();
        item.quantity+=quantity; item.sources.push({ originalAllocationId:a.id,dailyLogId:Number(a.daily_log_id),
          quantity,reportHash:a.report_hash,sourceLinkId:a.source_link_id,sourceKey:a.source_key,sourceSnapshot:a.source_snapshot });
      }
      const id=randomUUID(); const payload={ warehouseCode:current.payload.warehouseCode,locationCode:current.payload.locationCode,
        reason:input.reason,evidenceFileIds,originalContentHash:current.content_hash,items };
      const [doc]=await m.query(`INSERT INTO production_inbound_documents(id,document_no,company_code,house_code,production_date,
        scope_id,kind,original_document_id,intent_key,creation_hash,payload,created_by)
        VALUES($1,$2,$3,$4,$5,$6,'REVERSAL',$7,$8,$9,$10,$11) RETURNING *`,
      [id,`PIR-${id}`,current.company_code,current.house_code,current.production_date,current.scope_id,originalId,input.intentKey,creationHash,JSON.stringify(payload),actor]);
      return doc;
    });
  }
  private async validateReversal(m: EntityManager,d: Document) {
    const original = await this.identity(d.original_document_id,m);
    if (original.state!=='POSTED' || original.kind!=='INBOUND' || original.content_hash!==d.payload.originalContentHash) throw new ConflictException('原单凭证或摘要不一致');
    const [creator]=await m.query('SELECT username FROM sys_user WHERE user_id::text=$1',[d.payload.evidenceOwnerId ?? d.created_by]);
    const evidence=await m.query(`SELECT file_id,checksum FROM file_metadata WHERE file_id=ANY($1::text[])
      AND status='ACTIVE' AND deleted_at IS NULL AND module_code='PRODUCTION_INBOUND' AND owner_type='HOUSE'
      AND owner_id=$2 AND company_code=$3 AND uploaded_by=$4 AND visibility IN ('PROTECTED','PRIVATE')
      AND checksum ~ '^[a-f0-9]{64}$' ORDER BY file_id FOR SHARE`,
    [d.payload.evidenceFileIds,d.house_code,d.company_code,creator?.username ?? '']);
    if (evidence.length!==d.payload.evidenceFileIds.length||(d.state!=='DRAFT'||d.payload.evidenceChecksums!=null)
      && stableProductionJson(evidence)!==stableProductionJson(d.payload.evidenceChecksums)) throw new ConflictException('冲销实物交接及差异证据已失效或变化');
    if (d.state==='DRAFT') d.payload.evidenceChecksums=evidence;
    const batchNos=(d.payload.items as any[]).map(i => i.batchNo).sort();
    await lockQuantityPools(m,d.payload.items.map((i:any) => ({ company:d.company_code,warehouses:[d.payload.warehouseCode],
      snapshot:{ productCode:i.productCode,gradeCode:i.gradeCode,baseUnit:'枚' } })));
    const batches=await m.query('SELECT * FROM inv_batches WHERE batch_no=ANY($1::text[]) ORDER BY batch_no FOR UPDATE',[batchNos]);
    await assertOfficialInventoryBatches(m,batchNos);
    for (const item of d.payload.items) {
      const batch=batches.find((b:any) => b.batch_no===item.batchNo);
      const [reversed]=await m.query(`SELECT COALESCE(SUM(a.quantity),0)::int AS quantity FROM production_inbound_allocations a
        JOIN production_inbound_documents doc ON doc.id=a.document_id AND doc.state='POSTED'
        JOIN production_inbound_allocations original ON original.id=a.original_allocation_id
        WHERE original.document_id=$1 AND original.line_no=$2 AND a.direction=-1`, [original.id,item.originalLineNo]);
      const originalRemaining=Number(item.originalLineQuantity)-Number(reversed.quantity);
      if (!batch || batch.company_code!==d.company_code || batch.warehouse_code!==d.payload.warehouseCode
        || batch.location_code!==d.payload.locationCode || Number(batch.qty)!==originalRemaining || batch.status!==item.inventoryStatus
        || Number(batch.qty_available)!==(item.inventoryStatus==='AVAILABLE'?originalRemaining:0) ) {
        throw new ConflictException('原批实物、状态或可用量已有下游变动/占用，先完成核对和解除');
      }
      for (const a of item.sources) {
        const [row]=await m.query(`SELECT original.quantity,original.daily_log_id,original.source_link_id,
          COALESCE((SELECT SUM(r.quantity) FROM production_inbound_allocations r
            JOIN production_inbound_documents doc ON doc.id=r.document_id AND doc.state='POSTED'
            WHERE r.original_allocation_id=original.id AND r.direction=-1),0)::int AS reversed
          FROM production_inbound_allocations original WHERE original.id=$1 AND original.document_id=$2
            AND original.line_no=$3 AND original.direction=1`, [a.originalAllocationId,original.id,item.originalLineNo]);
        if (!row || Number(row.daily_log_id)!==a.dailyLogId || row.source_link_id!==a.sourceLinkId) {
          throw new ConflictException('原冲销分段身份已变化');
        }
        const remaining=Number(row.quantity)-Number(row.reversed);
        if (a.quantity>remaining) throw new ConflictException({code:'PRODUCTION_REVERSAL_CAPACITY',
          message:'冲销累计超过原来源分段',gradeCode:item.gradeCode,dailyLogId:a.dailyLogId,remaining});
      }
    }
    if ((await m.query('SELECT 1 FROM production_batch_roots WHERE root_batch_no=ANY($1::text[]) LIMIT 1',[batchNos])).length) {
      throw new ConflictException('原批已派生调拨/包装/退货子批，请先核对下游补偿');
    }
    // Reference-only writers share batch locks. Unknown or non-cancelled obligations hold.
    const referenceFields: Record<string,string[]>={ wms_outbound:['batch_no'],wms_outbound_items:['batch_no'],
      wms_transfer:['batch_no'],wms_transfer_items:['source_batch_no','target_batch_no'],wms_stocktake:['batch_no','item'],
      wms_defect_dispositions:['batch_no','target_batch_no'],store_sale_allocations:['batch_no'],
      sal_order_item_batch_allocations:['batch_no'],qa_product_inspections:['batch_no'],qa_non_conformance:['batch_no'],qa_inspections:['batch_no'],lbl_records:['batch_no'],
      pkg_source_batches:['batch_code','source_inbound_no'] };
    for (const [table,fields] of Object.entries(referenceFields)) {
      const [exists]=await m.query('SELECT to_regclass($1) AS relation',[table]); if (!exists?.relation) continue;
      const quality=table.startsWith('qa_');
      if (quality) {
        const [guard]=await m.query(`SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass($1)
          AND tgname='trg_quality_production_refs' AND tgenabled IN ('O','A')`,[table]);
        if (!guard) throw new ConflictException({code:'PRODUCTION_QUALITY_LOCK_UNAVAILABLE',
          message:'质检引用尚未启用批次锁，请联系质检负责人'});
      }
      const jsonReferences=table==='qa_inspections'
        ? " OR production_inspection_refs(to_jsonb(ref)->>'items_json',to_jsonb(ref)->>'fail_items_json') && $1::text[]"
        : '';
      const rows=await m.query(`SELECT to_jsonb(ref) AS fact FROM ${table} ref
        WHERE (${fields.map(field=>`btrim(to_jsonb(ref)->>'${field}')=ANY($1::text[])`).join(' OR ')}${jsonReferences}) ${quality?'':'FOR SHARE'}`,
      [[...batchNos,original.document_no]]);
      for (const { fact } of rows) {
        if (table==='sal_order_item_batch_allocations' && Number(fact.outbound_qty ?? 0)===0
          && Number(fact.reserved_qty ?? 0)<=Number(fact.released_qty ?? 0)) continue;
        if (!['CANCELLED','CANCELED','VOID'].includes(String(fact.status ?? fact.batch_status ?? '').trim().toUpperCase())) {
          throw new ConflictException({ code:'PRODUCTION_REVERSAL_DOWNSTREAM_HOLD',message:quality?'原单仍有质检引用，请联系质检负责人核对解除':'原单仍有下游或在途引用，请先核对解除' });
        }
      }
    }
    // ERP never writes into Chanjet. Any local voucher association needs separate finance resolution.
    const [voucherSchema]=await m.query("SELECT to_regclass('chanjet_voucher_drafts') AS relation");
    if (voucherSchema?.relation) {
      const [voucher]=await m.query(`SELECT 1 FROM chanjet_voucher_drafts v WHERE EXISTS(
        SELECT 1 FROM unnest($1::text[]) token WHERE position(token IN to_jsonb(v)::text)>0) LIMIT 1`,
      [[original.document_no,...batchNos]]);
      if (voucher) throw new ConflictException('原生产单已有财务凭证引用，请先取得独立财务处置回执');
    }
    return { original,batches };
  }
  private async readyReversal(m: EntityManager,d: Document,submitKey: string,scope: Document) {
    await this.validateReversal(m,d);
    const payload={ ...d.payload,scopeVersion:scope.version }; const day=singaporeBusinessDate();
    const hash=productionContentHash({ documentNo:d.document_no,originalDocumentId:d.original_document_id,
      postingDate:day,payload });
    const [result]=await m.query(`WITH changed AS (UPDATE production_inbound_documents SET state='READY',version=version+1,
      content_hash=$2,submit_key=$3,expected_posting_date=$4,payload=$5,ready_at=now() WHERE id=$1 RETURNING *) SELECT * FROM changed`,
    [d.id,hash,submitKey,day,JSON.stringify(payload)]); return result;
  }
  async recordFinancialClearance(id: string,input: { contentHash:string;financialEvidenceFileId:string;periodStatus:'OPEN';
    reviewHash?:string;costs:Array<{ batchNo:string;costStatus:'UNKNOWN'|'CONFIRMED';unitCost?:number|null;unitCostDecimal?:string|null }> }) {
    const before=await this.identity(id); const actor=this.actor(); const user=this.cls.get('user') as any;
    const signingMenu=financeSigningMenu(user?.permissions);
    if (!hasPerm(user?.permissions,signingMenu,'E')) throw new ForbiddenException('须由独立财务负责人核验成本和未关账期间');
    return this.db.transaction(async m => {
      await this.lockDay(m,before); await this.reports(m,before); const d=await this.currentDocument(m,id);
      if (d.kind!=='REVERSAL'||d.state!=='READY'||d.content_hash!==input.contentHash||actor===d.created_by
        || d.expected_posting_date!==singaporeBusinessDate()||input.periodStatus!=='OPEN') throw new ConflictException('财务核验须绑定原单、冻结摘要和当日未关账期间且不得自核');
      const exact=signingMenu===FINANCE_REVIEW || input.reviewHash!==undefined || input.financialEvidenceFileId.startsWith(FINANCE_PROOF_PREFIX);
      if(exact)await requireReviewFile(m,'reversal',id,input.financialEvidenceFileId);
      const { batches }=await this.validateReversal(m,d);
      const periods=await this.postingPeriods(m,d);
      if(exact) {
        const qualifications=await m.query('SELECT batch_no,cost_status FROM production_batch_qualifications WHERE batch_no=ANY($1::text[]) FOR SHARE',
          [batches.map((b:any)=>b.batch_no)]);
        const statuses=new Map(qualifications.map((q:any)=>[q.batch_no,q.cost_status]));
        const quantities=new Map(d.payload.items.map((item:any)=>[item.batchNo,String(item.quantity)]));
        const current=reviewSnapshotHash(d.content_hash,periods.map((p:any)=>({month:p.periodMonth,version:p.version,checksum:p.evidenceChecksum})),
          batches.map((b:any)=>({batch:b.batch_no,quantity:String(quantities.get(b.batch_no)),decimal:b.unit_cost==null?null:String(b.unit_cost),status:statuses.get(b.batch_no)??'UNKNOWN'})));
        if(input.reviewHash!==current || !Array.isArray(input.costs) || input.costs.some(c=>c.costStatus!==(statuses.get(c.batchNo)??'UNKNOWN')))
          throw new ConflictException('成本或期间与所查看的核签摘要不一致，请重新核验');
      }
      if (!Array.isArray(input.costs)||input.costs.length!==batches.length||new Set(input.costs.map(c=>c.batchNo)).size!==batches.length) throw new BadRequestException('须逐批确认实际已核价或成本待核定状态');
      const costs=batches.map((b:any) => {
        const c=input.costs.find(x=>x.batchNo===b.batch_no);
        const originalCost=recordedCost(b.unit_cost);
        if (!c||!['UNKNOWN','CONFIRMED'].includes(c.costStatus)
          || (exact?c.unitCostDecimal!==(b.unit_cost==null?null:String(b.unit_cost)):c.unitCost!==originalCost)||c.costStatus==='CONFIRMED'&&originalCost===null) throw new ConflictException('财务核验成本与原批记录不一致');
        return { batchNo:b.batch_no,costStatus:c.costStatus,recordedUnitCost:originalCost,
          recordedUnitCostDecimal:b.unit_cost==null?null:String(b.unit_cost) };
      });
      const [reviewer]=await m.query('SELECT username FROM sys_user WHERE user_id::text=$1',[actor]);
      const [file]=await m.query(`SELECT file_id,checksum FROM file_metadata WHERE file_id=$1 AND status='ACTIVE' AND deleted_at IS NULL
        AND module_code='PRODUCTION_INBOUND' AND owner_type='HOUSE' AND owner_id=$2 AND company_code=$3
        AND visibility IN ('PROTECTED','PRIVATE') AND uploaded_by=$4 AND checksum ~ '^[a-f0-9]{64}$' FOR SHARE`,
      [input.financialEvidenceFileId,d.house_code,d.company_code,reviewer?.username ?? '']);
      if (!file) throw new ConflictException('财务签认须有本人上传、对应原单/成本/记账期间的受保护核验回执');
      const clearanceHash=productionContentHash({documentId:id,contentHash:d.content_hash,periods,costs,
        evidenceFileId:file.file_id,evidenceChecksum:file.checksum,signedBy:actor});
      const [prior]=await m.query('SELECT * FROM production_financial_clearances WHERE document_id=$1 AND signed_by=$2 AND clearance_hash=$3',[id,actor,clearanceHash]);
      if(prior)return prior;
      const [clearance]=await m.query(`INSERT INTO production_financial_clearances(id,document_id,company_code,house_code,content_hash,
        original_content_hash,posting_date,period_status,costs,evidence_file_id,evidence_checksum,signed_by,period_versions,clearance_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,'OPEN',$8,$9,$10,$11,$12,$13) RETURNING *`, [randomUUID(),id,d.company_code,d.house_code,
        d.content_hash,d.payload.originalContentHash,d.expected_posting_date,JSON.stringify(costs),file.file_id,file.checksum,actor,JSON.stringify(periods),clearanceHash]);
      return clearance;
    });
  }
  private async financialClearance(m: EntityManager,d: Document,id: string) {
    const [clearance]=await m.query(`SELECT c.*,c.posting_date::text AS posting_date FROM production_financial_clearances c
      JOIN file_metadata f ON f.file_id=c.evidence_file_id AND f.checksum=c.evidence_checksum AND f.status='ACTIVE' AND f.deleted_at IS NULL
        AND f.module_code='PRODUCTION_INBOUND' AND f.owner_type='HOUSE' AND f.owner_id=c.house_code AND f.company_code=c.company_code
        AND f.visibility IN ('PROTECTED','PRIVATE')
      JOIN sys_user u ON u.user_id::text=c.signed_by AND u.username=f.uploaded_by AND u.status::text IN ('1','ACTIVE')
      WHERE c.id=$1 AND c.document_id=$2 FOR SHARE OF c,f,u`,[id,d.id]);
    if (!clearance||clearance.signed_by===d.created_by||clearance.company_code!==d.company_code||clearance.house_code!==d.house_code
      || clearance.content_hash!==d.content_hash||clearance.original_content_hash!==d.payload.originalContentHash
      || clearance.posting_date!==d.expected_posting_date||clearance.period_status!=='OPEN') throw new ConflictException('原单、成本、期间或独立财务核验凭据已变化/失效');
    const periods=await this.postingPeriods(m,d);
    if(stableProductionJson(periods)!==stableProductionJson(clearance.period_versions))throw new ConflictException('审批后记账期间已变化，须重新财务核验');
    const batches=await m.query('SELECT batch_no,unit_cost FROM inv_batches WHERE batch_no=ANY($1::text[]) ORDER BY batch_no FOR UPDATE',
      [d.payload.items.map((i:any)=>i.batchNo)]);
    if (clearance.costs.length!==batches.length||batches.some((b:any)=>!clearance.costs.some((c:any)=>c.batchNo===b.batch_no
      && c.recordedUnitCost===recordedCost(b.unit_cost)&&['UNKNOWN','CONFIRMED'].includes(c.costStatus)
      && (c.recordedUnitCostDecimal===undefined||c.recordedUnitCostDecimal===(b.unit_cost==null?null:String(b.unit_cost)))
      && (c.costStatus!=='CONFIRMED'||c.recordedUnitCost!==null)))) throw new ConflictException('原成本快照已变化，须重新财务核验');
    return clearance;
  }
  async approveReversal(id: string,version: number,contentHash: string,financialClearanceId: string) {
    const before=await this.identity(id); const actor=this.actor(); const user=this.cls.get('user') as any;
    if (!hasPerm(user?.permissions,'MENU_PROD_INBOUND','A')) {
      throw new ForbiddenException('正式原单冲销须由具备独立审核及财务核验权限的负责人签认');
    }
    return this.db.transaction(async m => {
      await this.lockDay(m,before); await this.reports(m,before);
      const d=await this.currentDocument(m,id); this.version(d,version);
      if (d.kind!=='REVERSAL'||d.state!=='READY'||d.content_hash!==contentHash||d.created_by===actor) throw new ConflictException('原单冲销须绑定冻结摘要且不得自批');
      this.requireCurrentPostingDate(d);
      await this.validateReversal(m,d);
      const clearance=await this.financialClearance(m,d,financialClearanceId);
      if(clearance.signed_by===actor)throw new ConflictException('业务审批与财务核签必须由不同实名人员办理');
      const evidence={ clearanceId:clearance.id,financialReviewer:clearance.signed_by,
        reviewer:actor,contentHash,postingDate:d.expected_posting_date };
      const [result]=await m.query(`WITH changed AS (UPDATE production_inbound_documents SET state='APPROVED',version=version+1,
        approved_by=$2,approved_hash=content_hash,approval_evidence=$3 WHERE id=$1 RETURNING *) SELECT * FROM changed`,
      [id,actor,JSON.stringify(evidence)]); return result;
    });
  }
  private async postReversal(m: EntityManager,d: Document,actor: string) {
    this.requireCurrentPostingDate(d);
    if (d.state!=='APPROVED'||d.approved_by===d.created_by||d.approved_hash!==d.content_hash||!d.approval_evidence
      ||d.approval_evidence.reviewer!==d.approved_by||d.approval_evidence.contentHash!==d.content_hash) throw new ConflictException('冲销须有同日、同摘要的独立业务及财务审核');
    if (!(await m.query("SELECT 1 FROM sys_user WHERE user_id::text=$1 AND status::text IN ('1','ACTIVE') FOR SHARE",[d.approved_by])).length) {
      throw new ConflictException('独立审核人身份已失效，请重新核验');
    }
    const { batches }=await this.validateReversal(m,d); const lines:any[]=[];
    const clearance=await this.financialClearance(m,d,d.approval_evidence.clearanceId);
    if(clearance.signed_by===d.approved_by)throw new ConflictException('须取得独立业务与财务核签');
    for (let i=0;i<d.payload.items.length;i++) {
      const item=d.payload.items[i]; const lineNo=i+1; const batch=batches.find((b:any)=>b.batch_no===item.batchNo);
      await m.query("SELECT set_config('phoenix.egg_disposition','REVERSAL',true)");
      const n=await guardedBatchUpdate(m,{ batchNo:item.batchNo,companyCode:d.company_code,warehouseCode:d.payload.warehouseCode,
        deltaQty:-item.quantity,deltaAvailable:item.inventoryStatus==='AVAILABLE'?-item.quantity:undefined,requireStatus:item.inventoryStatus });
      await m.query("SELECT set_config('phoenix.egg_disposition','',true)");
      if (n!==1) throw new ConflictException('原批数量已变化，请重新核对');
      const confirmed=clearance.costs.find((c:any)=>c.batchNo===item.batchNo)?.costStatus==='CONFIRMED';
      const costChange=confirmed?(await m.query('SELECT (-$1::numeric*unit_cost)::text AS amount FROM inv_batches WHERE batch_no=$2',[item.quantity,item.batchNo]))[0].amount:null;
      const ledgerId=await writeInvLedger(m,{ batchNo:item.batchNo,changeType:INV_LEDGER_CHANGE_TYPE.PRODUCTION_INBOUND_REVERSAL,
        qtyChange:-item.quantity,operator:actor,storeCode:null,companyCode:d.company_code,warehouseCode:d.payload.warehouseCode,
        locationCode:d.payload.locationCode,refNo:d.document_no,note:JSON.stringify({ originalDocumentId:d.original_document_id,
          originalLineNo:item.originalLineNo,contentHash:d.content_hash,approvedBy:d.approved_by,approvalEvidence:d.approval_evidence }),
        qualityGrade:item.gradeCode,skuCode:item.skuCode,unit:batch.unit,logDate:d.expected_posting_date,
        costChange,businessType:'FORMAL_PRODUCTION_REVERSAL' });
      if (!Number.isSafeInteger(ledgerId)||ledgerId<=0) throw new ConflictException('冲销库存原流水未持久化');
      await m.query(`INSERT INTO production_inbound_lines(document_id,line_no,grade_code,sku_code,product_code,spec_code,
        quantity,warehouse_code,location_code,batch_no,inventory_ledger_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [d.id,lineNo,item.gradeCode,item.skuCode,item.productCode,item.specCode,item.quantity,d.payload.warehouseCode,d.payload.locationCode,item.batchNo,ledgerId]);
      for (const a of item.sources) await m.query(`INSERT INTO production_inbound_allocations(id,document_id,line_no,original_allocation_id,
        daily_log_id,report_hash,quantity,direction,source_key,source_link_id,source_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,-1,$8,$9,$10)`,
      [randomUUID(),d.id,lineNo,a.originalAllocationId,a.dailyLogId,a.reportHash,a.quantity,
        `PIR:${d.id}:${lineNo}:${a.originalAllocationId}`,a.sourceLinkId,JSON.stringify(a.sourceSnapshot)]);
      lines.push({ lineNo,batchNo:item.batchNo,gradeCode:item.gradeCode,quantity:item.quantity,inventoryLedgerId:String(ledgerId) });
    }
    const receipt={ documentId:d.id,documentNo:d.document_no,originalDocumentId:d.original_document_id,contentHash:d.content_hash,
      submitKey:d.submit_key,postingDate:d.expected_posting_date,batches:lines,totalReversed:lines.reduce((n,l)=>n+l.quantity,0) };
    await m.query("UPDATE production_inbound_documents SET state='POSTED',version=version+1,receipt=$2,posted_at=now() WHERE id=$1",[d.id,JSON.stringify(receipt)]);
    return receipt;
  }
  private async stockScope(company: string, house: string, day: string, warehouse: string): Promise<StockTraceScope> {
    text(company,'公司'); text(house,'鸡舍'); text(warehouse,'仓库'); assertEggDate(day);
    this.authorize(company,warehouse);
    await this.context(company,house);
    return {company,warehouse,house,day,authority:this.cls.get('dataScope') as DataScopeContext};
  }

  private async readStockScope(m: EntityManager, scope: StockTraceScope) {
    const [active] = await m.query(`SELECT 1 FROM production_cutover_scopes s
      JOIN wms_warehouses w ON w.company_code=s.company_code AND w.warehouse_code=$4
      WHERE s.company_code=$1 AND s.house_code=$2 AND s.state IN ('ACTIVE','SUSPENDED')
        AND s.first_production_date<=$3::date LIMIT 1`,
      [scope.company,scope.house,scope.day,scope.warehouse]);
    if (!active) throw new ConflictException('测试期记录已归档或该范围尚未启用');
  }

  async stockBatches(company:string,house:string,day:string,warehouse:string,filter:StockBatchFilter) {
    const limit = validateStockFilter(filter);
    const scope = await this.stockScope(company,house,day,warehouse);
    return this.db.transaction('REPEATABLE READ',async m => {
      await this.readStockScope(m,scope);
      const {sql,args} = await stockBatchQuery(m,scope,filter,limit+1);
      const rows: StockBatch[] = await m.query(sql,args);
      const items = rows.slice(0,limit);
      return {stockBasisVersion:2,items,nextCursor:rows.length>limit ? items[limit-1].batchNo : null};
    });
  }

  async exportStockBatches(company:string,house:string,day:string,warehouse:string,filter:StockBatchFilter,
    consume:(lines:AsyncIterable<string>)=>Promise<void>) {
    validateStockFilter(filter);
    const scope = await this.stockScope(company,house,day,warehouse);
    await this.db.transaction('REPEATABLE READ', async m => {
      await m.query('SET TRANSACTION READ ONLY');
      await this.readStockScope(m,scope);
      const {sql,args} = await stockBatchQuery(m,scope,{...filter,after:undefined});
      await m.query('DECLARE stock_trace_export NO SCROLL CURSOR FOR '+sql,args);
      async function* csv() {
        yield '\uFEFF批次,档位,仓库,库位,SKU,单位,库存状态,库存分类,整批实存,可用量,本舍日归属量,归属状态,已授权来源\r\n';
        for (;;) {
          const rows: StockBatch[] = await m.query('FETCH FORWARD 200 FROM stock_trace_export');
          if (!rows.length) return;
          for (const row of rows) {
            yield [row.batchNo,row.gradeCode,row.warehouseCode,row.locationCode,row.skuCode,row.unit,row.status,
              row.inventoryClass,row.batchQty,row.availableQty,row.attributableQty,row.attribution,JSON.stringify(row.sources)]
              .map(stockCsvCell).join(',')+'\r\n';
          }
        }
      }
      await consume(csv());
    });
  }

  async balance(company: string,house: string,day: string,warehouse: string) {
    const stockScope = await this.stockScope(company,house,day,warehouse);
    return this.db.transaction(async m => {
      const identity = { company_code:company,house_code:house,production_date:day,payload:{ warehouseCode:warehouse } };
      const scope = await this.lockDay(m,identity,false,false);
      const {reports,sourceReviewRequired} = await inspectProductionSourceReports(m,{companyCode:company,houseCode:house,productionDate:day});
      const usage = await this.usage(m,identity);
      const grades: Record<string,{ reported:number;posted:number;remaining:number }> = {};
      const sourceBalances = [];
      for (const r of reports) for (const [gradeCode,confirmedQty] of Object.entries<number>(r.eggs_by_grade)) {
        const key = sourceQuotaKey(r.id,gradeCode);
        const quota = sourceQuota(confirmedQty,usage.get(key));
        usage.delete(key);
        sourceBalances.push({dailyLogId:Number(r.id),shift:r.shift,gradeCode,productionDate:r.production_date,
          flockNo:r.flock_no,occupancyId:r.occupancy_id,...quota});
        const item = grades[gradeCode] ??= {reported:0,posted:0,remaining:0};
        item.reported+=quota.confirmedQty;
        item.posted+=quota.ordinaryNet+quota.rawUsedQty;
        item.remaining+=quota.remaining;
      }
      if (usage.size) throw new ConflictException({code:'PRODUCTION_SOURCE_QUOTA_REVIEW_REQUIRED',
        message:'存在无法核对日报或档位的已过账来源，请核对原单及补偿'});
      const stock = await stockByGrade(m,stockScope);
      for (const grade of Object.keys(grades)) {
        stock[grade] ??= {attributableQty:0,knownAttributableQty:0,warehouseQty:0,mixedBatchCount:0,unmeasuredBatchCount:0};
      }
      return { scopeId:scope.id,scopeState:scope.state,firstProductionDate:scope.first_production_date,grades,sourceBalances,sourceReviewRequired,
        stockBasisVersion:2,stockByGrade:stock,
        currentStock:Object.fromEntries(Object.entries(stock).filter(([,v])=>v.attributableQty!==null)
          .map(([grade,v])=>[grade,v.attributableQty])),
        reports:reports.map(r => ({ id:r.id,shift:r.shift,reportHash:r.report_hash,grades:r.eggs_by_grade })) };
    });
  }
}
