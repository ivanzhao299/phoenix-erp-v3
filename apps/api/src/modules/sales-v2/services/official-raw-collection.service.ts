import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource,EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { hasPerm,PermCode } from '../../../auth/permissions.util';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { SkuAvailabilityService } from '../../product-master/services/sku-availability.service';
import { singaporeBusinessDate } from '../../wms/temp-production-reversal';
import { assertEggDate } from './egg-inventory.service';
import { lockProductionSourceReports,lockProductionHandoverEvidence,productionContentHash,lockProductionEntryMode,lockRawCollectionReference,assertRawCollectionTotals } from './production-source-facts';

type Fact=Record<string,any>;
export interface RawCollectionInput {companyCode:string;houseCode:string;productionDate:string;warehouseCode:string;sourceBatchId:string;handoverId:string;intentKey:string}
const text=(v:unknown):string=>{if(typeof v!=='string'||!v.trim()||v!==v.trim()||v.length>128)throw new BadRequestException('原始收蛋身份无效');return v;};
const quantity=(v:unknown):number=>{const n=Number(v);if(v===null||v===undefined||v===''||!Number.isSafeInteger(n)||n<=0||n>2147483647)throw new ConflictException('原始收蛋数量必须为实际整数枚');return n;};

/** A physical receipt is a provenance root, not an invented inv_batches parent or a stock admission. */
@Injectable()
export class OfficialRawCollectionService {
  constructor(@InjectDataSource() private readonly db:DataSource,private readonly cls:ClsService,private readonly skus:SkuAvailabilityService){}
  private authorize(company:string,warehouse:string,operation:PermCode='V'){
    const user=this.cls.get('user') as Fact|undefined,scope=this.cls.get('dataScope') as DataScopeContext|undefined;
    const permission=operation==='V'?(['V','C','E','A'] as PermCode[]).some(p=>hasPerm(user?.permissions,'MENU_PROD_INBOUND',p))
      :hasPerm(user?.permissions,'MENU_PROD_INBOUND',operation);
    if(!permission||!scope||typeof scope.isGlobal!=='boolean'
      ||!scope.isGlobal&&(!Array.isArray(scope.allowedCompanyCodes)||!Array.isArray(scope.allowedWarehouseCodes)
        ||!scope.allowedCompanyCodes.includes(company)||!scope.allowedWarehouseCodes.includes(warehouse)))
      throw new ForbiddenException('缺少该公司及仓库原始收蛋操作权限');
    const id=String(user?.userId??user?.id??'');if(!id||!user?.username)throw new ForbiddenException('缺少实名收蛋操作人');return id;
  }
  private async identity(id:string,m:Pick<DataSource,'query'>=this.db){
    const [d]=await m.query('SELECT *,production_date::text AS production_date,expected_posting_date::text AS expected_posting_date FROM production_raw_receipts WHERE id=$1',[text(id)]);
    if(!d)throw new NotFoundException('原始收蛋单不存在');this.authorize(d.company_code,d.warehouse_code);return d;
  }
  private async lockBoundary(m:EntityManager,d:Fact){
    if(!m.queryRunner?.isTransactionActive)throw new ConflictException('RAW_RECEIPT_TRANSACTION_REQUIRED');
    await m.query("SELECT pg_advisory_xact_lock(hashtextextended('packaging-chain:false',0))");
    await m.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1))",[d.house_code]);
    const [scope]=await m.query(`SELECT *,first_production_date::text AS first_production_date FROM production_cutover_scopes s
      WHERE company_code=$1 AND house_code=$2 AND state='ACTIVE' AND EXISTS(SELECT 1 FROM production_inventory_domains domain
        WHERE domain.scope_id=s.id AND domain.company_code=$1 AND domain.warehouse_code=$3) FOR SHARE`,[d.company_code,d.house_code,d.warehouse_code]);
    if(!scope||d.scope_id&&scope.id!==d.scope_id||d.production_date<scope.first_production_date)throw new ConflictException('正式原始收蛋范围尚未启用或已暂停');
    this.authorize(d.company_code,d.warehouse_code);return scope;
  }
  private async facts(m:EntityManager,d:Fact){
    const owner=await new OrgOwnershipService(m).resolveHouseIdentity(d.house_code);
    if(owner.companyCode!==d.company_code)throw new ForbiddenException('收蛋鸡舍与公司实际归属不一致');
    const [warehouse]=await m.query("SELECT 1 FROM wms_warehouses WHERE warehouse_code=$1 AND company_code=$2 AND status='ACTIVE' FOR SHARE",[d.warehouse_code,d.company_code]);
    if(!warehouse)throw new ConflictException('原始收蛋仓库未启用或归属不一致');
    const profile=await this.skus.resolveSourceProfile({companyCode:d.company_code,houseCode:d.house_code,eggDate:d.production_date,
      farmCode:owner.farmCode,siteCode:owner.siteCode},m);
    const source=await lockRawCollectionReference(m,String(d.source_batch_id),{companyCode:d.company_code,houseCode:d.house_code,productionDate:d.production_date});
    const mode=await lockProductionEntryMode(m,source.shift_site_id,d.company_code);
    if(mode!=='PACKAGING_INBOUND')throw new ConflictException('原始收蛋须明确采用包装首次入库路径，不能重复临时生产来源');
    if((await m.query('SELECT 1 FROM brd_egg_source_receipts WHERE source_key=$1 LIMIT 1',[`PACKAGING:${source.id}`])).length)
      throw new ConflictException('该实际采集原行已被原包装来源账认领，须按原事实核验，不能再次收蛋');
    if((await m.query(`SELECT 1 FROM pkg_grading_source_links l JOIN pkg_grading_records g ON g.id=l.grading_id
      WHERE l.source_batch_id=$1 AND g.is_test=false AND COALESCE(to_jsonb(g)->>'status','ACTIVE')<>'VOID' LIMIT 1`,[d.source_batch_id])).length)
      throw new ConflictException('该采集原行已存在分级实耗关系，须先核验原在制和下游，不能作为新收蛋认领');
    const [{tokens}]=await m.query('SELECT array_remove(array_agg(official_raw_reference_token(v)),NULL) AS tokens FROM unnest($1::text[]) v',[[source.batch_code,source.source_inbound_no]]);
    if((await m.query(`SELECT 1 FROM inv_batches WHERE official_raw_reference_token(batch_no)=ANY($1::text[]) OR official_raw_reference_token(source_no)=ANY($1::text[]) LIMIT 1`,[tokens])).length)
      throw new ConflictException('已存在库存来源须按实际父批领用，不能再次声明为独立原始集蛋');
    const [schema]=await m.query("SELECT to_regclass('wms_inbound') AS header");
    if(schema?.header&&(await m.query(`SELECT 1 FROM wms_inbound h WHERE official_raw_reference_token(to_jsonb(h)->>'task_no')=ANY($1::text[])
      OR official_raw_reference_token(to_jsonb(h)->>'inbound_no')=ANY($1::text[]) LIMIT 1`,[tokens])).length)throw new ConflictException('已有仓库入库引用须逐实际原行领用，不能作为独立采集收据');
    const reports=await lockProductionSourceReports(m,{companyCode:d.company_code,houseCode:d.house_code,productionDate:d.production_date});
    const grades=await m.query("SELECT grade_code FROM product_grades g WHERE status='ACTIVE' AND COALESCE((to_jsonb(g)->>'stock_managed')::boolean,true) FOR SHARE");
    if(!grades.length||reports.some(r=>grades.some((g:Fact)=>!Object.prototype.hasOwnProperty.call(r.eggs_by_grade,g.grade_code))))
      throw new ConflictException('原始收蛋须有完整分级日报，未填不能当作零');
    if(source.flock_code&&reports.some(r=>r.flock_no!==source.flock_code))throw new ConflictException('采集记录鸡群与原始日报占栏不一致');
    if((await m.query(`SELECT 1 FROM brd_medication_records WHERE flock_no=ANY($1::text[]) AND status<>'CANCELLED'
      AND start_date<=$2 AND(withdraw_until IS NULL OR withdraw_until>=$2) LIMIT 1`,[[...new Set(reports.map(r=>r.flock_no))],d.production_date])).length)
      throw new ConflictException('用药或休药来源须先完成受限质检处置');
    const [handover]=await m.query('SELECT *,production_date::text AS production_date FROM production_physical_handovers WHERE id=$1 FOR SHARE',[d.handover_id]);
    if(!handover||handover.state!=='CONFIRMED'||handover.company_code!==d.company_code||handover.house_code!==d.house_code
      ||handover.production_date!==d.production_date||handover.scope_id!==d.scope_id||handover.payload.warehouseCode!==d.warehouse_code
      ||handover.created_by===handover.confirmed_by)throw new ConflictException('须有同舍同日、收发双方已签认的实际分段交接');
    if(handover.payload.rawCollection?.sourceBatchId!==source.id||handover.payload.rawCollection.shiftId!==source.shift_id
      ||handover.payload.rawCollection.batchCode!==source.batch_code||handover.payload.rawCollection.sourceHash!==productionContentHash(source)
      ||productionContentHash(handover.payload.rawCollection.sourceSnapshot)!==productionContentHash(source))
      throw new ConflictException('双方交接未签认该实际采集原行及包装班次，不能事后配给另一原行');
    if((await m.query(`SELECT 1 FROM production_inbound_documents WHERE company_code=$1 AND handover_ref=$2
      AND kind='INBOUND' AND state<>'CANCELLED' LIMIT 1`,[d.company_code,handover.handover_ref])).length)
      throw new ConflictException('该次交接已绑定生产入库单，须先核验原路径，不能两路重复认领');
    const sources=handover.payload.sources as Fact[];
    if(!Array.isArray(sources)||!sources.length)throw new ConflictException('缺少明确的班次分段');
    if((await m.query("SELECT 1 FROM brd_egg_source_receipts WHERE daily_log_id=ANY($1::bigint[]) AND source_key LIKE 'PACKAGING:%' LIMIT 1",[[...new Set(sources.map(s=>s.dailyLogId))]])).length)
      throw new ConflictException('该日报存在旧包装认领，缺少可核验的逐档实耗分配，不能猜测剩余原始收蛋额度');
    await lockProductionHandoverEvidence(m,{companyCode:d.company_code,houseCode:d.house_code},sources,handover.created_by);
    for(const s of sources){const r=reports.find(r=>Number(r.id)===s.dailyLogId);
      if(!r||r.report_hash!==s.reportHash||r.occupancy_id!==s.occupancyId||r.flock_no!==s.flockNo
        ||quantity(s.quantity)>Number(r.eggs_by_grade[s.gradeCode]??0))throw new ConflictException('原始收蛋分段与已签日报、占栏、等级或数量不一致');}
    const total=assertRawCollectionTotals(source,sources as Array<{gradeCode:string;quantity:number}>);
    const [route]=await m.query('SELECT entry_mode FROM brd_egg_day_routes WHERE company_code=$1 AND house_code=$2 AND production_date=$3',
      [d.company_code,d.house_code,d.production_date]);
    if(route&&route.entry_mode!=='PACKAGING')throw new ConflictException('同一舍日已经采用临时生产入库，不能重复认领原始集蛋');
    return {quantity:total,source,profile:{profileCode:profile.profileCode,productMode:profile.productMode,varietyCode:profile.varietyCode,
      houseCode:profile.houseCode,farmCode:profile.farmCode,siteCode:profile.siteCode??null},handoverHash:handover.content_hash,sources};
  }
  async create(input:RawCollectionInput){
    for(const value of Object.values(input))text(value);assertEggDate(input.productionDate);
    if(!/^[1-9]\d{0,18}$/.test(input.sourceBatchId)||BigInt(input.sourceBatchId)>9223372036854775807n)throw new BadRequestException('采集原行ID无效');
    const actor=this.authorize(input.companyCode,input.warehouseCode,'C'),hash=productionContentHash(input);
    return this.db.transaction(async m=>{
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`raw-collection-intent:${input.companyCode}:${input.intentKey}`]);
      const [prior]=await m.query('SELECT * FROM production_raw_receipts WHERE company_code=$1 AND intent_key=$2',[input.companyCode,input.intentKey]);
      if(prior){if(prior.creation_hash!==hash)throw new ConflictException('原创建意图内容已改变');return prior;}
      const d={company_code:input.companyCode,house_code:input.houseCode,production_date:input.productionDate,warehouse_code:input.warehouseCode,
        source_batch_id:input.sourceBatchId,handover_id:input.handoverId};
      const scope=await this.lockBoundary(m,d);await this.facts(m,{...d,scope_id:scope.id});
      if((await m.query("SELECT 1 FROM production_raw_receipts WHERE(source_batch_id=$1 OR handover_id=$2) AND state<>'CANCELLED' LIMIT 1",[input.sourceBatchId,input.handoverId])).length)
        throw new ConflictException('该实际采集或交接已有原始收蛋单，请查询原单，不要另建重复意图');
      const id=randomUUID();
      const [created]=await m.query(`INSERT INTO production_raw_receipts(id,document_no,company_code,house_code,production_date,warehouse_code,
        scope_id,source_batch_id,handover_id,intent_key,creation_hash,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'{}',$12) RETURNING *`,
        [id,`RAW-${id}`,input.companyCode,input.houseCode,input.productionDate,input.warehouseCode,scope.id,input.sourceBatchId,input.handoverId,input.intentKey,hash,actor]);return created;
    });
  }
  async get(id:string){const d=await this.identity(id);return {...d,segments:await this.db.query('SELECT * FROM production_raw_receipt_segments WHERE receipt_id=$1 ORDER BY daily_log_id,grade_code',[id])};}
  async list(company:string,house:string,date:string,warehouse:string){
    this.authorize(text(company),text(warehouse));text(house);assertEggDate(date);
    return this.db.query(`SELECT id,document_no,state,version,company_code,house_code,warehouse_code,created_by,
      production_date::text AS production_date,content_hash,source_batch_id::text,posted_at,receipt FROM production_raw_receipts
      WHERE company_code=$1 AND house_code=$2 AND production_date=$3 AND warehouse_code=$4 ORDER BY created_at DESC`,[company,house,date,warehouse]);
  }
  async sources(company:string,house:string,date:string,warehouse:string){
    this.authorize(text(company),text(warehouse));text(house);assertEggDate(date);
    const owner=await new OrgOwnershipService(this.db.manager).resolveHouseIdentity(house);
    if(owner.companyCode!==company)throw new ForbiddenException('鸡舍不属于所选公司');
    return this.db.query(`SELECT s.id::text,s.batch_code,s.received_qty::text,s.production_date::text AS production_date FROM pkg_source_batches s
      WHERE s.house_code=$1 AND s.production_date=$2 AND s.batch_status='RECEIVED' AND s.is_test=false
      AND NOT EXISTS(SELECT 1 FROM production_raw_receipts r WHERE r.source_batch_id=s.id AND r.state<>'CANCELLED')
      ORDER BY s.id`,[house,date]);
  }
  async ready(id:string,version:number,submitKey:string){
    text(submitKey);const identity=await this.identity(id),actor=this.authorize(identity.company_code,identity.warehouse_code,'E');
    return this.db.transaction(async m=>{
      await this.lockBoundary(m,identity);const [d]=await m.query('SELECT *,production_date::text AS production_date,expected_posting_date::text AS expected_posting_date FROM production_raw_receipts WHERE id=$1 FOR UPDATE',[id]);
      if(d.state!=='DRAFT'||d.version!==version)throw new ConflictException('原始收蛋版本或状态已变化');
      if((await m.query('SELECT 1 FROM production_raw_receipts WHERE company_code=$1 AND submit_key=$2 AND id<>$3 LIMIT 1',[d.company_code,submitKey,id])).length)
        throw new ConflictException('该提交身份已用于另一原始收蛋单，请保留原单并使用新的提交意图');
      const payload=await this.facts(m,d),postingDate=singaporeBusinessDate(),contentHash=productionContentHash({id:d.id,scopeId:d.scope_id,company:d.company_code,house:d.house_code,
        productionDate:d.production_date,warehouse:d.warehouse_code,postingDate,payload});
      const [frozen]=await m.query(`WITH changed AS(UPDATE production_raw_receipts SET state='READY',version=version+1,payload=$2,content_hash=$3,submit_key=$4,expected_posting_date=$5,ready_at=now(),ready_by=$6
        WHERE id=$1 RETURNING *) SELECT * FROM changed`,[id,JSON.stringify(payload),contentHash,submitKey,postingDate,actor]);return frozen;
    });
  }
  async approve(id:string,version:number,hash:string){
    const identity=await this.identity(id),actor=this.authorize(identity.company_code,identity.warehouse_code,'A');
    return this.db.transaction(async m=>{
      await this.lockBoundary(m,identity);const [d]=await m.query('SELECT * FROM production_raw_receipts WHERE id=$1 FOR UPDATE',[id]);
      if(d.state!=='READY'||d.version!==version||d.content_hash!==hash||d.created_by===actor||d.ready_by===actor)throw new ConflictException('须由独立审核人确认冻结原始收蛋摘要');
      const [approved]=await m.query(`WITH changed AS(UPDATE production_raw_receipts SET state='APPROVED',version=version+1,approved_by=$2,approved_hash=content_hash,approved_at=now()
        WHERE id=$1 RETURNING *) SELECT * FROM changed`,[id,actor]);return approved;
    });
  }
  async post(id:string,submitKey:string,hash:string){
    const identity=await this.identity(id);
    if(identity.submit_key!==submitKey||identity.content_hash!==hash)throw new ConflictException('原始收蛋提交身份不一致');
    if(identity.state==='POSTED')return identity.receipt;
    this.authorize(identity.company_code,identity.warehouse_code,'E');
    return this.db.transaction(async m=>{
      await this.lockBoundary(m,identity);const [d]=await m.query('SELECT *,production_date::text AS production_date,expected_posting_date::text AS expected_posting_date FROM production_raw_receipts WHERE id=$1 FOR UPDATE',[id]);
      if(d.state==='POSTED')return d.receipt;
      if(d.state!=='APPROVED'||d.approved_hash!==hash||d.content_hash!==hash||d.submit_key!==submitKey)throw new ConflictException('原始收蛋尚未独立审核或原摘要不符');
      if(d.expected_posting_date!==singaporeBusinessDate())throw new ConflictException('收蛋冻结单已跨新加坡记账日，请取消未过账单并重新核验');
      if(!(await m.query("SELECT 1 FROM sys_user WHERE user_id::text=$1 AND status::text IN ('1','ACTIVE') FOR SHARE",[d.approved_by])).length)
        throw new ConflictException('原始收蛋审核实名身份已失效');
      const fresh=await this.facts(m,d);
      if(productionContentHash(fresh)!==productionContentHash(d.payload))throw new ConflictException('原始收蛋事实已变化，请取消后重新核验');
      await m.query(`INSERT INTO brd_egg_day_routes(company_code,house_code,production_date,entry_mode)
        VALUES($1,$2,$3,'PACKAGING') ON CONFLICT DO NOTHING`,[d.company_code,d.house_code,d.production_date]);
      for(const source of d.payload.sources){
        const [capacity]=await m.query(`SELECT COALESCE((r.eggs_by_grade->>$2)::integer,0) AS reported,
          (SELECT COALESCE(SUM(s.quantity),0) FROM production_raw_receipt_segments s WHERE s.daily_log_id=r.id AND s.grade_code=$2)::int AS used
          FROM brd_daily_logs r WHERE r.id=$1`,[source.dailyLogId,source.gradeCode]);
        if(!capacity||Number(capacity.used)+source.quantity>Number(capacity.reported))throw new ConflictException({code:'RAW_RECEIPT_GRADE_CAPACITY',
          gradeCode:source.gradeCode,dailyLogId:source.dailyLogId,remaining:Number(capacity?.reported??0)-Number(capacity?.used??0)});
        const [dayUsed]=await m.query('SELECT COALESCE(SUM(quantity),0)::int AS n FROM brd_egg_source_receipts WHERE daily_log_id=$1',[source.dailyLogId]);
        const [report]=await m.query('SELECT eggs_by_grade FROM brd_daily_logs WHERE id=$1',[source.dailyLogId]);
        const total=Object.values(report.eggs_by_grade as Record<string,number>).reduce((n,q)=>n+Number(q),0);
        if(Number(dayUsed.n)+source.quantity>total)throw new ConflictException('日报实际收蛋总额度已被原有效来源占用，不能重复认领');
        const key=`RAW:${d.id}:${source.id}`;
        await m.query(`INSERT INTO brd_egg_source_receipts(company_code,source_key,daily_log_id,occupancy_id,house_code,production_date,quantity,entry_mode)
          VALUES($1,$2,$3,$4,$5,$6,$7,'PACKAGING')`,[d.company_code,key,source.dailyLogId,source.occupancyId,d.house_code,d.production_date,source.quantity]);
        await m.query(`INSERT INTO production_raw_receipt_segments(id,receipt_id,company_code,handover_line_id,daily_log_id,occupancy_id,flock_no,grade_code,
          quantity,report_hash,source_key,evidence_file_id,evidence_checksum,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [randomUUID(),d.id,d.company_code,source.id,source.dailyLogId,source.occupancyId,source.flockNo,source.gradeCode,source.quantity,source.reportHash,key,
            source.evidenceFileId,source.evidenceChecksum,JSON.stringify(source)]);
      }
      const receipt={documentId:d.id,documentNo:d.document_no,quantity:d.payload.quantity,postingDate:singaporeBusinessDate(),inventoryCreated:false};
      await m.query(`UPDATE production_raw_receipts SET state='POSTED',version=version+1,posting_date=$2,posted_at=now(),receipt=$3 WHERE id=$1`,
        [id,receipt.postingDate,JSON.stringify(receipt)]);return receipt;
    });
  }
  async cancel(id:string,version:number){
    const d=await this.identity(id),actor=this.authorize(d.company_code,d.warehouse_code,'E');
    const [cancelled]=await this.db.query(`WITH changed AS(UPDATE production_raw_receipts SET state='CANCELLED',version=version+1,cancelled_by=$3,cancelled_at=now()
      WHERE id=$1 AND version=$2 AND state IN ('DRAFT','READY','APPROVED') RETURNING *) SELECT * FROM changed`,[id,version,actor]);
    if(!cancelled)throw new ConflictException('原始收蛋已过账或版本已变化，不能直接作废或复用');return cancelled;
  }
}
