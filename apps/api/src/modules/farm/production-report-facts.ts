import type { EntityManager } from 'typeorm';

// Event identity is captured at posting, including for reversals. Resolving today's
// house from the flock/date would move pre-transfer losses into the receiving house.
export const occupancyLossesSql = `SELECT e.occupancy_id,e.flock_no,e.house_code,e.company_code,e.farm_code,e.site_code,
    e.business_date AS log_date,
    -SUM(CASE WHEN e.kind IN ('MORTALITY','REVERSE_MORTALITY') THEN e.quantity_delta ELSE 0 END)::int AS mortality_qty,
    -SUM(CASE WHEN e.kind IN ('CULL','REVERSE_CULL') THEN e.quantity_delta ELSE 0 END)::int AS elimination_qty
  FROM brd_flock_events e
  WHERE e.occupancy_id IS NOT NULL AND e.kind IN ('MORTALITY','REVERSE_MORTALITY','CULL','REVERSE_CULL')
  GROUP BY e.occupancy_id,e.flock_no,e.house_code,e.company_code,e.farm_code,e.site_code,e.business_date`;

/** Managed DAILY reports cache the losses of their own occupancy and day. */
export async function reportOccupancyLosses(m: EntityManager, occupancyId: string, date: string) {
  const [loss] = await m.query(
    `SELECT mortality_qty,elimination_qty FROM (${occupancyLossesSql}) losses
      WHERE occupancy_id=$1 AND log_date=$2`,
    [occupancyId, date],
  );
  return { mortality_qty: Number(loss?.mortality_qty ?? 0), elimination_qty: Number(loss?.elimination_qty ?? 0) };
}

/** Reports retain shift grain. Each managed occupancy/day contributes its event losses exactly once. */
export function productionReportFactsSql(ledger: boolean) {
  const legacyLoss = ledger ? 'd.occupancy_id IS NULL' : 'true';
  const report = `SELECT d.id,d.flock_no,d.house_code,d.farm_code,d.site_code,d.company_code,
    ${ledger ? 'd.occupancy_id' : 'NULL::text'} AS occupancy_id, d.log_date,
    d.eggs_produced,d.dirty_eggs,d.broken_eggs,d.eggs_by_grade,d.feed_consumed,d.water_consumed,d.closing_qty,
    CASE WHEN ${legacyLoss} THEN d.mortality_qty ELSE 0 END AS mortality_qty,
    CASE WHEN ${legacyLoss} THEN d.elimination_qty ELSE 0 END AS elimination_qty,
    to_jsonb(d)->>'culling_reason' AS culling_reason,to_jsonb(d)->>'mortality_reason' AS mortality_reason,true AS has_production_report
    FROM brd_daily_logs d`;
  if (!ledger) return report;
  return `${report}
    UNION ALL SELECT 0,e.flock_no,e.house_code,e.farm_code,e.site_code,e.company_code,e.occupancy_id,e.log_date,
      NULL,NULL,NULL,NULL::jsonb,NULL,NULL,NULL,e.mortality_qty,e.elimination_qty,NULL,NULL,false
    FROM (${occupancyLossesSql}) e`;
}
