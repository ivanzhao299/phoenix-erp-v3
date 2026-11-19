import { ConflictException } from '@nestjs/common';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';

export function stableProductionJson(value:any):string{
  if(Array.isArray(value))return `[${value.map(stableProductionJson).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableProductionJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const productionContentHash=(value:unknown)=>createHash('sha256').update(stableProductionJson(value)).digest('hex');

/** SITE source-mode keys are authoritative farm codes, including packaging shift.site_id. */
export async function lockProductionEntryMode(m:EntityManager,farmCode:string|undefined,companyCode:string){
  if(!farmCode)throw new ConflictException('缺少实际农场编码，不能推定生产入库路径');
  await m.query('LOCK TABLE inv_source_mode IN SHARE MODE');
  const [mode]=await m.query(`SELECT mode FROM inv_source_mode WHERE(scope_level='SITE' AND scope_code=$1)
    OR(scope_level='COMPANY' AND scope_code=$2) OR(scope_level='GROUP' AND scope_code='ALL')
    ORDER BY CASE scope_level WHEN 'SITE' THEN 1 WHEN 'COMPANY' THEN 2 ELSE 3 END LIMIT 1 FOR SHARE`,[farmCode,companyCode]);
  return mode?.mode as string|undefined;
}

export async function lockRawCollectionReference(m:EntityManager,id:string,d:{companyCode:string;houseCode:string;productionDate:string}){
  if(!/^[1-9]\d{0,18}$/.test(id)||BigInt(id)>9223372036854775807n)throw new ConflictException('实际采集原行无效');
  const [source]=await m.query(`SELECT s.id::text,s.batch_code,s.source_inbound_no,s.house_code,s.flock_code,s.shift_id::text,
    s.production_date::text AS production_date,s.lay_date::text AS lay_date,s.received_qty::text AS received_qty,
    s.total_qty::text AS total_qty,s.dirty_qty::text AS dirty_qty,s.cracked_qty::text AS cracked_qty,s.batch_status,s.is_test,
    to_jsonb(s)-ARRAY['created_at','updated_at'] AS original_record,f.farm_code,f.company_code,
    shift.production_date::text AS shift_date,shift.is_test AS shift_is_test,shift.site_id AS shift_site_id
    FROM pkg_source_batches s JOIN pkg_work_shifts shift ON shift.id=s.shift_id JOIN brd_houses house ON house.house_code=s.house_code
    JOIN ${OrgOwnershipService.FARM_TABLE} f ON f.farm_code=house.farm_code WHERE s.id=$1::bigint FOR SHARE OF s,shift,house,f`,[id]);
  if(!source||source.company_code!==d.companyCode||source.house_code!==d.houseCode||source.production_date!==d.productionDate
    ||source.lay_date&&source.lay_date!==d.productionDate||source.batch_status!=='RECEIVED'||source.is_test!==false
    ||source.shift_site_id!==source.farm_code||source.shift_date!==d.productionDate||source.shift_is_test!==false)
    throw new ConflictException('原始采集记录与实际公司、舍日或包装班次不一致');
  return source;
}

export function assertRawCollectionTotals(source:{received_qty:unknown;total_qty:unknown;dirty_qty:unknown;cracked_qty:unknown},sources:Array<{gradeCode:string;quantity:number}>){
  const values=[source.received_qty,source.total_qty,source.dirty_qty,source.cracked_qty];
  if(values.some(v=>v===null||v===undefined||v===''||!Number.isSafeInteger(Number(v))||Number(v)<0||Number(v)>2147483647))
    throw new ConflictException('采集原行缺少可核验的整数总量及异常档数量');
  const [received,total,dirty,broken]=values.map(Number),sum=(grade?:string)=>sources.filter(s=>!grade||s.gradeCode===grade).reduce((n,s)=>n+s.quantity,0);
  if(total<=0||total!==received||dirty+broken>total||sum()!==total||sum('DIRTY')!==dirty||sum('BROKEN')!==broken)
    throw new ConflictException('交接分段必须与实际采集总量、脏蛋及破蛋数量一致，不能再次扣减或猜测分配');
  return total;
}

export async function assertHandoverNotClaimedByRaw(m:Pick<EntityManager,'query'>,company:string,handoverRef:string,rejectRawSignature=false){
  if(rejectRawSignature&&(await m.query(`SELECT 1 FROM production_physical_handovers h WHERE h.company_code=$1 AND h.handover_ref=$2
    AND h.state<>'CANCELLED' AND h.payload ? 'rawCollection' LIMIT 1`,[company,handoverRef])).length)
    throw new ConflictException('该交接已签认实际原始采集来源，须按原始收蛋路径办理，不能改为库存入库');
  const [schema]=await m.query("SELECT to_regclass('production_raw_receipts') AS raw");
  if(schema?.raw&&(await m.query(`SELECT 1 FROM production_raw_receipts r JOIN production_physical_handovers h ON h.id=r.handover_id
    WHERE h.company_code=$1 AND h.handover_ref=$2 AND r.state<>'CANCELLED' LIMIT 1`,[company,handoverRef])).length)
    throw new ConflictException('该交接已绑定原始收蛋单，须先核验原路径；已过账来源不能废止或重复认领');
}

/** Caller holds the same house/day locks used by posting and report correction. */
export async function lockProductionSourceReports(m:EntityManager,d:{companyCode:string;houseCode:string;productionDate:string}){
  const reports:any[]=await m.query(`SELECT d.id,d.house_code,d.flock_no,d.occupancy_id,d.eggs_by_grade,d.shift,
    d.log_date::text AS production_date,o.company_code,o.farm_code,o.site_code
    FROM brd_daily_logs d JOIN brd_flock_occupancies o ON o.id=d.occupancy_id
      AND o.flock_no=d.flock_no AND o.house_code=d.house_code AND o.company_code=$1
      AND o.began_on<=d.log_date AND (o.ended_on IS NULL OR o.ended_on>d.log_date)
    WHERE d.house_code=$2 AND d.log_date=$3 ORDER BY d.id FOR UPDATE OF d`,[d.companyCode,d.houseCode,d.productionDate]);
  if(!reports.length||reports.some(r=>r.shift==='DAILY')&&reports.length>1)
    throw new ConflictException('缺少已确认且占栏明确的分级日报，或DAILY与班次日报重复覆盖');
  if(reports.some(r=>!r.eggs_by_grade||typeof r.eggs_by_grade!=='object'||Array.isArray(r.eggs_by_grade)
    ||Object.values(r.eggs_by_grade).some(v=>!Number.isSafeInteger(v)||Number(v)<0)))
    throw new ConflictException('日报分级数量必须为非负整数，不能猜测来源');
  return reports.map(r=>({...r,report_hash:productionContentHash(r)}));
}

export async function lockProductionHandoverEvidence(m:EntityManager,d:{companyCode:string;houseCode:string},sources:any[],creator:string){
  const [user]=await m.query('SELECT username FROM sys_user WHERE user_id::text=$1',[creator]);
  for(const a of sources){
    const [file]=await m.query(`SELECT file_id,checksum FROM file_metadata WHERE file_id=$1 AND status='ACTIVE' AND deleted_at IS NULL
      AND visibility IN ('PROTECTED','PRIVATE') AND mime_type IN ('application/pdf','image/png','image/jpeg','image/webp')
      AND module_code='PRODUCTION_INBOUND' AND owner_type='HOUSE' AND owner_id=$2 AND company_code=$3
      AND uploaded_by=$4 AND checksum ~ '^[a-f0-9]{64}$' FOR SHARE`,[a.evidenceFileId,d.houseCode,d.companyCode,user?.username??'']);
    if(!file||a.evidenceChecksum&&a.evidenceChecksum!==file.checksum)throw new ConflictException('交接分段的原证据失效或摘要已改变');
    a.evidenceChecksum=file.checksum;
  }
}
