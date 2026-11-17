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
    const params: unknown[] = [q.dateFrom || null, q.dateTo || null, q.farmCode || null];
    const scoped = dailyLogScopeWhere(scope, params);
    const reports = `WITH reports AS (
      SELECT dl.* FROM brd_daily_logs dl
      LEFT JOIN brd_houses h ON h.house_code=dl.house_code
      LEFT JOIN brd_farms hf ON hf.farm_code=h.farm_code AND hf.status='ACTIVE'
      WHERE dl.log_date >= COALESCE($1::date,CURRENT_DATE-29)
        AND dl.log_date <= COALESCE($2::date,CURRENT_DATE)
        AND ($3::text IS NULL OR COALESCE(dl.farm_code,h.farm_code)=$3)
        ${scoped ? `AND ${scoped}` : ''}
    )`;
    const query = (sql: string) => this.em.query(`${reports} ${sql}`, params);
    // Do not turn a SQL/schema failure into a misleading zero production KPI.
    const trend = await query(`SELECT log_date::date AS day,
      COALESCE(SUM(eggs_produced),0)::int AS eggs, COALESCE(SUM(dirty_eggs),0)::int AS dirty,
      COALESCE(SUM(broken_eggs),0)::int AS broken, COALESCE(SUM(mortality_qty),0)::int AS deaths,
      COALESCE(SUM(elimination_qty),0)::int AS elimination FROM reports GROUP BY log_date ORDER BY log_date`);
    const rates = (await query(`SELECT COALESCE(SUM(eggs_produced),0)::numeric AS saleable,
      COALESCE(SUM(dirty_eggs),0)::numeric AS dirty, COALESCE(SUM(broken_eggs),0)::numeric AS broken,
      COALESCE(SUM(CASE WHEN jsonb_typeof(eggs_by_grade)='object' AND eggs_by_grade<>'{}'::jsonb
        THEN (SELECT SUM(value::numeric) FROM jsonb_each_text(eggs_by_grade))
        ELSE COALESCE(eggs_produced,0)+COALESCE(dirty_eggs,0)+COALESCE(broken_eggs,0) END),0)::numeric AS total
      FROM reports`))[0];
    // Each flock's initial count enters once; joining each day by house duplicates cohorts.
    const cull = (await query(`, per_flock AS (
      SELECT flock_no, SUM(COALESCE(elimination_qty,0)) AS culled FROM reports GROUP BY flock_no
    ) SELECT COALESCE(SUM(p.culled),0)::numeric AS culled, COALESCE(SUM(f.initial_qty),0)::numeric AS init
      FROM per_flock p LEFT JOIN brd_flocks f ON f.flock_no=p.flock_no`))[0];
    const byFarm = await query(`, aggregate_by_farm AS (
      SELECT farm_code, COALESCE(SUM(eggs_produced),0)::int AS eggs,
        COALESCE(SUM(broken_eggs),0)::int AS broken FROM reports GROUP BY farm_code
    ) SELECT a.*, o.org_name AS farm_name FROM aggregate_by_farm a
      LEFT JOIN sys_organizations o ON o.org_code = a.farm_code ORDER BY a.eggs DESC LIMIT 10`);
    const byHouse = await query(`, house_days AS (
      SELECT house_code,log_date,SUM(COALESCE(eggs_produced,0)) AS eggs,
        (ARRAY_AGG(closing_qty ORDER BY id DESC))[1] AS closing_qty
        FROM reports GROUP BY house_code,log_date
    ), aggregate_by_house AS (
      SELECT house_code, COALESCE(SUM(eggs),0)::int AS eggs,
        CASE WHEN COUNT(closing_qty)=COUNT(*) AND SUM(closing_qty)>0
          THEN ROUND(SUM(eggs)*100.0/SUM(closing_qty),2) ELSE NULL END AS "avgLayRate"
        FROM house_days GROUP BY house_code
    ) SELECT a.*, h.house_name FROM aggregate_by_house a
      LEFT JOIN brd_houses h ON h.house_code = a.house_code ORDER BY a.eggs DESC LIMIT 20`);
    const total = Number(rates?.total ?? 0);
    const percent = (n: unknown, d: number) => d > 0 ? Math.round(Number(n ?? 0)*1000/d)/10 : 0;
    return { trend30Day: trend, passRate: percent(rates?.saleable,total), brokenRate: percent(rates?.broken,total),
      cullRate: percent(cull?.culled,Number(cull?.init ?? 0)), totalEggs30Day: total, byFarm, byHouse,
      asOf: new Date().toISOString() };
  }
}
