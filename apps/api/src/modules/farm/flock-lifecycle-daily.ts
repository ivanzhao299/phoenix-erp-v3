import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { effectiveExactProductionByGrade, effectiveProductionReceiptQuantity } from './effective-production-source';

/** Called under the shared house/flock locks. Legacy flocks retain P0 safeguards until approved activation. */
export async function lifecycleDailyBalance(m: EntityManager, flock: any, prior: any, next: any, input: any) {
  const [schema]=await m.query("SELECT to_regclass('brd_flock_balances') AS ledger");
  if (!schema?.ledger) return null;
  next.occupancy_id=null;
  const [b]=await m.query('SELECT *,baseline_on::text AS baseline_on FROM brd_flock_balances WHERE flock_no=$1',[flock.flock_no]);
  if (!b) return null;
  if(b.closed_on&&!prior)throw new BadRequestException('已关闭鸡群日报只读；历史数量更正请走受控冲销单，产蛋差异须先核对下游库存并签认回执');
  if (next.log_date<b.baseline_on || next.log_date===b.baseline_on && (await m.query("SELECT 1 FROM brd_flock_events WHERE flock_no=$1 AND kind='BASELINE' LIMIT 1",[flock.flock_no])).length) {
    throw new BadRequestException('历史基线当天及之前日报只读，请走历史差异回执');
  }
  if (next.shift!=='DAILY') {
    const [cutoverSchema]=await m.query("SELECT to_regclass('production_cutover_scopes') AS scopes");
    const active=cutoverSchema?.scopes ? await m.query(`SELECT 1 FROM production_cutover_scopes s
      JOIN sys_dict shift ON shift.dict_type='PRODUCTION_REPORT_SHIFT' AND shift.dict_code=$4 AND shift.status='ACTIVE'
      WHERE s.company_code=$1 AND s.house_code=$2 AND s.first_production_date<=$3 AND s.state='ACTIVE'`,
    [next.company_code,next.house_code,next.log_date,next.shift]) : [];
    if (!active.length) throw new BadRequestException('正式多班须先启用切换范围并选择已确认的班次');
  }
  const [cutover]=await m.query("SELECT to_regclass('production_cutover_scopes') AS scopes");
  if(!prior&&cutover?.scopes&&(await m.query(`SELECT 1 FROM production_cutover_scopes WHERE company_code=$1 AND house_code=$2
    AND state='ACTIVE' AND first_production_date<=$3`,[next.company_code,next.house_code,next.log_date])).length) {
    const grades=typeof next.eggs_by_grade==='string'?JSON.parse(next.eggs_by_grade):next.eggs_by_grade;
    const required=await m.query(`SELECT grade_code FROM product_grades p WHERE status='ACTIVE'
      AND COALESCE((to_jsonb(p)->>'stock_managed')::boolean,(to_jsonb(p)->>'is_storable')::boolean,true)`);
    if(!required.length||!grades||required.some((g:any)=>!Object.prototype.hasOwnProperty.call(grades,g.grade_code)))
      throw new BadRequestException('正式日报须明确填写全部库存分级；未产档位请明确填0，不得把未记录当成0');
  }
  const other=await m.query(`SELECT 1 FROM brd_daily_logs WHERE house_code=$1 AND log_date=$2
    AND ${next.shift==='DAILY' ? "shift<>'DAILY'" : "shift='DAILY'"} LIMIT 1`,[next.house_code,next.log_date]);
  if (other.length) throw new BadRequestException('该舍日已有历史班次，请先核对');
  const [o]=await m.query(`SELECT id FROM brd_flock_occupancies WHERE flock_no=$1 AND house_code=$2
    AND began_on<=$3 AND (ended_on IS NULL OR ended_on>$3)`,[flock.flock_no,next.house_code,next.log_date]);
  if (!o) throw new BadRequestException('日报日期没有唯一有效占栏');
  const [totals]=await m.query(`SELECT COALESCE(SUM(CASE WHEN kind IN ('MORTALITY','REVERSE_MORTALITY') THEN -quantity_delta ELSE 0 END),0)::integer AS deaths,
    COALESCE(SUM(CASE WHEN kind IN ('CULL','REVERSE_CULL') THEN -quantity_delta ELSE 0 END),0)::integer AS culls,
    COALESCE(SUM(quantity_delta) FILTER(WHERE business_date<$2),0)::integer AS opening,
    COALESCE(SUM(quantity_delta),0)::integer AS closing
    FROM brd_flock_events WHERE flock_no=$1 AND business_date<=$2`,[flock.flock_no,next.log_date]);
  const [loss]=await m.query(`SELECT COALESCE(mortality_qty,0) AS deaths,COALESCE(elimination_qty,0) AS culls
    FROM brd_flock_daily_balances WHERE flock_no=$1 AND balance_date=$2`,[flock.flock_no,next.log_date]);
  for (const [key,value] of [['mortality_qty',next.shift==='DAILY'?Number(loss?.deaths??0):0],['elimination_qty',next.shift==='DAILY'?Number(loss?.culls??0):0]] as const) {
    if (input[key]!==undefined && Number(input[key])!==value) throw new BadRequestException('已激活群死淘由生命周期单据汇总，日报不可重复扣减');
    next[key]=value;
  }
  if(prior){
    const gradeMap=(value:any)=>{const map=typeof value==='string'?JSON.parse(value):value;return JSON.stringify(Object.entries(map??{}).filter(([,n])=>Number(n)!==0).sort(([a],[b])=>a.localeCompare(b)));};
    const fields=['eggs_produced','dirty_eggs','broken_eggs','feed_consumed','water_consumed','self_use_qty','temp','humidity','bad_eggs','egg_count'];
    const changed=fields.some(k=>(prior[k]==null)!==(next[k]==null)||(prior[k]!=null&&Number(prior[k])!==Number(next[k])))
      ||['note','operator','mortality_reason','culling_reason','farm_name','project_code','farm_code','company_code','site_code'].some(k=>String(prior[k]??'')!==String(next[k]??''))||gradeMap(prior.eggs_by_grade)!==gradeMap(next.eggs_by_grade);
    if(changed)throw new BadRequestException('该日报已确认，普通新增/修改接口仅接受原值幂等重试；分级、料水和备注更正请使用独立审核的历史日报更正单');
    if(b.closed_on)return {quantity:Number(b.quantity),opening:prior.opening_qty,closing:prior.closing_qty,following:[],replayOnly:true};
  }
  if (next.eggs_produced>0 && !next.eggs_by_grade) throw new BadRequestException('已激活群产蛋必须分级后走受控入库/包装');
  const [sourceSchema]=await m.query("SELECT to_regclass('brd_egg_source_receipts') AS sources");
  if(sourceSchema?.sources && prior) {
    const used=await effectiveProductionReceiptQuantity(m,prior.id);
    const grades=typeof next.eggs_by_grade==='string'?JSON.parse(next.eggs_by_grade):next.eggs_by_grade;
    const original=typeof prior.eggs_by_grade==='string'?JSON.parse(prior.eggs_by_grade):prior.eggs_by_grade;
    const normalized=(map:any)=>JSON.stringify(Object.entries(map??{}).sort(([a],[b])=>a.localeCompare(b)));
    if(normalized(grades)!==normalized(original) && (await m.query("SELECT 1 FROM inv_flock_source_links WHERE daily_log_id=$1 AND precision<>'EXACT' LIMIT 1",[prior.id])).length) throw new BadRequestException('产蛋已进入包装多来源/继承库存，分级更正须先处理下游库存单据');
    if(used<0||used>Object.values(grades??{}).reduce((sum:number,n)=>sum+Number(n),0)) throw new BadRequestException('产蛋来源已接收/入库，日报不能减少到来源数量以下');
    const byGrade=await effectiveExactProductionByGrade(m,prior.id);
    if([...byGrade].some(([grade,n])=>n<0||n>Number(grades?.[grade]??0))) throw new BadRequestException('日报分级不能少于有效已入来源');
  }
  next.occupancy_id=o.id;
  return {quantity:Number(b.quantity),opening:Number(totals.opening),closing:Number(totals.closing),following:[]};
}
