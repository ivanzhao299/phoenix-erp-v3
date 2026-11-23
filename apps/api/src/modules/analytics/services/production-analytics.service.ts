import { productionReportFactsSql } from '../../farm/production-report-facts';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { OrgScope, dailyLogScopeWhere } from '../../farm/farm.service';

/** Production reports use canonical daily facts, with the same resolved scope as the farm. */
@Injectable()
export class ProductionAnalyticsService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  async compute(q: { farmCode?: string; dateFrom?: string; dateTo?: string },
    scope: OrgScope = { isGlobal: false, farmCode: null, siteCode: null }) {
    const [schema]=await this.em.query("SELECT to_regclass('brd_flock_daily_balances') AS ledger");
    const params: unknown[] = [q.dateFrom || null, q.dateTo || null, q.farmCode || null];
    const scoped = dailyLogScopeWhere(scope, params);
    const reports = `WITH reports AS (
      SELECT dl.* FROM (${productionReportFactsSql(Boolean(schema?.ledger))}) dl
      LEFT JOIN brd_houses h ON h.house_code=dl.house_code
      LEFT JOIN brd_farms hf ON hf.farm_code=h.farm_code AND hf.status='ACTIVE'
      WHERE dl.log_date >= COALESCE($1::date,CURRENT_DATE-29)
        AND dl.log_date <= COALESCE($2::date,CURRENT_DATE)
        AND ($3::text IS NULL OR COALESCE(dl.farm_code,h.farm_code)=$3)
        ${scoped ? `AND ${scoped}` : ''}
    )`;
    const query = (sql: string) => this.em.query(`${reports} ${sql}`, params);
    // Do not turn a SQL/schema failure into a misleading zero production KPI.
    const trend = await query(`SELECT log_date::text AS day,
      SUM(eggs_produced)::int AS eggs, SUM(dirty_eggs)::int AS dirty,
      SUM(broken_eggs)::int AS broken, COUNT(*) FILTER (WHERE has_production_report)::int AS report_count, COALESCE(SUM(mortality_qty),0)::int AS deaths,
      COALESCE(SUM(elimination_qty),0)::int AS elimination,SUM(feed_consumed)::numeric AS feed_kg,SUM(water_consumed)::numeric AS water_l,
      COUNT(*) FILTER (WHERE has_production_report AND feed_consumed IS NULL)::int AS feed_missing,
      COUNT(*) FILTER (WHERE has_production_report AND water_consumed IS NULL)::int AS water_missing FROM reports GROUP BY log_date ORDER BY log_date`);
    const rates = (await query(`SELECT COALESCE(SUM(eggs_produced),0)::numeric AS saleable,
      COALESCE(SUM(dirty_eggs),0)::numeric AS dirty, COALESCE(SUM(broken_eggs),0)::numeric AS broken,
      COALESCE(SUM(CASE WHEN jsonb_typeof(eggs_by_grade)='object' AND eggs_by_grade<>'{}'::jsonb
        THEN (SELECT SUM(value::numeric) FROM jsonb_each_text(eggs_by_grade))
        ELSE COALESCE(eggs_produced,0)+COALESCE(dirty_eggs,0)+COALESCE(broken_eggs,0) END),0)::numeric AS total
      FROM reports`))[0];
    // Each flock's initial count enters once; joining each day by house duplicates cohorts.
    const cull = (await query(`, per_flock AS (
      SELECT flock_no, SUM(COALESCE(elimination_qty,0)) AS culled FROM reports GROUP BY flock_no
    ) SELECT COALESCE(SUM(p.culled),0)::numeric AS culled, COALESCE(SUM(${schema?.ledger?`COALESCE((SELECT SUM(e.quantity_delta) FROM brd_flock_events e WHERE e.flock_no=f.flock_no AND e.kind IN ('BASELINE','ADMIT')),f.initial_qty)`:'f.initial_qty'}),0)::numeric AS init
      FROM per_flock p LEFT JOIN brd_flocks f ON f.flock_no=p.flock_no`))[0];
    const byFarm = await query(`, aggregate_by_farm AS (
      SELECT COALESCE(r.farm_code,h.farm_code) AS farm_code,SUM(r.eggs_produced)::int AS eggs, SUM(r.mortality_qty)::int AS deaths,SUM(r.elimination_qty)::int AS elimination,
        SUM(r.broken_eggs)::int AS broken FROM reports r LEFT JOIN brd_houses h ON h.house_code=r.house_code GROUP BY COALESCE(r.farm_code,h.farm_code)
    ) SELECT a.*, o.org_name AS farm_name FROM aggregate_by_farm a
      LEFT JOIN sys_organizations o ON o.org_code = a.farm_code ORDER BY a.eggs DESC NULLS LAST,a.farm_code`);
    const byHouse = await query(`, house_days AS (
      SELECT house_code,log_date,SUM(eggs_produced) AS eggs,SUM(mortality_qty) AS deaths,SUM(elimination_qty) AS elimination,
        (ARRAY_AGG(closing_qty ORDER BY id DESC) FILTER (WHERE has_production_report))[1] AS closing_qty,BOOL_OR(has_production_report) AS has_production_report
        FROM reports GROUP BY house_code,log_date
    ), aggregate_by_house AS (
      SELECT house_code,SUM(eggs)::int AS eggs,SUM(deaths)::int AS deaths,SUM(elimination)::int AS elimination,
        CASE WHEN COUNT(closing_qty)=COUNT(*) FILTER (WHERE has_production_report) AND SUM(closing_qty)>0
          THEN ROUND(SUM(eggs)*100.0/SUM(closing_qty),2) ELSE NULL END AS "avgLayRate"
        FROM house_days GROUP BY house_code
    ) SELECT a.*, h.house_name FROM aggregate_by_house a
      LEFT JOIN brd_houses h ON h.house_code = a.house_code ORDER BY a.eggs DESC NULLS LAST,a.house_code`);
    const total = Number(rates?.total ?? 0);
    const percent = (n: unknown, d: number) => d > 0 ? Math.round(Number(n ?? 0)*1000/d)/10 : 0;
    return { trend30Day: trend, passRate: percent(rates?.saleable,total), brokenRate: percent(rates?.broken,total),
      cullRate: percent(cull?.culled,Number(cull?.init ?? 0)), totalEggs30Day: total, byFarm, byHouse,
      denominatorBasis:{layRate:'已报产蛋舍日的日末存栏羽日；未报产蛋事件日不假定零产蛋',cullRate:'已接续群按批准基线/入栏数；未接续群按历史初始记录'},
      asOf: new Date().toISOString() };
  }
}
