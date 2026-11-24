import { NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { dailyLogScopeWhere, type OrgScope, scopeWhere } from './farm.service';
import { productionReportFactsSql } from './production-report-facts';

const businessToday = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Singapore')::date";

export async function readFlockCycle(db: EntityManager, flockNo: string, scope: OrgScope) {
  const params: unknown[] = [flockNo];
  const currentScope = scopeWhere(scope, params, 'owner.');
  const balanceScope = scopeWhere(scope, params, 'b.');
  const admissionScope = scopeWhere(scope, params, 'd.');
  const visibleOccupancy = scopeWhere(scope, params, 'o.');
  const factScope = dailyLogScopeWhere(scope, params, 'dl.');
  const [cycle] = await db.query(`WITH flock AS (
      SELECT f.flock_no,f.status,f.breed_code,f.strain,f.breed_type,f.placement_age,
        CASE WHEN f.placement_date IS NULL OR f.start_date IS NULL OR f.placement_date=f.start_date
          THEN COALESCE(f.placement_date,f.start_date) END AS placement_date,
        f.source_farm,f.house_code,h.house_name,owner.farm_code,owner.farm_name,
        COALESCE(b.quantity,CASE WHEN b.flock_no IS NULL THEN f.current_qty END) AS current_qty,
        b.baseline_on,b.closed_on,b.flock_no IS NOT NULL AS has_ledger,b.flock_no IS NOT NULL AND b.closed_on IS NULL AS active_balance,
        ${businessToday} AS business_today
      FROM brd_flocks f
      LEFT JOIN brd_houses h ON h.house_code=f.house_code
      LEFT JOIN (SELECT farm_code,farm_name,company_code,mapped_site_code AS site_code FROM brd_farms) owner ON owner.farm_code=h.farm_code
      LEFT JOIN brd_flock_balances b ON b.flock_no=f.flock_no
      WHERE f.flock_no=$1 ${currentScope ? 'AND ' + currentScope : ''}
        AND (b.flock_no IS NULL OR (b.house_code=f.house_code AND b.farm_code=owner.farm_code AND b.company_code=owner.company_code
          ${balanceScope ? 'AND ' + balanceScope : ''}))
    ), admission AS (
      SELECT d.id,d.business_date,r.source_kind,r.receipt_reference,r.quantity,
        COALESCE(d.payload->>'sourceCode',d.payload->>'sourceFarmCode') AS source_code
      FROM flock f JOIN brd_flock_documents d ON d.flock_no=f.flock_no AND d.status='POSTED' AND d.kind='ADMIT'
      JOIN brd_flock_admission_receipts r ON r.document_id=d.id AND r.company_code=d.company_code
      WHERE true ${admissionScope ? 'AND ' + admissionScope : ''}
      ORDER BY d.business_date,d.id LIMIT 1
    ), scope_coverage AS (
      SELECT NOT EXISTS(SELECT 1 FROM brd_flock_occupancies o WHERE o.flock_no=$1
        AND (${visibleOccupancy || 'true'}) IS NOT TRUE) AS all_occupancies_visible
    ), facts AS (
      SELECT dl.log_date,dl.house_code,dl.mortality_qty,dl.elimination_qty,dl.has_production_report,dl.eggs_produced
      FROM flock f JOIN (${productionReportFactsSql(true)}) dl ON dl.flock_no=f.flock_no
      LEFT JOIN brd_houses h ON h.house_code=dl.house_code
      LEFT JOIN brd_farms hf ON hf.farm_code=h.farm_code AND hf.status='ACTIVE'
      WHERE dl.flock_no=$1 AND dl.log_date<=COALESCE(f.closed_on,f.business_today) ${factScope ? 'AND ' + factScope : ''}
    ), reports AS (
      SELECT log_date,CASE WHEN COUNT(*)=COUNT(eggs_produced) THEN SUM(eggs_produced) END AS eggs,
        ARRAY_AGG(DISTINCT house_code ORDER BY house_code) FILTER (WHERE house_code IS NOT NULL) AS report_houses
      FROM facts WHERE has_production_report GROUP BY log_date
    ), latest_reports AS (
      SELECT log_date,eggs,report_houses FROM reports ORDER BY log_date DESC LIMIT 30
    )
    SELECT f.flock_no,f.status,f.breed_code,f.strain,f.breed_type,f.placement_age,
      f.placement_date::text,f.house_code,f.house_name,f.farm_code,f.farm_name,f.current_qty,
      f.baseline_on::text,f.closed_on::text,f.active_balance,
      COALESCE(f.closed_on,CASE WHEN f.status IS DISTINCT FROM 'RETIRED' THEN f.business_today END)::text AS age_as_of,
      (SELECT o.id FROM brd_flock_occupancies o WHERE o.flock_no=f.flock_no AND o.house_code=f.house_code
        AND o.ended_on IS NULL ${visibleOccupancy ? 'AND ' + visibleOccupancy : ''}) AS occupancy_id,
      a.id AS admission_id,a.source_kind,a.source_code,a.receipt_reference,a.quantity AS admitted_quantity,
      CASE WHEN NOT f.has_ledger THEN NULLIF(f.source_farm,'') END AS legacy_source,
      CASE WHEN f.has_ledger THEN COALESCE(losses.mortality,0) ELSE losses.mortality END AS mortality,
      CASE WHEN f.has_ledger THEN COALESCE(losses.culled,0) ELSE losses.culled END AS culled,
      (SELECT COUNT(*) FROM reports)::int AS report_days,
      CASE WHEN a.quantity>0 AND coverage.all_occupancies_visible THEN
        (SELECT CASE WHEN COUNT(*)=COUNT(eggs) THEN SUM(eggs) END FROM reports WHERE log_date>=a.business_date) END AS recorded_eggs_for_admitted,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('date',r.log_date,'eggs',r.eggs,'report_houses',r.report_houses,
        'closing_qty',b.closing_qty,'admitted_quantity',CASE WHEN coverage.all_occupancies_visible AND r.log_date>=a.business_date THEN a.quantity END)
        ORDER BY r.log_date DESC)
        FROM latest_reports r LEFT JOIN LATERAL (
          SELECT closing_qty FROM brd_flock_daily_balances WHERE flock_no=f.flock_no AND balance_date<=r.log_date
          ORDER BY balance_date DESC LIMIT 1
        ) b ON coverage.all_occupancies_visible), '[]'::jsonb) AS production
    FROM flock f LEFT JOIN admission a ON true CROSS JOIN scope_coverage coverage
    CROSS JOIN LATERAL (SELECT SUM(mortality_qty) AS mortality,SUM(elimination_qty) AS culled FROM facts) losses`, params);
  if (!cycle) throw new NotFoundException('鸡群档案不存在或不可见');
  return cycle;
}

export async function readFlockCycleCare(db: EntityManager, flockNo: string, scope: OrgScope) {
  const params: unknown[] = [flockNo];
  const where = scopeWhere(scope, params, 'a.');
  return db.query(`SELECT a.activity_type,a.activity_id,a.house_code,a.business_date::text AS business_date
    FROM brd_flock_activity_sources a
    WHERE a.flock_no=$1 AND a.activity_type IN ('IMMUNE_PLAN','IMMUNE_EXECUTION','MEDICATION')
      ${where ? 'AND ' + where : ''} ORDER BY a.business_date DESC,a.recorded_at DESC,a.activity_type,a.activity_id LIMIT 30`, params);
}
