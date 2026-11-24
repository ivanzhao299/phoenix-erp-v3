import { BadRequestException } from '@nestjs/common';

export const vetFlockSource = `SELECT f.flock_no, f.status, b.closed_on,
  COALESCE(b.house_code,f.house_code) AS house_code, COALESCE(b.farm_code,f.farm_code) AS farm_code,
  COALESCE(NULLIF(b.site_code,''),farm.mapped_site_code) AS site_code,
  COALESCE(b.company_code,farm.company_code) AS company_code, COALESCE(b.quantity,f.current_qty) AS current_qty
  FROM brd_flocks f LEFT JOIN brd_flock_balances b ON b.flock_no=f.flock_no
  JOIN brd_farms farm ON farm.farm_code=COALESCE(b.farm_code,f.farm_code)`;

export const inactiveFlockStates = ['INACTIVE','CANCELLED','CLOSED','DELETED','RETIRED','SOLD','CULLED'];

export async function validateVetFlock(db: {query:(sql:string,args:unknown[])=>Promise<any[]>},
  input: {flock_no:string;house_code?:string;farm_code:string;site_code:string;company_code:string},
  heads?:number|string) {
  const [flock] = await db.query(`${vetFlockSource} WHERE f.flock_no=$1 FOR SHARE OF f`,[input.flock_no]);
  if (!flock) throw new BadRequestException(`鸡群 ${input.flock_no} 不存在`);
  if (flock.closed_on || inactiveFlockStates.includes(String(flock.status).toUpperCase()) || !(Number(flock.current_qty)>0)) {
    throw new BadRequestException('鸡群已关闭或没有可登记存栏');
  }
  if (!flock.house_code || (input.house_code && input.house_code !== flock.house_code) ||
      flock.farm_code !== input.farm_code || flock.site_code !== input.site_code || flock.company_code !== input.company_code) {
    throw new BadRequestException('鸡群与鸡舍、农场、场站或公司归属不一致，请重新选择');
  }
  if (heads != null && (!Number.isSafeInteger(Number(heads)) || Number(heads)<=0 || Number(heads)>Number(flock.current_qty))) {
    throw new BadRequestException(`登记羽数须为正整数且不超过当前存栏 ${flock.current_qty}`);
  }
  return String(flock.house_code);
}
