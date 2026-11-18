import { EntityManager } from 'typeorm';

type Db = Pick<EntityManager,'query'>;

export async function refreshDailyFlockLayRate(m:Db,flockNo:string):Promise<void> {
  await m.query(`UPDATE brd_flocks SET current_lay_rate=COALESCE((SELECT CASE WHEN MAX(closing_qty)>0
    THEN ROUND(SUM(eggs_produced)::numeric*100/MAX(closing_qty),2) ELSE 0 END FROM brd_daily_logs
    WHERE flock_no=$1 AND log_date=(SELECT MAX(log_date) FROM brd_daily_logs WHERE flock_no=$1)),0) WHERE flock_no=$1`,[flockNo]);
}

/** Compensations only count after the approved original-allocation reversal has posted. */
export async function productionSourceCompensations(m: Db, dailyLogId: number): Promise<Map<string,number>> {
  const [schema] = await m.query("SELECT to_regclass('production_inbound_allocations') AS allocations");
  if (!schema?.allocations) return new Map(); // Older fixture/legacy schema has no formal postings.
  const rows = await m.query(`SELECT original.source_link_id,l.grade_code,SUM(a.quantity)::int AS quantity
    FROM production_inbound_allocations a JOIN production_inbound_allocations original ON original.id=a.original_allocation_id
    JOIN production_inbound_documents doc ON doc.id=a.document_id AND doc.kind='REVERSAL' AND doc.state='POSTED'
    JOIN production_inbound_lines l ON l.document_id=original.document_id AND l.line_no=original.line_no
    WHERE a.daily_log_id=$1 AND a.direction=-1 GROUP BY original.source_link_id,l.grade_code`, [dailyLogId]);
  return new Map(rows.map((r: any) => [`${r.source_link_id}:${r.grade_code}`,Number(r.quantity)]));
}

export async function effectiveProductionReceiptQuantity(m: Db, dailyLogId: number): Promise<number> {
  const [row] = await m.query('SELECT COALESCE(SUM(quantity),0)::integer AS n FROM brd_egg_source_receipts WHERE daily_log_id=$1',[dailyLogId]);
  const compensated = await productionSourceCompensations(m,dailyLogId);
  return Number(row?.n ?? 0)-[...compensated.values()].reduce((n,q) => n+q,0);
}

export async function effectiveExactProductionByGrade(m: Db, dailyLogId: number): Promise<Map<string,number>> {
  const rows = await m.query(`SELECT b.quality_grade AS grade_code,SUM(l.source_input_qty) AS n
    FROM inv_flock_source_links l LEFT JOIN inv_batches b ON b.batch_no=l.origin_batch_no
    WHERE l.daily_log_id=$1 AND l.precision='EXACT' GROUP BY b.quality_grade`, [dailyLogId]);
  const compensated = await productionSourceCompensations(m,dailyLogId);
  const result = new Map<string,number>();
  for (const row of rows) result.set(row.grade_code,Number(row.n ?? 0));
  for (const [key,quantity] of compensated) {
    const grade = key.slice(key.lastIndexOf(':')+1);
    result.set(grade,(result.get(grade) ?? 0)-quantity);
  }
  return result;
}
