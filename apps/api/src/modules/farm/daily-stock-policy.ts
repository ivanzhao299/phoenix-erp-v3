import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export function birdCount(value: unknown, field: string): number {
  if (value === null || value === '' || typeof value === 'boolean') {
    throw new BadRequestException(`${field}必须为非负整数`);
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new BadRequestException(`${field}必须为非负整数`);
  return count;
}

/** Preserve the existing balance; never invent a historical opening from initial_qty. */
export function reportLossBalance(current: unknown, previous: Record<string, any> | undefined, next: Record<string, any>): number {
  const loss = (row?: Record<string, any>) => birdCount(row?.mortality_qty ?? 0, '死亡数量')
    + birdCount(row?.elimination_qty ?? 0, '淘汰数量');
  const balance = birdCount(current, '当前存栏') + loss(previous) - loss(next);
  if (!Number.isSafeInteger(balance) || balance < 0) throw new BadRequestException('死淘数量超过可用存栏，请核对鸡群和日报');
  return balance;
}

export async function lockDailyFlock(manager: EntityManager, body: Record<string, any>) {
  // House identity serializes POST upserts and PUT corrections, even before a report exists.
  await manager.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'), hashtext($1))", [body.house_code]);
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',
    [`${body.company_code}|TEMP_PRODUCTION_DAILY|${body.log_date}|HOUSE-${body.house_code}`]);
  const [schema]=await manager.query("SELECT to_regclass('brd_flock_occupancies') AS ledger");
  const managed=schema?.ledger && (await manager.query('SELECT 1 FROM brd_flock_house_states WHERE house_code=$1',[body.house_code])).length;
  const rows = managed ? await manager.query(`SELECT f.flock_no,o.house_code,o.farm_code,f.current_qty,f.status,
    o.company_code,o.began_on::text AS start_date,true AS lifecycle_managed FROM brd_flock_occupancies o JOIN brd_flocks f ON f.flock_no=o.flock_no
    WHERE o.house_code=$1 AND o.began_on<=$2 AND (o.ended_on IS NULL OR o.ended_on>$2) FOR UPDATE OF f`,[body.house_code,body.log_date]) : await manager.query(
    `SELECT flock_no, house_code, farm_code, current_qty, status,
            start_date::text AS start_date
       FROM brd_flocks WHERE house_code=$1
         AND (status IS DISTINCT FROM 'RETIRED' OR COALESCE(current_qty,0)>0)
         AND (start_date IS NULL OR start_date <= $2::date)
       ORDER BY flock_no FOR UPDATE`, [body.house_code, body.log_date],
  );
  // The current report key is house/date/shift, so accepting one of multiple flocks
  // would still overwrite another flock's report. Mixed housing needs the next schema phase.
  if (rows.length !== 1 || !rows[0].start_date
      || !rows[0].lifecycle_managed && !['ACTIVE','GROWING','LAYING','PEAK','DECLINING'].includes(rows[0].status)
      || (body.flock_no && body.flock_no !== rows[0].flock_no)) {
    throw new BadRequestException('日报必须绑定该鸡舍唯一在栏鸡群；缺失、错配或多群需先核对档案');
  }
  if (rows[0].farm_code !== body.farm_code) throw new BadRequestException('鸡群与鸡舍农场归属不一致');
  if(rows[0].lifecycle_managed&&rows[0].company_code!==body.company_code)throw new BadRequestException('历史占栏与当前鸡舍公司归属不一致，须先核对档案，不可重新归属日报');
  return rows[0];
}

export async function prepareDailyBalances(manager: EntityManager, flock: Record<string, any>, prior: Record<string, any> | undefined, next: Record<string, any>) {
  const quantity = reportLossBalance(flock.current_qty, prior, next);
  const delta = quantity - Number(flock.current_qty);
  const following = await manager.query(`SELECT id, opening_qty, closing_qty, mortality_qty, elimination_qty
    FROM brd_daily_logs WHERE flock_no=$1 AND (log_date>$2::date OR (log_date=$2::date AND id>$3))
    ORDER BY log_date,id FOR UPDATE`, [flock.flock_no, next.log_date, prior?.id ?? 2147483647]);
  let opening = prior ? prior.opening_qty : following[0]?.opening_qty ?? flock.current_qty;
  let closing = prior ? prior.closing_qty : (Number(opening) - Number(next.mortality_qty) - Number(next.elimination_qty));
  if (!prior || delta !== 0) {
    // A correction can replay ONLY a proven contiguous snapshot chain. Missing
    // or manually adjusted history needs reconciliation, not an invented opening.
    let cursor = birdCount(opening, '历史开栏存栏');
    const chain = prior ? [prior, ...following] : following;
    for (const row of chain) {
      const loss = birdCount(row.mortality_qty ?? 0, '历史死亡') + birdCount(row.elimination_qty ?? 0, '历史淘汰');
      if (row.opening_qty == null || row.closing_qty == null || Number(row.opening_qty) !== cursor
          || Number(row.closing_qty) !== cursor-loss) {
        throw new BadRequestException('历史存栏快照不连续，须先核对基线后再更正死淘');
      }
      cursor -= loss;
    }
    if (cursor !== Number(flock.current_qty)) throw new BadRequestException('历史存栏与当前余额不一致，须先核对基线');
    closing = Number(opening) - Number(next.mortality_qty) - Number(next.elimination_qty);
    if (closing < 0) throw new BadRequestException('该日报死淘超过当时存栏');
  }
  // Keep unknown historical snapshots unknown on a note/egg-only edit.
  opening = opening == null ? null : Number(opening);
  closing = closing == null ? null : Number(closing);
  return { quantity, opening, closing, following: delta === 0 ? [] : following.map((row: any) => ({
    id: row.id, opening: Number(row.opening_qty)+delta, closing: Number(row.closing_qty)+delta,
  })) };
}

export async function persistDailyBalance(manager: EntityManager, flockNo: string, quantity: number,
  following: Array<{id: number; opening: number; closing: number}>): Promise<void> {
  for (const row of following) {
    await manager.query(`UPDATE brd_daily_logs SET opening_qty=$2::integer, closing_qty=$3::integer,
      lay_rate=CASE WHEN $3::integer>0 THEN ROUND(COALESCE(eggs_produced,0)*100.0/$3::integer,2) ELSE 0 END WHERE id=$1`,
      [row.id,row.opening,row.closing]);
  }
  await manager.query(`UPDATE brd_flocks SET current_qty=$2::integer, current_lay_rate=COALESCE((
    SELECT CASE WHEN $2::integer>0 THEN ROUND(SUM(COALESCE(eggs_produced,0))*100.0/$2::integer,2) ELSE 0 END
      FROM brd_daily_logs WHERE flock_no=$1
        AND log_date=(SELECT MAX(log_date) FROM brd_daily_logs WHERE flock_no=$1)
    ),0), updated_at=NOW() WHERE flock_no=$1`, [flockNo, quantity]);
}
