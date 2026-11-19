import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
type Db=Pick<EntityManager,'query'>;
/** Acquire before health plan/stock locks; transfer and closure use the identical house domain. */
export async function lockManagedActivity(m: Db,flockNo: string) {
  const [schema]=await m.query("SELECT to_regclass('brd_flock_balances') AS ledger");if(!schema?.ledger)return null;
  const [b]=await m.query('SELECT house_code FROM brd_flock_balances WHERE flock_no=$1',[flockNo]);if(!b)return null;
  await m.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1))",[b.house_code]);
  const [o]=await m.query(`SELECT o.*,o.began_on::text AS began_on,b.closed_on FROM brd_flock_balances b JOIN brd_flock_occupancies o ON o.flock_no=b.flock_no
    AND o.ended_on IS NULL WHERE b.flock_no=$1`,[flockNo]);
  if(!o || o.closed_on) throw new BadRequestException('已关闭群的免疫/用药需受控历史更正，禁止普通变更');
  if(o.house_code!==b.house_code) throw new ConflictException('鸡群已转舍，请刷新重试');
  return o;
}
export async function recordFlockActivity(m: Db,kind: string,id: unknown,o: any,day: string) {
  if(!o)return;
  if(day<o.began_on)throw new BadRequestException('活动发生日期早于当前占栏，须经历史更正流程核对位置');
  const [schema]=await m.query("SELECT to_regclass('brd_flock_activity_sources') AS activities");
  if(!schema?.activities)throw new BadRequestException('生命周期健康来源迁移未完成');
  await m.query(`INSERT INTO brd_flock_activity_sources(activity_type,activity_id,occupancy_id,flock_no,house_code,farm_code,site_code,company_code,business_date)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[kind,String(id),o.id,o.flock_no,o.house_code,o.farm_code,o.site_code,o.company_code,day]);
}
