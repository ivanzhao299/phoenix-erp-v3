import { assertReportGradeCoverage, normalizeReportGrades, requiredReportGrades } from './daily-report-grades';
import { FileAccessService } from '../file/file-access.service';
import { effectiveExactProductionByGrade, effectiveProductionReceiptQuantity, refreshDailyFlockLayRate } from './effective-production-source';
import { hydrateMenuRegistry } from '../../common/guards/menu-registry.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { hasPerm } from '../../auth/permissions.util';
import { birdCount } from './daily-stock-policy';
import { flockHandoverBlockers } from './flock-handover-blockers';
import { assertHouseTurnaround, HOUSE_TURNAROUND_EVIDENCE, turnaroundBoundary } from './flock-house-turnaround';
import { resolveHouseCapacity } from './house-capacity';
import { OrgScope, scopeWhere } from './farm.service';

export type FlockActor = { id: string; permissions?: string[]; admin?: boolean };
export const FLOCK_ACTION_MENUS = {
  create: 'MENU_FLOCK_CREATE', submit: 'MENU_FLOCK_CREATE', approve: 'MENU_FLOCK_APPROVE', post: 'MENU_FLOCK_POST',
  cancel: 'MENU_FLOCK_CREATE', BASELINE: 'MENU_FLOCK_BASELINE', ADJUST: 'MENU_FLOCK_ADJUST', REVERSE: 'MENU_FLOCK_REVERSE',
  REPORT_CORRECTION:'MENU_FLOCK_REPORT', HISTORY_AUTH: 'MENU_FLOCK_HISTORY', CLOSE: 'MENU_FLOCK_CLOSE', CLEAN_START: 'MENU_FLOCK_CLEAN', CLEAN_ACCEPT: 'MENU_FLOCK_CLEAN',
} as const;
const kinds = ['BASELINE','ADMIT','MORTALITY','CULL','SELL_HELD','TRANSFER','ADJUST','REVERSE','CLOSE','CLEAN_START','CLEAN_ACCEPT','HISTORY_AUTH','REPORT_CORRECTION'];
const payloadFields = new Set(['kind','sourceKey','houseCode','flockNo','businessDate','quantity','expectedVersion',
  'expectedHeldVersion','expectedHouseVersion','expectedLegacyQty','reason','evidence','responsible','differenceReceipt',
  'sourceCode','breedCode','placementAge','plannedEliminationDate','targetHouseCode','heldId','positionCode','salesRef',
  'disposalMethod','receiver','originalDocumentId','replacementKind','replacementQuantity','periodApprovalRef','periodFrom','periodTo','authorizedSourceKey','customerCode','unitPrice','currencyCode','sourceKind','sourceFarmCode','sourceReceipt','dailyLogId','expectedReportHash','correction','finalProductionStatus']);
const text = (v: unknown, label: string): string => {
  if (typeof v!=='string' || !v.trim() || v!==v.trim() || v.length>1000) throw new BadRequestException(`${label}必填且不能含首尾空格`);
  return v;
};
export function flockBusinessDate(v: unknown): string {
  if (typeof v!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v.startsWith('0000-')
    || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10)!==v) throw new BadRequestException('日期必须为真实YYYY-MM-DD');
  return v;
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v==='object') return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical((v as Record<string,unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** All quantity writes go through this ledger; historical activation is explicit per flock/house. */
@Injectable()
export class FlockLifecycleService {
  constructor(@InjectEntityManager() private readonly db: EntityManager,@Optional() private readonly files?: FileAccessService) {}

  private permit(actor: FlockActor, action: keyof typeof FLOCK_ACTION_MENUS, approval = false) {
    if (!actor.id || actor.id==='unknown') throw new ForbiddenException('缺少实名操作人');
    if (!actor.admin && !hasPerm(actor.permissions,FLOCK_ACTION_MENUS[action],approval?'A':'E')) throw new ForbiddenException('缺少鸡群生命周期动作权限');
  }
  private special(actor: FlockActor, kind: string) {
    if (kind in FLOCK_ACTION_MENUS) this.permit(actor,kind as keyof typeof FLOCK_ACTION_MENUS,true);
  }
  private async house(m: EntityManager, code: string, scope: OrgScope) {
    const [h] = await m.query(`SELECT h.house_code,h.farm_code,h.capacity,h.max_capacity,h.status,f.company_code,
      COALESCE(f.mapped_site_code,'') AS site_code,f.status AS farm_status
      FROM brd_houses h JOIN brd_farms f ON f.farm_code=h.farm_code WHERE h.house_code=$1`,[code]);
    if (!h) throw new NotFoundException('鸡舍不存在');
    if (!scope.isGlobal && !((scope.farmCodes?.length?scope.farmCodes:[scope.farmCode]).includes(h.farm_code)
      || (scope.siteCodes?.length?scope.siteCodes:[scope.siteCode]).includes(h.site_code)
      || scope.companyCodes?.includes(h.company_code))) throw new ForbiddenException('无权访问该公司/场区/农场的鸡舍');
    if (!h.company_code) throw new BadRequestException('鸡舍缺少权威公司归属');
    return h;
  }
  private async audit(m: EntityManager, doc: any, action: string, actor: FlockActor, version: number) {
    await m.query('INSERT INTO brd_flock_document_audits(id,document_id,action,actor,version) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(),doc.id,action,actor.id,version]);
  }
  private normalize(input: Record<string,any>) {
    if (!input || Array.isArray(input) || Object.keys(input).some(k=>!payloadFields.has(k))) throw new BadRequestException('单据含非法字段');
    const p = {...input};
    if (!kinds.includes(p.kind)) throw new BadRequestException('单据类型无效');
    for (const k of ['sourceKey','houseCode','reason']) p[k]=text(p[k],k);
    if (p.sourceKey.length>120) throw new BadRequestException('幂等来源长度超过120');
    p.businessDate=flockBusinessDate(p.businessDate);
    p.expectedVersion=birdCount(p.expectedVersion,'余额版本');
    if (['CLEAN_START','CLEAN_ACCEPT','ADMIT'].includes(p.kind)) p.expectedHouseVersion=birdCount(p.expectedHouseVersion,'鸡舍版本');
    if (!['ADMIT','CLEAN_START','CLEAN_ACCEPT'].includes(p.kind)) p.flockNo=text(p.flockNo,'鸡群');
    if (['ADMIT','BASELINE','MORTALITY','CULL','SELL_HELD'].includes(p.kind)) {
      p.quantity=birdCount(p.quantity,'数量');
      if (p.quantity<1 && p.kind!=='BASELINE') throw new BadRequestException('数量必须大于0');
    }
    if (p.kind==='ADJUST') {
      if (typeof p.quantity!=='number' || !Number.isSafeInteger(p.quantity) || p.quantity===0) throw new BadRequestException('盘点差额必须为非零整数');
    }
    if (['CLOSE','HISTORY_AUTH','REPORT_CORRECTION','BASELINE','ADJUST','REVERSE','CLEAN_ACCEPT','ADMIT','MORTALITY','CULL','SELL_HELD'].includes(p.kind)) {
      if (!Array.isArray(p.evidence) || !p.evidence.length || p.evidence.length>20
        || p.evidence.some((e: unknown)=>typeof e!=='string' || !/^FILE-[A-Za-z0-9._:-]+$/.test(e))) {
        throw new BadRequestException('请上传业务证据附件，不接受手填外部URL');
      }
      p.responsible=text(p.responsible,'责任人');
    }
    if (['REPORT_CORRECTION','BASELINE','ADJUST','REVERSE'].includes(p.kind)) p.differenceReceipt=text(p.differenceReceipt,'差异处理回执');
    if (p.kind==='BASELINE') p.expectedLegacyQty=birdCount(p.expectedLegacyQty,'旧余额核对数');
    if (p.kind==='ADMIT') {
      p.sourceKind=p.sourceKind??'SUPPLIER';
      if(!['SUPPLIER','INTERNAL'].includes(p.sourceKind)) throw new BadRequestException('入栏来源类型无效');
      if(p.sourceKind==='SUPPLIER')p.sourceCode=text(p.sourceCode,'供应商');
      else p.sourceFarmCode=text(p.sourceFarmCode,'内部育成来源农场');
      p.sourceReceipt=text(p.sourceReceipt,'真实入栏来源交接单号');
      p.breedCode=text(p.breedCode,'遗传品种');
      p.placementAge=birdCount(p.placementAge,'入栏日龄');
      if (p.plannedEliminationDate) p.plannedEliminationDate=flockBusinessDate(p.plannedEliminationDate);
    }
    if (p.kind==='MORTALITY') { p.disposalMethod=text(p.disposalMethod,'处置方式'); p.receiver=text(p.receiver,'接收确认人'); }
    if (p.kind==='CULL') p.positionCode=text(p.positionCode,'待售鸡实际位置');
    if (p.kind==='TRANSFER') p.targetHouseCode=text(p.targetHouseCode,'目标鸡舍');
    if (p.kind==='SELL_HELD') {
      p.heldId=text(p.heldId,'待售批次'); p.salesRef=text(p.salesRef,'销售交付/结算引用');
      p.customerCode=text(p.customerCode,'客户');p.currencyCode=text(p.currencyCode,'币种');
      if(typeof p.unitPrice!=='number' || !Number.isFinite(p.unitPrice) || p.unitPrice<=0 || p.unitPrice>999999999) throw new BadRequestException('单价必须为有效正数');
      p.receiver=text(p.receiver,'客户签收人');
      p.expectedHeldVersion=birdCount(p.expectedHeldVersion,'待售余额版本');
    }
    if(p.kind==='CLOSE'&&!['REPORTED','CONFIRMED_ZERO'].includes(p.finalProductionStatus))throw new BadRequestException('最后产蛋确认方式无效');
    if(p.kind==='CLOSE'&&p.finalProductionStatus==='CONFIRMED_ZERO'){if(!p.evidence?.length)throw new BadRequestException('零产蛋须有签认附件');p.responsible=text(p.responsible,'责任人');}
    if(p.kind==='REPORT_CORRECTION'){
      p.dailyLogId=birdCount(p.dailyLogId,'原日报编号');
      if(typeof p.expectedReportHash!=='string'||(p.dailyLogId===0?p.expectedReportHash!=='ABSENT':! /^[a-f0-9]{64}$/.test(p.expectedReportHash)))throw new BadRequestException('请选择完整原日报快照');
      const c=p.correction;if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['eggsByGrade','feedConsumed','waterConsumed','notes'].includes(k)))throw new BadRequestException('日报更正字段无效');
      if(!c.eggsByGrade||typeof c.eggsByGrade!=='object'||Array.isArray(c.eggsByGrade)||!Object.keys(c.eggsByGrade).length)throw new BadRequestException('请输入真实分级数量');
      normalizeReportGrades(c.eggsByGrade);
      for(const k of ['feedConsumed','waterConsumed'])if(c[k]!==null&&(typeof c[k]!=='number'||!Number.isFinite(c[k])||c[k]<0||c[k]>1e9))throw new BadRequestException('实际料水用量须为有效非负数');
      if(typeof c.notes!=='string'||c.notes.length>4000)throw new BadRequestException('备注长度超过限制');
    }
    if (p.kind==='HISTORY_AUTH') {
      p.periodFrom=flockBusinessDate(p.periodFrom);p.periodTo=flockBusinessDate(p.periodTo);p.authorizedSourceKey=text(p.authorizedSourceKey,'被授权业务来源');
      if(p.periodFrom>p.periodTo) throw new BadRequestException('授权日期区间无效');
    }
    if (p.kind==='REVERSE') {
      p.originalDocumentId=text(p.originalDocumentId,'原单');
      if (p.replacementKind!==undefined) {
        if (!['MORTALITY','CULL','ADJUST'].includes(p.replacementKind)) throw new BadRequestException('更正类型无效');
        if (!Number.isSafeInteger(p.replacementQuantity)) throw new BadRequestException('更正数量必须为整数');
        if (p.replacementKind!=='ADJUST' && p.replacementQuantity<0) throw new BadRequestException('更正死淘不能小于零');
      }
    }
    return p;
  }

  async create(input: Record<string,any>, scope: OrgScope, actor: FlockActor) {
    this.permit(actor,'create');
    const p=this.normalize(input); this.special(actor,p.kind);
    const h=await this.house(this.db,p.houseCode,scope);
    if (p.targetHouseCode) {
      const t=await this.house(this.db,p.targetHouseCode,scope);
      if (t.company_code!==h.company_code || t.house_code===h.house_code) throw new BadRequestException('一期仅支持同公司整群转入其他空舍');
    }
    await this.validateEvidence(this.db,p,h,actor.id);
    const hash=createHash('sha256').update(canonical(p)).digest('hex');
    return this.db.transaction(async m=>{
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`flock-doc:${h.company_code}:${p.sourceKey}`]);
      const [prior]=await m.query('SELECT *,business_date::text AS business_date FROM brd_flock_documents WHERE company_code=$1 AND source_key=$2',[h.company_code,p.sourceKey]);
      if (prior) {
        if (prior.content_hash!==hash) throw new ConflictException('相同幂等来源内容不同');
        await this.house(m,prior.house_code,scope); return prior;
      }
      if(p.kind==='REPORT_CORRECTION'){
        await m.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1))",[p.houseCode]);
        const row=p.dailyLogId?await this.reportSnapshot(m,p.dailyLogId):null;
        if(p.dailyLogId){await this.assertReportIdentity(row,{...p,companyCode:h.company_code},m);if(this.reportHash(row)!==p.expectedReportHash)throw new ConflictException('原日报已变化，请刷新后重新制单');}
        else if((await m.query('SELECT 1 FROM brd_daily_logs WHERE house_code=$1 AND log_date=$2 LIMIT 1',[p.houseCode,p.businessDate])).length)throw new ConflictException('该舍日已有日报，请选择原日报更正');
        const [o]=await m.query('SELECT id FROM brd_flock_occupancies WHERE house_code=$1 AND flock_no=$2 AND began_on<=$3 AND (ended_on IS NULL OR ended_on>$3)',[p.houseCode,p.flockNo,p.businessDate]);
        if(!o)throw new BadRequestException('无法证明该业务日真实占栏，不得补造旧日报来源');
        p.originalReport=row;p.originalOccupancyId=o.id;
        const [zero]=await m.query("SELECT id,content_hash,payload FROM brd_flock_documents WHERE kind='CLOSE' AND status='POSTED' AND flock_no=$1 AND house_code=$2 AND business_date=$3",[p.flockNo,p.houseCode,p.businessDate]);
        if(!row&&zero&&zero.payload.finalProductionStatus!=='CONFIRMED_ZERO')throw new BadRequestException('关闭声明已有日报但原记录缺失，请先专项核对');
        if(zero?.payload.finalProductionStatus==='CONFIRMED_ZERO')p.originalZeroConfirmation={documentId:zero.id,contentHash:zero.content_hash,statement:'CONFIRMED_ZERO',businessDate:p.businessDate};
      }
      const id=randomUUID();
      const [doc]=await m.query(`INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,site_code,
        house_code,flock_no,business_date,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *,business_date::text AS business_date`,
        [id,p.sourceKey,hash,p.kind,h.company_code,h.farm_code,h.site_code,h.house_code,p.kind==='ADMIT'?`FLK-${id}`:p.flockNo??'',p.businessDate,p,actor.id]);
      await this.audit(m,doc,'CREATE',actor,0); return doc;
    });
  }

  private async reportSnapshot(m:EntityManager,id:number){
    const [r]=await m.query(`SELECT id,flock_no,house_code,log_date::text AS log_date,shift,occupancy_id,eggs_by_grade,eggs_produced,
      dirty_eggs,broken_eggs,feed_consumed,water_consumed,note AS notes,opening_qty,closing_qty,mortality_qty,elimination_qty
      FROM brd_daily_logs WHERE id=$1 FOR UPDATE`,[id]);return r;
  }
  private reportHash(row:any){return createHash('sha256').update(canonical(row)).digest('hex');}
  private async assertReportIdentity(row:any,p:any,m:EntityManager){
    if(!row||!row.occupancy_id||row.flock_no!==p.flockNo||row.house_code!==p.houseCode||row.log_date!==p.businessDate)throw new BadRequestException('仅可更正已接续且占栏身份明确的原日报；未知历史须专项核对');
    if(row.shift!=='DAILY') {
      const [schema]=await m.query("SELECT to_regclass('production_cutover_scopes') AS scopes");
      const active=schema?.scopes?await m.query(`SELECT 1 FROM production_cutover_scopes s JOIN sys_dict shift
        ON shift.dict_type='PRODUCTION_REPORT_SHIFT' AND shift.dict_code=$4 AND shift.status='ACTIVE'
        WHERE s.company_code=$1 AND s.house_code=$2 AND s.first_production_date<=$3 AND s.state='ACTIVE'`,
      [p.companyCode??row.company_code,p.houseCode,p.businessDate,row.shift]):[];
      if(!active.length)throw new BadRequestException('原班次不属于已启用的正式多班范围');
    }
    if((await m.query(`SELECT 1 FROM brd_daily_logs WHERE house_code=$1 AND log_date=$2 AND ${row.shift==='DAILY'?"shift<>'DAILY'":"shift='DAILY'"} LIMIT 1`,[p.houseCode,p.businessDate])).length)throw new BadRequestException('舍日汇总与班次记录重复覆盖，请先核对');
  }
  async occupancies(scope:OrgScope){const params:any[]=[];const where=scopeWhere(scope,params,'o.');return this.db.query(`SELECT o.id AS occupancy_id,o.flock_no,o.house_code,o.began_on::text AS began_on,o.ended_on::text AS ended_on FROM brd_flock_occupancies o ${where?'WHERE '+where:''} ORDER BY o.began_on DESC LIMIT 1000`,params);}
  async reports(scope:OrgScope){
    const params:any[]=[];const where=scopeWhere(scope,params,'o.');
    const rows=await this.db.query(`SELECT d.id,d.flock_no,d.house_code,d.log_date::text AS log_date,d.shift,d.occupancy_id,d.eggs_by_grade,d.eggs_produced,
      d.dirty_eggs,d.broken_eggs,d.feed_consumed,d.water_consumed,d.note AS notes,d.opening_qty,d.closing_qty,d.mortality_qty,d.elimination_qty
      FROM brd_daily_logs d JOIN brd_flock_occupancies o ON o.id=d.occupancy_id AND o.flock_no=d.flock_no AND o.house_code=d.house_code
      AND o.began_on<=d.log_date AND (o.ended_on IS NULL OR o.ended_on>d.log_date)
      ${where?'WHERE '+where:''} ORDER BY d.log_date DESC,d.id DESC LIMIT 500`,params);
    return rows.map((r:any)=>({...r,report_hash:this.reportHash(r)}));
  }
  private async correctReport(m:EntityManager,d:any,h:any,b:any,occ:any,actor:FlockActor){
    const p=d.payload;const stored=p.dailyLogId?await this.reportSnapshot(m,p.dailyLogId):null;
    if(stored)await this.assertReportIdentity(stored,{...p,companyCode:d.company_code},m);
    if(p.dailyLogId&&(!stored||this.reportHash(stored)!==p.expectedReportHash||canonical(stored)!==canonical(p.originalReport)))throw new ConflictException('原日报已变化，请重新核对制单，不能覆盖他人更正');
    if(!p.dailyLogId&&(await m.query('SELECT 1 FROM brd_daily_logs WHERE house_code=$1 AND log_date=$2 FOR UPDATE',[p.houseCode,p.businessDate])).length)throw new ConflictException('补录期间已有日报，不能覆盖');
    if(!occ||occ.id!==p.originalOccupancyId||stored&&occ.id!==stored.occupancy_id||occ.house_code!==h.house_code)throw new BadRequestException('原日报占栏身份与业务日不一致');
    const r=stored??{id:0,eggs_by_grade:{},eggs_produced:0};
    if(p.businessDate===b.baseline_on&&(await m.query("SELECT 1 FROM brd_flock_events WHERE flock_no=$1 AND kind='BASELINE' LIMIT 1",[d.flock_no])).length)throw new BadRequestException('基线当天历史日报未获认证，须专项核对回执');
    if(p.originalZeroConfirmation){
      const z=p.originalZeroConfirmation;const [zero]=await m.query("SELECT id FROM brd_flock_documents WHERE id=$1 AND content_hash=$2 AND kind='CLOSE' AND status='POSTED' AND flock_no=$3 AND house_code=$4 AND business_date=$5 AND payload->>'finalProductionStatus'='CONFIRMED_ZERO'",[z.documentId,z.contentHash,d.flock_no,h.house_code,p.businessDate]);
      if(!zero)throw new ConflictException('被更正的原零产蛋声明不匹配，请重新核对');
    }
    const c=p.correction,grades=normalizeReportGrades(c.eggsByGrade);
    const active=await m.query("SELECT grade_code,is_saleable FROM product_grades WHERE status='ACTIVE'");
    const unchanged=stored && canonical(grades)===canonical(r.eggs_by_grade);
    if (!unchanged && Object.entries(grades).some(([code,qty]) =>
      !active.some((x:any)=>x.grade_code===code) && !(Object.prototype.hasOwnProperty.call(r.eggs_by_grade??{},code) && Number(r.eggs_by_grade[code])===qty))) {
      throw new BadRequestException('更正包含未启用等级');
    }
    const [cutover] = await m.query("SELECT to_regclass('production_cutover_scopes') AS scopes");
    if (cutover?.scopes && (await m.query(`SELECT 1 FROM production_cutover_scopes
        WHERE company_code=$1 AND house_code=$2 AND state<>'DRAFT' AND first_production_date<=$3`,
        [d.company_code,h.house_code,p.businessDate])).length) {
      const originalKeys = Object.keys(stored?.eggs_by_grade ?? {});
      // Older signed forms keep their explicit zero grades even if the catalog changes.
      assertReportGradeCoverage(grades, unchanged ? originalKeys : [...new Set([...originalKeys, ...await requiredReportGrades(m)])]);
    }
    if(!unchanged&&(await m.query("SELECT 1 FROM inv_flock_source_links WHERE daily_log_id=$1 AND precision<>'EXACT' LIMIT 1",[r.id])).length)throw new BadRequestException('原产蛋已进入包装多来源或继承批次，先处理下游库存并核对来源，不可直接改分级');
    const used=await effectiveExactProductionByGrade(m,r.id);
    if([...used].some(([grade,n])=>n<0||n>Number(grades[grade]??0)))throw new BadRequestException('更正分级少于已接收/入库来源，请先处理下游库存');
    const receipt=await effectiveProductionReceiptQuantity(m,r.id);
    if(receipt<0||receipt>Object.values(grades).reduce((sum:number,n)=>sum+Number(n),0))throw new BadRequestException('更正总产蛋少于已交接来源');
    // Keep the unchanged retired-grade contribution in the original saleable count.
    const saleable = active.filter((grade:any)=>grade.is_saleable);
    const saleableSum = (map:Record<string, number>) => saleable.reduce((sum:number,grade:any)=>sum+Number(map[grade.grade_code]??0),0);
    const eggs = unchanged ? Number(r.eggs_produced??0) : Number(r.eggs_produced??0) + saleableSum(grades) - saleableSum(r.eggs_by_grade??{});
    if (eggs < 0 || eggs > Object.values(grades).reduce((sum,qty)=>sum+qty,0)) throw new BadRequestException('原日报产蛋合计与分级不符，须核对销售分级依据');
    if(!stored){
      const [snapshot]=await m.query(`SELECT (SELECT closing_qty FROM brd_flock_daily_balances WHERE flock_no=$1 AND balance_date<=$2 ORDER BY balance_date DESC LIMIT 1) AS closing,
        COALESCE((SELECT opening_qty FROM brd_flock_daily_balances WHERE flock_no=$1 AND balance_date=$2),(SELECT closing_qty FROM brd_flock_daily_balances WHERE flock_no=$1 AND balance_date<$2 ORDER BY balance_date DESC LIMIT 1),0) AS opening,
        COALESCE((SELECT mortality_qty FROM brd_flock_daily_balances WHERE flock_no=$1 AND balance_date=$2),0) AS deaths,
        COALESCE((SELECT elimination_qty FROM brd_flock_daily_balances WHERE flock_no=$1 AND balance_date=$2),0) AS culls`,[d.flock_no,p.businessDate]);
      if(snapshot.closing==null)throw new BadRequestException('缺业务日存栏余额，不能补造日报');
      const [inserted]=await m.query(`INSERT INTO brd_daily_logs(flock_no,house_code,farm_code,company_code,site_code,log_date,business_date,shift,occupancy_id,
        mortality_qty,elimination_qty,opening_qty,closing_qty,eggs_by_grade,eggs_produced,dirty_eggs,broken_eggs,feed_consumed,water_consumed,note,operator)
        VALUES($1,$2,$3,$4,$5,$6,$6,'DAILY',$7,$8,$9,$10,$11,'{}',0,0,0,NULL,NULL,'',$12) RETURNING id`,
        [d.flock_no,h.house_code,occ.farm_code,occ.company_code,occ.site_code,p.businessDate,occ.id,snapshot.deaths,snapshot.culls,snapshot.opening,snapshot.closing,actor.id]);r.id=inserted.id;
    }
    await m.query(`UPDATE brd_daily_logs SET eggs_by_grade=$2::jsonb,eggs_produced=$3::integer,dirty_eggs=$4::integer,broken_eggs=$5::integer,
      feed_consumed=$6,water_consumed=$7,note=$8,lay_rate=CASE WHEN closing_qty>0 THEN round($3::numeric*100/closing_qty,2) ELSE NULL END WHERE id=$1`,
      [r.id,JSON.stringify(unchanged ? r.eggs_by_grade : grades),eggs,grades.DIRTY??0,grades.BROKEN??0,c.feedConsumed,c.waterConsumed,c.notes]);
    await m.query('UPDATE brd_flock_balances SET version=version+1 WHERE flock_no=$1',[d.flock_no]);
    await refreshDailyFlockLayRate(m,d.flock_no);
    await this.event(m,d,actor,{kind:'REPORT_CORRECTION',occupancy:occ.id});
  }

  private async validateEvidence(m: EntityManager,p: any,h: any,creator: string) {
    for(const id of p.evidence??[]) {
      const [file]=await m.query(`SELECT file_id FROM file_metadata WHERE file_id=$1 AND status='ACTIVE' AND deleted_at IS NULL
        AND visibility IN ('PROTECTED','PRIVATE') AND mime_type IN ('application/pdf','image/png','image/jpeg','image/webp')
        AND module_code='FLOCK_LIFECYCLE' AND owner_type='HOUSE' AND owner_id=$2 AND company_code=$3
        AND store_code=$4 AND uploaded_by=$5`,[id,h.house_code,h.company_code,h.site_code,creator]);
      if(!file) throw new BadRequestException('证据附件不存在、未授权、失效或不属于本鸡舍/制单人');
    }
  }
  async provisionActions(actor: FlockActor) {
    if(!actor.admin)throw new ForbiddenException('仅系统管理员可注册权限项；不自动授予业务角色');
    const labels: Record<string,string>={MENU_FLOCK_CREATE:'鸡群制单提交',MENU_FLOCK_APPROVE:'鸡群独立审核',MENU_FLOCK_POST:'鸡群过账',
      MENU_FLOCK_BASELINE:'历史盘点接续',MENU_FLOCK_ADJUST:'鸡群盘点调整',MENU_FLOCK_REVERSE:'鸡群冲销更正',
      MENU_FLOCK_REPORT:'历史日报更正',MENU_FLOCK_CLOSE:'关闭鸡群',MENU_FLOCK_CLEAN:'清舍与验收',MENU_FLOCK_HISTORY:'关账期间更正授权'};
    await this.db.transaction(async m=>{
      for(const [code,label] of Object.entries(labels)) await m.query(`INSERT INTO sys_menu(menu_code,menu_name_zh,domain,parent_code,route,sort_order)
        VALUES($1,$2,'FARM','MENU_FARM_DATA','/breeding/flock-lifecycle',990) ON CONFLICT(menu_code) DO NOTHING`,[code,label]);
    });
    await hydrateMenuRegistry(this.db);return {registered:Object.keys(labels),rolesGranted:false};
  }
  async list(scope: OrgScope) {
    const params: any[]=[]; const where=scopeWhere(scope,params,'d.');
    return this.db.query(`SELECT d.*,d.business_date::text AS business_date FROM brd_flock_documents d ${where?'WHERE '+where:''} ORDER BY created_at DESC,id LIMIT 500`,params);
  }
  async overview(scope: OrgScope) {
    const params: any[]=[];const where=scopeWhere(scope,params,'f.');
    const houses=await this.db.query(`SELECT h.house_code,h.house_name,h.farm_code,h.capacity,h.max_capacity,h.status,f.company_code,
      COALESCE(f.mapped_site_code,'') AS site_code,s.state,s.document_id,e.steps,e.previously_used,s.version AS house_version,s.last_occupied_on::text AS last_occupied_on,
      o.id AS occupancy_id,b.flock_no,b.quantity,b.version,b.closed_on::text AS closed_on,b.baseline_on::text AS baseline_on,
      (SELECT COUNT(*)::integer FROM brd_flocks x WHERE x.house_code=h.house_code AND
        (x.status IS DISTINCT FROM 'RETIRED' OR COALESCE(x.current_qty,0)>0)) AS legacy_flocks
      FROM brd_houses h JOIN (SELECT farm_code,company_code,mapped_site_code,mapped_site_code AS site_code FROM brd_farms) f ON f.farm_code=h.farm_code
      LEFT JOIN brd_flock_house_states s ON s.house_code=h.house_code
      LEFT JOIN LATERAL (${HOUSE_TURNAROUND_EVIDENCE}) e ON s.state IS DISTINCT FROM 'OCCUPIED'
      LEFT JOIN brd_flock_occupancies o ON o.house_code=h.house_code AND o.ended_on IS NULL
      LEFT JOIN brd_flock_balances b ON b.flock_no=o.flock_no ${where?'WHERE '+where:''} ORDER BY h.house_code`,params);
    return houses.map(({ capacity,max_capacity,document_id,steps,previously_used,...house }: any) => ({
      ...house, turnaround_history_review: house.state!=='OCCUPIED' && turnaroundBoundary(
        house.state?{state:house.state,document_id,last_occupied_on:house.last_occupied_on}:undefined,{steps,previously_used})===undefined,
      max_capacity: resolveHouseCapacity({ capacity, max_capacity }),
    }));
  }
  async closeBlockers(occupancyId: string, businessDate: string, scope: OrgScope) {
    const day=flockBusinessDate(businessDate);
    const params:unknown[]=[occupancyId];
    const scoped=scopeWhere(scope,params,'o.');
    const [occupancy]=await this.db.query(`SELECT o.house_code FROM brd_flock_occupancies o WHERE o.id=$1 ${scoped?'AND '+scoped:''}`,params);
    if (!occupancy) throw new NotFoundException('占栏记录不存在或不可见');
    await this.house(this.db,occupancy.house_code,scope);
    return flockHandoverBlockers(this.db,occupancyId,day,scope);
  }
  async balances(scope: OrgScope) {
    const params: any[]=[];const where=scopeWhere(scope,params,'b.');
    return this.db.query(`SELECT b.*,b.baseline_on::text AS baseline_on,b.last_business_date::text AS last_business_date,b.closed_on::text AS closed_on,f.breed_code,f.planned_elimination_date::text AS planned_elimination_date FROM brd_flock_balances b
      JOIN brd_flocks f ON f.flock_no=b.flock_no ${where?'WHERE '+where:''} ORDER BY b.flock_no`,params);
  }
  async held(scope: OrgScope) {
    const params: any[]=[];const where=scopeWhere(scope,params,'f.');
    return this.db.query(`SELECT b.*,COALESCE(f.mapped_site_code,'') AS site_code FROM brd_flock_held_balances b
      JOIN (SELECT farm_code,company_code,mapped_site_code,mapped_site_code AS site_code FROM brd_farms) f ON f.farm_code=b.farm_code
      ${where?'WHERE '+where:''} ORDER BY b.id`,params);
  }
  async care(scope: OrgScope) {
    const balances=await this.balances(scope);const flocks=balances.filter((b:any)=>!b.closed_on).map((b:any)=>b.flock_no);
    if(!flocks.length)return {plans:[],medications:[]};
    const [tables]=await this.db.query("SELECT to_regclass('brd_vaccinations') AS immune,to_regclass('brd_medication_records') AS medicines");
    const plans=tables.immune?await this.db.query(`SELECT v.*,v.plan_date::text AS plan_date,v.actual_date::text AS actual_date,v.next_due_date::text AS next_due_date,v.vaccine_expire_date::text AS vaccine_expire_date,b.house_code AS current_house_code,b.farm_code AS current_farm_code,
      a.occupancy_id AS planned_occupancy_id,x.occupancy_id AS execution_occupancy_id,x.house_code AS executed_house_code
      FROM brd_vaccinations v JOIN brd_flock_balances b ON b.flock_no=v.flock_no
      LEFT JOIN brd_flock_activity_sources a ON a.activity_type='IMMUNE_PLAN' AND a.activity_id=v.id::text
      LEFT JOIN brd_flock_activity_sources x ON x.activity_type='IMMUNE_EXECUTION' AND x.activity_id=v.id::text
      WHERE v.flock_no=ANY($1) AND v.status<>'CANCELLED' ORDER BY v.plan_date DESC`,[flocks]):[];
    const medications=tables.medicines?await this.db.query(`SELECT r.*,r.start_date::text AS start_date,r.end_date::text AS end_date,r.withdraw_until::text AS withdraw_until,b.house_code AS current_house_code,b.farm_code AS current_farm_code,
      a.occupancy_id AS original_occupancy_id FROM brd_medication_records r JOIN brd_flock_balances b ON b.flock_no=r.flock_no
      LEFT JOIN brd_flock_activity_sources a ON a.activity_type='MEDICATION' AND a.activity_id=r.id::text
      WHERE r.flock_no=ANY($1) AND r.status<>'CANCELLED' AND (r.withdraw_until IS NULL OR r.withdraw_until>=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Singapore')::date)
      ORDER BY r.start_date DESC`,[flocks]):[];
    return {plans,medications};
  }
  async attribution(scope: OrgScope) {
    const params:any[]=[];const scoped=scopeWhere(scope,params,'o.');
    const reports=await this.db.query(`SELECT d.id,d.log_date::text AS log_date,d.house_code,d.flock_no,d.occupancy_id,d.feed_consumed,d.water_consumed,
      d.opening_qty,d.closing_qty FROM brd_daily_logs d JOIN brd_flock_occupancies o ON o.id=d.occupancy_id
      WHERE d.log_date>=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Singapore')::date-29 ${scoped?'AND '+scoped:''} ORDER BY d.log_date,d.house_code`,params);
    const [tables]=await this.db.query("SELECT to_regclass('mon_device_property_history') AS observations");
    const observations=tables.observations?await this.db.query(`SELECT h.erp_house_code,h.property_code,h.value,h.collect_time,o.id AS occupancy_id,o.flock_no
      FROM mon_device_property_history h JOIN brd_flock_occupancies o ON o.house_code=h.erp_house_code
      AND o.began_on<=(to_timestamp(h.collect_time/1000.0) AT TIME ZONE 'Asia/Singapore')::date
      AND (o.ended_on IS NULL OR o.ended_on>(to_timestamp(h.collect_time/1000.0) AT TIME ZONE 'Asia/Singapore')::date)
      WHERE h.collect_time>=extract(epoch from now()-interval '30 days')*1000 ${scoped?'AND '+scoped:''}
      ORDER BY h.collect_time DESC LIMIT 1000`,params):[];
    return {reports,observations,observationLimit:1000,feedBasis:'日报实际耗用（公斤），按当日占栏归集；全局采购结存不是逐群投喂量',observationBasis:'Asia/Singapore采集日有效占栏，保留设备鸡舍绑定，不写死亡事件'};
  }
  async detail(id: string, scope: OrgScope) {
    const [doc]=await this.db.query('SELECT *,business_date::text AS business_date FROM brd_flock_documents WHERE id=$1',[id]);
    if (!doc) throw new NotFoundException('单据不存在');
    await this.house(this.db,doc.house_code,scope);
    const events=await this.db.query(`WITH grouped AS (SELECT document_id,flock_no,MIN(recorded_at) AS at,SUM(quantity_delta) AS delta FROM brd_flock_events GROUP BY document_id,flock_no),
      balances AS (SELECT *,SUM(delta) OVER(PARTITION BY flock_no ORDER BY at,document_id) AS closing FROM grouped)
      SELECT e.*,e.business_date::text AS business_date,b.closing-b.delta AS document_opening_qty,b.closing AS document_closing_qty FROM brd_flock_events e JOIN balances b ON b.document_id=e.document_id AND b.flock_no=e.flock_no
      WHERE e.document_id=$1 ORDER BY e.line_no`,[id]);
    const audits=await this.db.query('SELECT * FROM brd_flock_document_audits WHERE document_id=$1 ORDER BY version',[id]);
    const amendments=doc.kind==='CLOSE'?await this.db.query("SELECT id,business_date::text AS business_date,payload->>'differenceReceipt' AS difference_receipt,posted_at FROM brd_flock_documents WHERE kind='REPORT_CORRECTION' AND status='POSTED' AND payload->'originalZeroConfirmation'->>'documentId'=$1 ORDER BY posted_at",[id]):[];
    return {...doc,events,audits,amendments};
  }

  async evidence(id: string,fileId: string,scope: OrgScope) {
    const doc=await this.detail(id,scope);const h=await this.house(this.db,doc.house_code,scope);
    if(!doc.payload.evidence?.includes(fileId) || !this.files) throw new NotFoundException('附件不可访问');
    await this.validateEvidence(this.db,doc.payload,h,doc.created_by);
    return this.files.openProtectedFile(fileId,{moduleCode:'FLOCK_LIFECYCLE',ownerType:'HOUSE',ownerId:doc.house_code,
      companyCode:doc.company_code,storeCode:doc.site_code,requiredMenu:'MENU_FARM_DATA',canonicalBreedingHouseScopeVerified:true},'preview');
  }
  async transition(id: string, action: 'submit'|'approve'|'post'|'cancel', version: number, scope: OrgScope, actor: FlockActor) {
    this.permit(actor,action,action==='approve'); birdCount(version,'单据版本');
    return this.db.transaction(async m=>{
      const [identity]=await m.query('SELECT *,business_date::text AS business_date FROM brd_flock_documents WHERE id=$1',[id]);
      if (!identity) throw new NotFoundException('单据不存在');
      const [currentPosition]=await m.query('SELECT house_code FROM brd_flock_balances WHERE flock_no=$1',[identity.flock_no]);
      const houseCodes=[identity.house_code,identity.payload.targetHouseCode,currentPosition?.house_code].filter(Boolean) as string[];
      // Closing settles the same flock's historical handovers, including houses it previously occupied.
      if (identity.kind==='CLOSE' && action==='post') {
        const previous=await m.query('SELECT DISTINCT house_code FROM brd_flock_occupancies WHERE flock_no=$1',[identity.flock_no]);
        houseCodes.push(...previous.map((row:{house_code:string})=>row.house_code));
      }
      for (const code of [...new Set(houseCodes)].sort()) await m.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1))",[code]);
      const h=await this.house(m,identity.house_code,scope);
      if (identity.company_code!==h.company_code || identity.farm_code!==h.farm_code || identity.site_code!==h.site_code) throw new ConflictException('鸡舍归属已变，请重新审查单据');
      if (identity.payload.targetHouseCode) {
        const target=await this.house(m,identity.payload.targetHouseCode,scope);
        if (target.company_code!==h.company_code) throw new ForbiddenException('不允许跨公司转舍');
      }
      const [doc]=await m.query('SELECT *,business_date::text AS business_date FROM brd_flock_documents WHERE id=$1 FOR UPDATE',[id]);
      this.special(actor,doc.kind);
      if (doc.status==='POSTED' && action==='post') return doc;
      if (Number(doc.version)!==version) throw new ConflictException('单据版本冲突，请刷新后重试');
      const allowed={submit:'DRAFT',approve:'SUBMITTED',post:'APPROVED',cancel:doc.status==='DRAFT'?'DRAFT':doc.status==='APPROVED'?'APPROVED':'SUBMITTED'};
      if (doc.status!==allowed[action]) throw new ConflictException('单据状态不允许此动作');
      if (action==='cancel' && doc.status==='APPROVED') this.permit(actor,'approve',true);
      if (action==='approve' && actor.id===doc.created_by) throw new ForbiddenException('审核人必须与制单人不同');
      if (action==='approve' || action==='post') await this.validateEvidence(m,doc.payload,h,doc.created_by);
      if (action==='post') await this.post(m,doc,h,scope,actor);
      const status={submit:'SUBMITTED',approve:'APPROVED',post:'POSTED',cancel:'CANCELLED'}[action];
      await m.query(`UPDATE brd_flock_documents SET status=$2,version=version+1,
        approved_by=CASE WHEN $2='APPROVED' THEN $3 ELSE approved_by END,
        posted_by=CASE WHEN $2='POSTED' THEN $3 ELSE posted_by END,
        posted_at=CASE WHEN $2='POSTED' THEN clock_timestamp() ELSE posted_at END WHERE id=$1 RETURNING *`,[id,status,actor.id]);
      const [saved]=await m.query('SELECT *,business_date::text AS business_date FROM brd_flock_documents WHERE id=$1',[id]);
      await this.audit(m,doc,action.toUpperCase(),actor,version+1); return saved;
    });
  }

  private async post(m: EntityManager, doc: any, h: any, scope: OrgScope, actor: FlockActor) {
    const p=doc.payload; const day=flockBusinessDate(p.businessDate);
    const [clock]=await m.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Singapore')::date::text AS today");
    if (day>clock.today) throw new BadRequestException('未来日期只能计划，不能过账');
    if (!['REPORT_CORRECTION','REVERSE'].includes(doc.kind)&&(h.status!=='ACTIVE' || h.farm_status!=='ACTIVE')) throw new BadRequestException('鸡舍或农场未启用');
    // Previous-month corrections need a named close-period approval receipt; no implicit reopening.
    const monthStart=clock.today.slice(0,7)+'-01';
    if (doc.kind==='HISTORY_AUTH') {
      if(day<monthStart || p.periodTo>=monthStart) throw new BadRequestException('历史授权须当期签发且仅覆盖已结束月份');
      return;
    }
    let impactedDay=day;
    if(doc.kind==='REVERSE') {
      const [original]=await m.query('SELECT business_date::text AS day FROM brd_flock_documents WHERE id=$1',[p.originalDocumentId]);
      if(original?.day) impactedDay=original.day;
    }
    if (day<monthStart || impactedDay<monthStart) {
      const [authorization]=await m.query(`SELECT *,business_date::text AS business_date FROM brd_flock_documents WHERE kind='HISTORY_AUTH' AND status='POSTED'
        AND company_code=$1 AND flock_no=$2 AND house_code=$3 AND payload->>'authorizedSourceKey'=$4
        AND payload->>'periodFrom'<=$5 AND payload->>'periodTo'>=$5
        AND ($6::text='' OR id=$6) ORDER BY posted_at DESC LIMIT 1`,[doc.company_code,doc.flock_no,doc.house_code,doc.source_key,impactedDay,p.periodApprovalRef??'']);
      if(!authorization || authorization.company_code!==doc.company_code || authorization.flock_no!==doc.flock_no
        || authorization.house_code!==doc.house_code || authorization.payload.authorizedSourceKey!==doc.source_key
        || authorization.payload.periodFrom>impactedDay || authorization.payload.periodTo<impactedDay)
        throw new BadRequestException('跨月历史更正需真实已过账且绑定本单及影响期间的授权');
    }
    const [state]=await m.query('SELECT *,last_occupied_on::text AS last_occupied_on FROM brd_flock_house_states WHERE house_code=$1 FOR UPDATE',[h.house_code]);
    let balance=(await m.query('SELECT *,baseline_on::text AS baseline_on,last_business_date::text AS last_business_date,closed_on::text AS closed_on FROM brd_flock_balances WHERE flock_no=$1 FOR UPDATE',[doc.flock_no]))[0];
    if (['CLEAN_START','CLEAN_ACCEPT'].includes(doc.kind)) {
      if ((state?.version??0)!==p.expectedHouseVersion) throw new ConflictException('鸡舍版本冲突');
      const active=await m.query("SELECT 1 FROM brd_flocks WHERE house_code=$1 AND (status IS DISTINCT FROM 'RETIRED' OR COALESCE(current_qty,0)>0) LIMIT 1",[h.house_code]);
      if (active.length || state?.state==='OCCUPIED') throw new BadRequestException('在栏群未关闭，不能清舍验收');
      const next=doc.kind==='CLEAN_START'?'CLEANING':'READY';
      if (next==='READY' && state?.state!=='CLEANING') throw new BadRequestException('请先办理清洗消毒，再验收');
      if (next==='CLEANING' && state && !['DIRTY','READY'].includes(state.state)) throw new BadRequestException('鸡舍当前状态不能开始清舍');
      await assertHouseTurnaround(m,h.house_code,state,day);
      await this.setHouse(m,h.house_code,next,doc.id);
      await this.event(m,doc,actor,{kind:doc.kind});return;
    }
    if (['BASELINE','ADMIT'].includes(doc.kind)) {
      if (balance || p.expectedVersion!==0) throw new ConflictException('鸡群已接续事件账或版本不为0');
      const capacity=this.capacity(h,p.quantity);
      const active=await m.query("SELECT *,start_date::text AS start_date FROM brd_flocks WHERE house_code=$1 AND (status IS DISTINCT FROM 'RETIRED' OR COALESCE(current_qty,0)>0) ORDER BY flock_no FOR UPDATE",[h.house_code]);
      if (doc.kind==='BASELINE') {
        if (active.length!==1 || active[0].flock_no!==doc.flock_no || active[0].farm_code!==h.farm_code) throw new BadRequestException('基线须对应唯一且归属一致的在栏群');
        if (!['ACTIVE','GROWING','LAYING','PEAK','DECLINING'].includes(active[0].status)
          || !active[0].start_date || active[0].start_date>day) throw new BadRequestException('历史鸡群状态/入栏日期须先核实');
        if (birdCount(active[0].current_qty,'旧档案余额')!==p.expectedLegacyQty) throw new ConflictException('旧档案余额已变，请重新实盘核对');
        const [breed]=await m.query("SELECT 1 FROM sys_dict WHERE dict_type='BRD_BREED' AND dict_code=$1 AND status='ACTIVE'",[active[0].breed_code]);
        if (!breed) throw new BadRequestException('历史遗传品种尚未确认标准码');
        // Baseline is end of physical-count day. No reclassification of that day's legacy losses/eggs.
        const future=await m.query('SELECT 1 FROM brd_daily_logs WHERE flock_no=$1 AND log_date>$2 LIMIT 1',[doc.flock_no,day]);
        if (future.length) throw new BadRequestException('基线后已有旧日报，须先完成差异处理');
      } else {
        if(p.sourceKind==='SUPPLIER') {
          const [supplier]=await m.query("SELECT 1 FROM prc2_suppliers WHERE supplier_code=$1 AND status='ACTIVE' AND is_active=true AND (shared_scope='GROUP' OR owner_company_code=$2)",[p.sourceCode,h.company_code]);
          if(!supplier)throw new BadRequestException('入栏供应商未启用或不适用于本公司');
        } else {
          const [origin]=await m.query("SELECT farm_code,company_code,mapped_site_code FROM brd_farms WHERE farm_code=$1 AND status='ACTIVE'",[p.sourceFarmCode]);
          if(!origin || origin.company_code!==h.company_code)throw new BadRequestException('内部来源须为同公司有效农场');
          if(!scope.isGlobal && !(scope.companyCodes?.includes(origin.company_code) || scope.farmCodes?.includes(origin.farm_code) || scope.siteCodes?.includes(origin.mapped_site_code)))throw new ForbiddenException('无权确认内部来源农场交接');
        }
        await m.query('INSERT INTO brd_flock_admission_receipts(company_code,source_kind,receipt_reference,document_id,quantity) VALUES($1,$2,$3,$4,$5)',[h.company_code,p.sourceKind,p.sourceReceipt,doc.id,p.quantity]);
        if (active.length || state?.state!=='READY') throw new BadRequestException('请先关闭旧群并完成清舍验收');
        await assertHouseTurnaround(m,h.house_code,state,day);
        if (state.version!==p.expectedHouseVersion) throw new ConflictException('鸡舍版本冲突');
        if (state.last_occupied_on && day<=String(state.last_occupied_on).slice(0,10)) throw new BadRequestException('一期禁止同舍同日换群');
        const [breed]=await m.query("SELECT dict_label_zh FROM sys_dict WHERE dict_type='BRD_BREED' AND dict_code=$1 AND status='ACTIVE' FOR SHARE",[p.breedCode]);
        if (!breed) throw new BadRequestException('遗传品种未启用');
        if (p.plannedEliminationDate && p.plannedEliminationDate<day) throw new BadRequestException('计划淘汰日期早于入栏');
        await m.query(`INSERT INTO brd_flocks(flock_no,house_code,farm_code,company_code,site_code,breed_code,strain,breed_type,
          placement_date,start_date,placement_age,initial_qty,current_qty,status,planned_elimination_date)
          VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$8,$9,$10,$10,'GROWING',$11)`,
          [doc.flock_no,h.house_code,h.farm_code,h.company_code,h.site_code,p.breedCode,breed.dict_label_zh,day,p.placementAge,p.quantity,p.plannedEliminationDate??null]);
      }
      const occupancy=randomUUID();
      await m.query(`INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,opened_document_id,capacity_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[occupancy,doc.flock_no,h.house_code,h.company_code,h.farm_code,h.site_code,day,doc.id,capacity]);
      await m.query(`INSERT INTO brd_flock_balances(flock_no,company_code,farm_code,site_code,house_code,quantity,baseline_on,last_business_date)
        VALUES($1,$2,$3,$4,$5,$6,$7,$7)`,[doc.flock_no,h.company_code,h.farm_code,h.site_code,h.house_code,p.quantity,day]);
      await this.event(m,doc,actor,{occupancy,delta:p.quantity,kind:doc.kind});
      await this.setHouse(m,h.house_code,'OCCUPIED',doc.id,day);
      await m.query('UPDATE brd_flocks SET current_qty=$2,updated_at=now() WHERE flock_no=$1',[doc.flock_no,p.quantity]);
      await this.rebuild(m,doc.flock_no);return;
    }
    if (!balance) throw new BadRequestException('历史鸡群尚未完成实盘基线接续，不允许生命周期过账');
    if (balance.company_code!==h.company_code) throw new ConflictException('鸡群公司归属已变');
    if (!['REPORT_CORRECTION','SELL_HELD','REVERSE'].includes(doc.kind) && (balance.farm_code!==h.farm_code || balance.house_code!==h.house_code)) throw new ConflictException('鸡群当前归属已变，请刷新');
    if (['REPORT_CORRECTION','SELL_HELD','REVERSE'].includes(doc.kind)) await this.house(m,balance.house_code,scope);
    if (balance.version!==p.expectedVersion) throw new ConflictException('存栏版本冲突，请刷新后重新制单');
    if (day<balance.baseline_on) throw new BadRequestException('不能修改批准基线之前的未知历史');
    const [occ]=await m.query('SELECT *,began_on::text AS began_on,ended_on::text AS ended_on FROM brd_flock_occupancies WHERE flock_no=$1 AND began_on<=$2 AND (ended_on IS NULL OR ended_on>$2) ORDER BY brd_flock_occupancies.began_on DESC',[doc.flock_no,day]);
    if (!occ && !['SELL_HELD','REVERSE'].includes(doc.kind)) throw new BadRequestException('业务日期没有有效占栏');
    if(doc.kind==='REPORT_CORRECTION'){await this.correctReport(m,doc,h,balance,occ,actor);return;}
    if (balance.closed_on && !['SELL_HELD','REVERSE'].includes(doc.kind)) throw new BadRequestException('鸡群已关闭');
    if (!['REVERSE','SELL_HELD'].includes(doc.kind) && day<balance.last_business_date) throw new BadRequestException('普通过账不能回溯覆盖后续事件，请使用受控更正');
    let delta=0;
    if (doc.kind==='MORTALITY') delta=-p.quantity;
    if (doc.kind==='CULL') {
      delta=-p.quantity;
      const held=randomUUID();
      await m.query(`INSERT INTO brd_flock_held_balances(id,flock_no,company_code,farm_code,house_code,position_code,quantity,document_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[held,doc.flock_no,h.company_code,h.farm_code,h.house_code,p.positionCode,p.quantity,doc.id]);
      await this.event(m,doc,actor,{occupancy:occ.id,delta,heldDelta:p.quantity,heldId:held,kind:'CULL'});
    } else if (doc.kind==='SELL_HELD') {
      const [held]=await m.query('SELECT * FROM brd_flock_held_balances WHERE id=$1 FOR UPDATE',[p.heldId]);
      if (!held || held.flock_no!==doc.flock_no || held.company_code!==h.company_code || held.house_code!==h.house_code) throw new BadRequestException('待售批次不匹配');
      const [origin]=await m.query('SELECT MIN(business_date)::text AS began_on FROM brd_flock_events WHERE held_id=$1 AND held_delta>0',[held.id]);
      if(!origin?.began_on||day<origin.began_on)throw new BadRequestException('交付日期不能早于实际淘汰/待售来源日，未知来源须先核对');
      if (held.version!==p.expectedHeldVersion) throw new ConflictException('待售余额版本冲突');
      if (p.quantity>held.quantity) throw new BadRequestException('交付数量超过待售余额');
      const [customer]=await m.query("SELECT 1 FROM sal_customers WHERE customer_no=$1 AND company_code=$2 AND status='ACTIVE'",[p.customerCode,h.company_code]);
      const [currency]=await m.query("SELECT 1 FROM sys_dict WHERE dict_type='SYS_CURRENCY' AND dict_code=$1 AND status='ACTIVE'",[p.currencyCode]);
      if(!customer || !currency) throw new BadRequestException('客户/币种未启用或不属于本公司');
      await this.assertNoHealthPending(m,doc.flock_no,day,true);
      await m.query(`INSERT INTO brd_flock_sales_settlements(document_id,held_id,company_code,customer_code,currency_code,quantity,unit_price,amount,receipt_reference)
        VALUES($1,$2,$3,$4,$5,$6::integer,$7::numeric,round($6::numeric*$7::numeric,2),$8)`,[doc.id,held.id,h.company_code,p.customerCode,p.currencyCode,p.quantity,p.unitPrice,p.salesRef]);
      await m.query('UPDATE brd_flock_held_balances SET quantity=quantity-$2,version=version+1 WHERE id=$1',[held.id,p.quantity]);
      await this.event(m,doc,actor,{kind:'SELL_HELD',heldDelta:-p.quantity,heldId:held.id});
    } else if (doc.kind==='ADJUST') delta=p.quantity;
    else if (doc.kind==='TRANSFER') {
      if (day<=occ.began_on) throw new BadRequestException('一期禁止同日入栏后转舍');
      const t=await this.house(m,p.targetHouseCode,scope);
      const capacity=this.capacity(t,balance.quantity);
      if (t.status!=='ACTIVE' || t.farm_status!=='ACTIVE' || t.company_code!==h.company_code) throw new BadRequestException('目标舍必须为同公司有效鸡舍');
      const [ts]=await m.query('SELECT *,last_occupied_on::text AS last_occupied_on FROM brd_flock_house_states WHERE house_code=$1 FOR UPDATE',[t.house_code]);
      const active=await m.query("SELECT 1 FROM brd_flocks WHERE house_code=$1 AND (status IS DISTINCT FROM 'RETIRED' OR COALESCE(current_qty,0)>0)",[t.house_code]);
      if (ts?.state!=='READY' || active.length || ts.last_occupied_on && day<=ts.last_occupied_on) throw new BadRequestException('目标舍须空舍且清舍验收完成');
      await assertHouseTurnaround(m,t.house_code,ts,day);
      if (!balance.quantity) throw new BadRequestException('空群不能转舍');
      // Date-granularity source identity cannot split today's old-house production.
      const logs=await m.query('SELECT 1 FROM brd_daily_logs WHERE house_code=ANY($1) AND log_date>=$2 LIMIT 1',[[h.house_code,t.house_code],day]);
      if (logs.length) throw new BadRequestException('转舍日已有日报，须在无日报日期办理并先核对生产来源');
      await m.query('UPDATE brd_flock_occupancies SET ended_on=$2,closed_document_id=$3 WHERE id=$1',[occ.id,day,doc.id]);
      const next=randomUUID();
      await m.query(`INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,opened_document_id,capacity_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[next,doc.flock_no,t.house_code,t.company_code,t.farm_code,t.site_code,day,doc.id,capacity]);
      await this.event(m,doc,actor,{line:1,kind:'TRANSFER_OUT',occupancy:occ.id,delta:-balance.quantity});
      await this.event(m,doc,actor,{line:2,kind:'TRANSFER_IN',occupancy:next,delta:balance.quantity,house:t});
      await this.setHouse(m,h.house_code,'DIRTY',doc.id,day);
      await this.setHouse(m,t.house_code,'OCCUPIED',doc.id,day);
      await m.query('UPDATE brd_flock_balances SET house_code=$2,farm_code=$3,site_code=$4 WHERE flock_no=$1',[doc.flock_no,t.house_code,t.farm_code,t.site_code]);
      await m.query('UPDATE brd_flocks SET house_code=$2,farm_code=$3,site_code=$4 WHERE flock_no=$1',[doc.flock_no,t.house_code,t.farm_code,t.site_code]);
    } else if (doc.kind==='CLOSE') {
      await this.assertNoHealthPending(m,doc.flock_no,day);
      if (balance.quantity!==0) throw new BadRequestException('存栏未归零，不能关闭');
      const lastReports=await m.query('SELECT flock_no,shift,occupancy_id,eggs_by_grade,eggs_produced,dirty_eggs,broken_eggs FROM brd_daily_logs WHERE house_code=$1 AND log_date=$2 FOR UPDATE',[h.house_code,day]);
      if(lastReports.some((r:any)=>r.flock_no!==doc.flock_no||r.occupancy_id!==occ.id)
        ||lastReports.length>1&&lastReports.some((r:any)=>r.shift==='DAILY'))throw new BadRequestException('关闭日存在身份不符或重复覆盖的汇总/班次日报');
      if(lastReports.some((r:any)=>r.shift!=='DAILY')) {
        const [schema]=await m.query("SELECT to_regclass('production_cutover_scopes') AS scopes");
        const active=schema?.scopes?await m.query(`SELECT 1 FROM production_cutover_scopes WHERE company_code=$1
          AND house_code=$2 AND first_production_date<=$3 AND state='ACTIVE'`,[h.company_code,h.house_code,day]):[];
        const shifts=await m.query("SELECT dict_code FROM sys_dict WHERE dict_type='PRODUCTION_REPORT_SHIFT' AND status='ACTIVE' AND dict_code<>'DAILY'");
        if(!active.length||!shifts.length||shifts.some((s:any)=>!lastReports.some((r:any)=>r.shift===s.dict_code))
          ||lastReports.some((r:any)=>!shifts.some((s:any)=>s.dict_code===r.shift)))throw new BadRequestException('关闭日正式班次未全部确认，请补齐含零产蛋班次的实际日报');
      }
      const lastReport=lastReports[0];
      if(!lastReport&&p.finalProductionStatus!=='CONFIRMED_ZERO')throw new BadRequestException('请先确认关闭当天DAILY日报，或上传真实零产蛋签认后再关闭');
      if(p.finalProductionStatus==='CONFIRMED_ZERO'&&lastReports.some((r:any)=>Object.values(r.eggs_by_grade??{}).some(n=>Number(n)>0)||['eggs_produced','dirty_eggs','broken_eggs'].some(k=>Number(r[k]??0)>0)))throw new BadRequestException('关闭日已有实际产蛋，不得签认为零');
      const blockers=await flockHandoverBlockers(m,occ.id,day,scope);
      if (blockers.length) throw new ConflictException({code:'FLOCK_HANDOVER_CLOSE_HOLD',blockers,
        message:`该鸡群仍有交接或生产单据待核：${blockers[0].reference}，请查看关群待办`});
      const pending=await m.query("SELECT 1 FROM brd_flock_documents WHERE flock_no=$1 AND id<>$2 AND status IN ('DRAFT','SUBMITTED','APPROVED') LIMIT 1",[doc.flock_no,doc.id]);
      if (pending.length) throw new BadRequestException('还有未完生命周期单据');
      // End exclusive on following day: today's eggs keep old provenance; next flock starts later.
      await m.query("UPDATE brd_flock_occupancies SET ended_on=$2::date+1,closed_document_id=$3 WHERE id=$1",[occ.id,day,doc.id]);
      await m.query('UPDATE brd_flock_balances SET closed_on=$2 WHERE flock_no=$1',[doc.flock_no,day]);
      await m.query("UPDATE brd_flocks SET status='RETIRED' WHERE flock_no=$1",[doc.flock_no]);
      await this.setHouse(m,h.house_code,'DIRTY',doc.id,day);
      await this.event(m,doc,actor,{kind:'CLOSE',occupancy:occ.id});
    } else if (doc.kind==='REVERSE') {
      delta=await this.reverse(m,doc,balance,actor);
    }
    const nextQty=Number(balance.quantity)+delta;
    if (nextQty<0 || !Number.isSafeInteger(nextQty)) throw new BadRequestException('数量超过存栏余额');
    if (balance.closed_on && nextQty!==0) throw new BadRequestException('已关闭群更正须冲销并等额重记，禁止凭空恢复在栏；真实鸡只需新盘点单');
    if (delta>0) { const currentHouse=await this.house(m,balance.house_code,scope); this.capacity(currentHouse,nextQty); }
    if (['MORTALITY','ADJUST'].includes(doc.kind)) await this.event(m,doc,actor,{kind:doc.kind,delta,occupancy:occ.id});
    await m.query('UPDATE brd_flock_balances SET quantity=$2,version=version+1,last_business_date=GREATEST(last_business_date,$3) WHERE flock_no=$1',[doc.flock_no,nextQty,day]);
    await m.query('UPDATE brd_flocks SET current_qty=$2,updated_at=now() WHERE flock_no=$1',[doc.flock_no,nextQty]);
    await this.rebuild(m,doc.flock_no);
  }

  private async assertNoHealthPending(m: EntityManager,flock: string,day: string,onlyWithdrawal=false) {
    const [tables]=await m.query("SELECT to_regclass('brd_vaccinations') AS immune,to_regclass('brd_medication_records') AS medicines");
    if(tables.immune && !onlyWithdrawal) {
      const pending=await m.query("SELECT 1 FROM brd_vaccinations WHERE flock_no=$1 AND status IN ('PLANNED','OVERDUE') AND actual_date IS NULL LIMIT 1",[flock]);
      if(pending.length) throw new BadRequestException('群还有未完免疫计划，请先受控执行或取消');
    }
    if(tables.medicines) {
      const pending=await m.query("SELECT 1 FROM brd_medication_records WHERE flock_no=$1 AND status<>'CANCELLED' AND (end_date IS NULL OR end_date>=$2 OR withdraw_until>=$2) LIMIT 1",[flock,day]);
      if(pending.length) throw new BadRequestException('鸡群仍在用药或休药隔离期，不允许关闭/交付待售鸡');
    }
  }
  private capacity(h: any, quantity: number) {
    const capacity = resolveHouseCapacity(h);
    if (capacity === null) throw new BadRequestException('鸡舍设计容量未核实，请核对鸡舍档案');
    if (quantity > capacity) throw new BadRequestException(`超过有效鸡舍容量（上限 ${capacity} 羽）`);
    return capacity;
  }
  private async setHouse(m: EntityManager, code: string, state: string, doc: string, day?: string) {
    await m.query(`INSERT INTO brd_flock_house_states(house_code,state,document_id,last_occupied_on) VALUES($1,$2,$3,$4)
      ON CONFLICT(house_code) DO UPDATE SET state=EXCLUDED.state,version=brd_flock_house_states.version+1,
      document_id=EXCLUDED.document_id,last_occupied_on=COALESCE(EXCLUDED.last_occupied_on,brd_flock_house_states.last_occupied_on)`,[code,state,doc,day??null]);
  }
  private async event(m: EntityManager, d: any, actor: FlockActor, x: {line?: number; kind: string; occupancy?: string; delta?: number; heldDelta?: number; heldId?: string; reversal?: string; house?: any; day?: string}) {
    const h=x.house??d;
    await m.query(`INSERT INTO brd_flock_events(id,document_id,line_no,flock_no,occupancy_id,company_code,farm_code,site_code,house_code,
      business_date,kind,quantity_delta,held_delta,held_id,reversal_of,actor,approved_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [randomUUID(),d.id,x.line??1,d.flock_no,x.occupancy??null,h.company_code,h.farm_code,h.site_code,h.house_code,x.day??d.payload.businessDate,
        x.kind,x.delta??0,x.heldDelta??0,x.heldId??null,x.reversal??null,actor.id,d.approved_by]);
  }
  private async reverse(m: EntityManager, d: any, b: any, actor: FlockActor) {
    const p=d.payload;
    const [original]=await m.query('SELECT *,business_date::text AS business_date FROM brd_flock_documents WHERE id=$1',[p.originalDocumentId]);
    if (!original || original.house_code!==d.house_code || original.flock_no!==d.flock_no || original.company_code!==d.company_code || original.status!=='POSTED'
      || !['MORTALITY','CULL','ADJUST'].includes(original.kind)) throw new BadRequestException('仅可冲销同群已过账死亡/淘汰/盘点单');
    const events=await m.query('SELECT * FROM brd_flock_events WHERE document_id=$1 ORDER BY line_no',[original.id]);
    if (events.length!==1) throw new BadRequestException('原事件身份异常');
    const e=events[0];
    const [reversed]=await m.query('SELECT 1 FROM brd_flock_events WHERE reversal_of=$1',[e.id]);
    if (reversed) throw new ConflictException('原单已冲销');
    if (original.business_date< b.baseline_on) throw new BadRequestException('不能冲销基线前事实');
    let replacement=0;
    if (p.replacementKind) replacement=p.replacementKind==='ADJUST'?p.replacementQuantity:-p.replacementQuantity;
    if (replacement!==Number(e.quantity_delta)) {
      // A posted transfer records a witnessed count at the end of this exact occupancy.
      // Reclassifying a loss at the same quantity can proceed without changing the transfer.
      const [transfer]=await m.query(`SELECT d.id FROM brd_flock_occupancies o
        JOIN brd_flock_documents d ON d.id=o.closed_document_id AND d.kind='TRANSFER' AND d.status='POSTED'
        WHERE o.id=$1 AND o.flock_no=$2 AND o.house_code=$3`,[e.occupancy_id,d.flock_no,d.house_code]);
      if (transfer) throw new ConflictException({code:'FLOCK_TRANSFER_CORRECTION_HOLD',
        originalDocumentId:original.id,transferDocumentId:transfer.id,
        message:'更正将改变后续已签转舍数量，请核对原单与转舍单，完成两舍实盘及差异审批'});
    }
    let replacementHeldId=e.held_id;
    if (p.replacementKind==='MORTALITY') { text(p.disposalMethod,'更正死亡处置方式');text(p.receiver,'更正死亡接收人'); }
    if (p.replacementKind==='CULL' && !e.held_id) {
      text(p.positionCode,'更正后的待售实际位置');
      replacementHeldId=randomUUID();
      await m.query(`INSERT INTO brd_flock_held_balances(id,flock_no,company_code,farm_code,house_code,position_code,quantity,document_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[replacementHeldId,d.flock_no,e.company_code,e.farm_code,e.house_code,p.positionCode,-replacement,d.id]);
    }
    if (e.held_id) {
      const [held]=await m.query('SELECT * FROM brd_flock_held_balances WHERE id=$1 FOR UPDATE',[e.held_id]);
      const heldDelta=-Number(e.held_delta)+(p.replacementKind==='CULL'?-replacement:0);
      if (!held || held.quantity+heldDelta<0) throw new BadRequestException('待售已交付，须先处理下游交接，不能恢复原群');
      await m.query('UPDATE brd_flock_held_balances SET quantity=quantity+$2,version=version+1 WHERE id=$1',[held.id,heldDelta]);
    }
    const eventDay=original.business_date instanceof Date?original.business_date.toISOString().slice(0,10):String(original.business_date).slice(0,10);
    await this.event(m,d,actor,{kind:`REVERSE_${e.kind}`,delta:-Number(e.quantity_delta),heldDelta:-Number(e.held_delta),
      heldId:e.held_id,occupancy:e.occupancy_id,reversal:e.id,day:eventDay,house:e});
    if (p.replacementKind) await this.event(m,d,actor,{line:2,kind:p.replacementKind,delta:replacement,
      heldDelta:p.replacementKind==='CULL'?-replacement:0,heldId:replacementHeldId,occupancy:e.occupancy_id,day:eventDay,house:e});
    return -Number(e.quantity_delta)+replacement;
  }

  private async rebuild(m: EntityManager, flock: string) {
    const rows=await m.query(`SELECT business_date::text AS day,SUM(quantity_delta)::integer AS delta,
      SUM(CASE WHEN kind IN ('MORTALITY','REVERSE_MORTALITY') THEN -quantity_delta ELSE 0 END)::integer AS mortality,
      SUM(CASE WHEN kind IN ('CULL','REVERSE_CULL') THEN -quantity_delta ELSE 0 END)::integer AS culls
      FROM brd_flock_events WHERE flock_no=$1 GROUP BY business_date ORDER BY business_date`,[flock]);
    let running=0;
    for (const r of rows) {
      const opening=running;running+=r.delta;
      if (running<0 || r.mortality<0 || r.culls<0) throw new BadRequestException('更正将造成历史负余额或负死淘，事务已回滚');
      const historicalHouses=await m.query(`SELECT o.capacity_snapshot AS max_capacity FROM brd_flock_occupancies o
        WHERE o.flock_no=$1 AND o.began_on<=$2 AND (o.ended_on IS NULL OR o.ended_on>$2)`,[flock,r.day]);
      if(historicalHouses.some((h:any)=>running>Number(h.max_capacity))) throw new BadRequestException('更正将造成历史占栏超容量，事务已回滚');
      await m.query(`INSERT INTO brd_flock_daily_balances(flock_no,balance_date,opening_qty,closing_qty,mortality_qty,elimination_qty)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(flock_no,balance_date) DO UPDATE SET opening_qty=EXCLUDED.opening_qty,
        closing_qty=EXCLUDED.closing_qty,mortality_qty=EXCLUDED.mortality_qty,elimination_qty=EXCLUDED.elimination_qty`,[flock,r.day,opening,running,r.mortality,r.culls]);
    }
    const [cutover]=await m.query("SELECT to_regclass('production_cutover_scopes') AS scopes");
    const officialPeriod=cutover?.scopes?`AND NOT EXISTS(SELECT 1 FROM production_cutover_scopes s
      WHERE s.house_code=d.house_code AND s.state<>'DRAFT' AND d.log_date<s.first_production_date)`:'';
    // DAILY projects losses at its own occupancy, including on transfer days; shift reports do not duplicate mortality. Archived reports retain their original cache.
    await m.query(`UPDATE brd_daily_logs d SET
      mortality_qty=CASE WHEN d.shift='DAILY' THEN COALESCE((SELECT -SUM(e.quantity_delta) FROM brd_flock_events e WHERE e.flock_no=d.flock_no AND e.occupancy_id=d.occupancy_id
        AND e.business_date=d.log_date AND e.kind IN ('MORTALITY','REVERSE_MORTALITY')),0) ELSE 0 END,
      elimination_qty=CASE WHEN d.shift='DAILY' THEN COALESCE((SELECT -SUM(e.quantity_delta) FROM brd_flock_events e WHERE e.flock_no=d.flock_no AND e.occupancy_id=d.occupancy_id
        AND e.business_date=d.log_date AND e.kind IN ('CULL','REVERSE_CULL')),0) ELSE 0 END,
      opening_qty=COALESCE((SELECT opening_qty FROM brd_flock_daily_balances WHERE flock_no=d.flock_no AND balance_date=d.log_date),
        (SELECT closing_qty FROM brd_flock_daily_balances WHERE flock_no=d.flock_no AND balance_date<d.log_date ORDER BY balance_date DESC LIMIT 1)),
      closing_qty=(SELECT closing_qty FROM brd_flock_daily_balances WHERE flock_no=d.flock_no AND balance_date<=d.log_date ORDER BY balance_date DESC LIMIT 1)
      WHERE d.flock_no=$1 AND d.occupancy_id IS NOT NULL ${officialPeriod}`,[flock]);
    await m.query(`UPDATE brd_daily_logs d SET lay_rate=CASE WHEN closing_qty>0 THEN round(eggs_produced*100.0/closing_qty,2) ELSE 0 END
      WHERE flock_no=$1 AND occupancy_id IS NOT NULL ${officialPeriod}`,[flock]);
    await refreshDailyFlockLayRate(m,flock);
  }
}
