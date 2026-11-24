import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { OrgScope } from './farm.service';
type Db=Pick<EntityManager,'query'>;

/** No current-house inference: use the immutable report/occupancy and actual grading input links. */
export async function recordFlockProductionSources(m: Db,p: {
  companyCode: string; eggDate: string; qty: number; qualityGrade?: string; sourceType?: string; packagingBatchRef?: string;
}, batchNo: string, profiles: Array<{houseCode: string; profileCode: string; [key: string]: any}>,scope: OrgScope={isGlobal:false,farmCode:null,siteCode:null}) {
  const [schema]=await m.query("SELECT to_regclass('inv_flock_source_links') AS links");
  if (!schema?.links || !profiles.length) return;
  if(p.sourceType==='PACKAGING'&&p.packagingBatchRef){
    const [rawSchema]=await m.query("SELECT to_regclass('production_raw_receipts') AS raw");
    if(rawSchema?.raw&&(await m.query(`SELECT 1 FROM production_raw_receipts r
      JOIN pkg_grading_source_links l ON l.source_batch_id=r.source_batch_id JOIN pkg_grading_records g ON g.id=l.grading_id
      JOIN pkg_packing_records pk ON g.code IN(SELECT jsonb_array_elements_text(CASE
        WHEN jsonb_typeof(pk.grading_codes_json)='array' AND jsonb_array_length(pk.grading_codes_json)>0
        THEN pk.grading_codes_json ELSE jsonb_build_array(pk.grading_code) END))
      WHERE pk.code=$1 AND r.state<>'CANCELLED' LIMIT 1`,[p.packagingBatchRef])).length)
      throw new ConflictException('该包装来源已进入正式原始收蛋，须按受控实耗转换，禁止旧路径重复认领');
  }
  const houses=[...new Set(profiles.map(x=>x.houseCode))].sort();
  for (const code of houses) await m.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1))",[code]);
  const states=await m.query('SELECT house_code FROM brd_flock_house_states WHERE house_code=ANY($1)',[houses]);
  if (!states.length) {
    // Pre-baseline house/day reports can still identify an exposed flock; a pooled stock lot cannot.
    const [policy]=await m.query("SELECT to_regprocedure('vet_egg_day_held(text,date)') AS withdrawal");
    if (policy?.withdrawal) {
      if (p.packagingBatchRef) {
        const physical=await m.query('SELECT flock_no,production_date::text AS day FROM vet_egg_batch_sources($1) ORDER BY 1,2',[batchNo]);
        for (const row of physical) {
          if (!row.flock_no || !row.day) throw new BadRequestException('包装库存缺可核验产蛋来源，须留置核对');
          await m.query('SELECT vet_egg_assert_day($1,$2)',[row.flock_no,row.day]);
        }
        return;
      }
      const sources=await m.query(`SELECT DISTINCT d.flock_no FROM brd_daily_logs d WHERE d.house_code=ANY($1)
        AND d.log_date=$2 AND d.flock_no IS NOT NULL
        UNION SELECT r.flock_no FROM brd_egg_course_intervals r WHERE r.house_code=ANY($1) AND r.start_date<=$2
        AND (r.last_day IS NULL OR r.last_day>=$2) AND NOT EXISTS (SELECT 1 FROM brd_daily_logs d
          WHERE d.house_code=r.house_code AND d.log_date=$2 AND d.flock_no IS NOT NULL) ORDER BY 1`,[houses,p.eggDate]);
      for (const row of sources) await m.query('SELECT vet_egg_assert_day($1,$2)',[row.flock_no,p.eggDate]);
    }
    return;
  }
  if (states.length!==houses.length) throw new BadRequestException('合批来源包含未接续基线鸡舍，须先完成来源核对');
  if (!['TEMP_PRODUCTION','PACKAGING'].includes(p.sourceType??'')) throw new BadRequestException('已接续群禁止无受控来源的生产入库');
  let inputs: any[]=[];
  if (p.sourceType==='TEMP_PRODUCTION') {
    if (houses.length!==1) throw new BadRequestException('临时产蛋入库须指定唯一舍日来源');
    inputs=[{house_code:houses[0],source_key:`TEMP:${batchNo}`,quantity:p.qty,input_qty:p.qty,grading_code:'',exact:true}];
  } else {
    if (!p.packagingBatchRef) throw new BadRequestException('包装缺来源单号');
    inputs=await m.query(`SELECT s.id::text AS source_id,s.house_code,s.flock_code,s.received_qty AS quantity,
      s.production_date::text AS production_date,s.lay_date::text AS lay_date,g.code AS grading_code,l.input_qty,
      'PACKAGING:'||s.id::text AS source_key FROM pkg_packing_records pk
      JOIN pkg_grading_records g ON g.code IN (SELECT jsonb_array_elements_text(CASE
        WHEN jsonb_typeof(pk.grading_codes_json)='array' AND jsonb_array_length(pk.grading_codes_json)>0
        THEN pk.grading_codes_json ELSE jsonb_build_array(pk.grading_code) END))
      JOIN pkg_grading_source_links l ON l.grading_id=g.id JOIN pkg_source_batches s ON s.id=l.source_batch_id
      WHERE pk.code=$1 AND NOT pk.is_test AND NOT g.is_test AND NOT s.is_test
      ORDER BY s.id,g.code`,[p.packagingBatchRef]);
    if (!inputs.length || houses.some(code=>!inputs.some(x=>x.house_code===code))) throw new BadRequestException('包装缺真实多来源分级明细，不能猜测分配');
  }
  for (const input of inputs) {
    const productionDate=input.lay_date??input.production_date??p.eggDate;
    const profile=profiles.find(x=>x.houseCode===input.house_code);
    if (!profile || productionDate!==p.eggDate) throw new BadRequestException('生产日期/商业来源与真实采蛋日期不同，须先核对来源档案');
    const logs=await m.query(`SELECT d.id,d.flock_no,d.occupancy_id,d.eggs_by_grade,o.company_code,o.farm_code,o.site_code,o.house_code,
      o.began_on::text AS began_on,o.ended_on::text AS ended_on FROM brd_daily_logs d
      JOIN brd_flock_occupancies o ON o.id=d.occupancy_id AND o.flock_no=d.flock_no
      WHERE d.house_code=$1 AND d.log_date=$2 AND d.shift='DAILY'`,[input.house_code,productionDate]);
    if (logs.length!==1 || logs[0].company_code!==p.companyCode || !logs[0].occupancy_id
      || logs[0].house_code!==input.house_code || logs[0].began_on>productionDate || logs[0].ended_on && logs[0].ended_on<=productionDate
      || input.flock_code && input.flock_code!==logs[0].flock_no) throw new BadRequestException('来源缺唯一已接续日报/占栏，或群身份不一致');
    const d=logs[0];
    if(!scope.isGlobal && !(scope.companyCodes?.includes(d.company_code) || scope.farmCodes?.includes(d.farm_code) || scope.siteCodes?.includes(d.site_code))) throw new BadRequestException('无权认领该公司/场区/农场的产蛋来源');
    const [health]=await m.query("SELECT to_regclass('brd_medication_records') AS medicines");
    if(health?.medicines && (await m.query("SELECT 1 FROM brd_medication_records WHERE flock_no=$1 AND status<>'CANCELLED' AND start_date<=$2 AND (withdraw_until IS NULL OR withdraw_until>=$2) LIMIT 1",[d.flock_no,productionDate])).length) throw new BadRequestException('该日鸡群处于用药/休药隔离期，蛋品不能走正常入库；请由兽医完成隔离处置');
    const grades=typeof d.eggs_by_grade==='string'?JSON.parse(d.eggs_by_grade):d.eggs_by_grade;
    if (!grades || typeof grades!=='object') throw new BadRequestException('日报未分级，不能建立受控产蛋来源');
    const dailyTotal=Object.values(grades).reduce((sum: number,n)=>sum+Number(n),0);
    await m.query(`INSERT INTO brd_egg_day_routes(company_code,house_code,production_date,entry_mode) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[p.companyCode,input.house_code,productionDate,p.sourceType]);
    const [route]=await m.query('SELECT entry_mode FROM brd_egg_day_routes WHERE company_code=$1 AND house_code=$2 AND production_date=$3',[p.companyCode,input.house_code,productionDate]);
    if (route.entry_mode!==p.sourceType) throw new ConflictException('同一产蛋来源已走另一入库路径，禁止两路重复入账');
    const [receipt]=await m.query('SELECT * FROM brd_egg_source_receipts WHERE company_code=$1 AND source_key=$2',[p.companyCode,input.source_key]);
    if (receipt) {
      if (Number(receipt.daily_log_id)!==Number(d.id) || Number(receipt.quantity)!==Number(input.quantity)) throw new ConflictException('已认领产蛋来源数量/日报发生变化');
    } else {
      const [used]=await m.query('SELECT COALESCE(SUM(quantity),0)::integer AS n FROM brd_egg_source_receipts WHERE daily_log_id=$1',[d.id]);
      if (!Number.isSafeInteger(Number(input.quantity)) || input.quantity<=0 || Number(used.n)+Number(input.quantity)>dailyTotal) throw new BadRequestException('来源接收累计超过日报实际产蛋，禁止重复收蛋');
      await m.query(`INSERT INTO brd_egg_source_receipts(company_code,source_key,daily_log_id,occupancy_id,house_code,production_date,quantity,entry_mode)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[p.companyCode,input.source_key,d.id,d.occupancy_id,input.house_code,productionDate,input.quantity,p.sourceType]);
    }
    if (input.exact) {
      const [used]=await m.query(`SELECT COALESCE(SUM(allocated_output_qty),0) AS n FROM inv_flock_source_links l JOIN inv_batches b ON b.batch_no=l.batch_no
        WHERE l.daily_log_id=$1 AND b.quality_grade=$2 AND l.precision='EXACT'`,[d.id,p.qualityGrade]);
      if (Number(used.n)+p.qty>Number(grades[p.qualityGrade??'']??0)) throw new BadRequestException('来源等级数量超过日报');
    }
    if (!(Number(input.input_qty)>0)) throw new BadRequestException('分级来源输入数量必须为正数');
    await m.query(`INSERT INTO inv_flock_source_links(id,batch_no,daily_log_id,occupancy_id,flock_no,house_code,company_code,
      production_date,source_key,grading_code,source_input_qty,batch_output_qty,allocated_output_qty,precision,source_profile_snapshot,origin_batch_no)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$2)`,
      [randomUUID(),batchNo,d.id,d.occupancy_id,d.flock_no,input.house_code,p.companyCode,productionDate,input.source_key,input.grading_code,
        input.input_qty,p.qty,input.exact?p.qty:null,input.exact?'EXACT':'RELATED_INPUT',profile]);
  }
}

/** A split/transfer preserves source relationships; it does not invent per-flock output allocations. */
export async function inheritFlockProductionSources(m: Db,from: string,to: string,quantity: number) {
  const [schema]=await m.query("SELECT to_regclass('inv_flock_source_links') AS links");if(!schema?.links)return;
  const [legacy]=await m.query("SELECT to_regclass('brd_egg_inherited_packs') AS packs");
  if (legacy?.packs) {
    await m.query(`INSERT INTO brd_egg_inherited_packs(batch_no,packing_code)
      SELECT $2,packing_code FROM vet_egg_pack_refs($1) ON CONFLICT DO NOTHING`,[from,to]);
    const [target]=await m.query("SELECT source_type='RETURN' AND status IN ('DAMAGED','QUARANTINE') AND qty_available=0 AS in_custody FROM inv_batches WHERE batch_no=$1",[to]);
    if (!target?.in_custody) {
      const sources=await m.query('SELECT flock_no,production_date::text AS day FROM vet_egg_batch_sources($1) ORDER BY 1,2',[from]);
      for (const row of sources) {
        if (!row.flock_no || !row.day) throw new BadRequestException('包装库存缺可核验产蛋来源，须留置核对');
        await m.query('SELECT vet_egg_assert_day($1,$2)',[row.flock_no,row.day]);
      }
    }
  }
  await m.query(`INSERT INTO inv_flock_source_links(id,batch_no,daily_log_id,occupancy_id,flock_no,house_code,company_code,production_date,
    source_key,grading_code,source_input_qty,batch_output_qty,allocated_output_qty,precision,source_profile_snapshot,origin_batch_no)
    SELECT $2||':'||id,$2,daily_log_id,occupancy_id,flock_no,house_code,company_code,production_date,source_key,grading_code,
    source_input_qty,$3,NULL,'INHERITED',source_profile_snapshot,origin_batch_no FROM inv_flock_source_links WHERE batch_no=$1
    ON CONFLICT(batch_no,daily_log_id,source_key,grading_code) DO NOTHING`,[from,to,quantity]);
}
