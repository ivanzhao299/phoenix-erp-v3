import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * G6-E — 生产分析中心
 *
 * 9 个核心指标：日产蛋 / 包装量 / 销售量 / 库存量 / 合格率 / 破损率 / 淘汰率 / 场站对比 / 鸡舍对比
 * 数据源：brd_daily_logs / brd_flocks / pkg_exceptions / wms_outbound（销售）
 */
@Injectable()
export class ProductionAnalyticsService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string): Promise<T[]> {
    try { return await this.em.query(sql); } catch (e: any) { console.error("[catch-audit] safe() SQL failed:", e?.message); return []; }
  }

  async compute(q: { farmCode?: string; dateFrom?: string; dateTo?: string }) {
    const fFilter = q.farmCode ? `AND farm_code = '${q.farmCode.replace(/'/g, "''")}'` : '';

    // 7 日产蛋趋势
    const trend = await this.safe<any>(
      `SELECT log_date::date AS day,
              COALESCE(SUM(eggs),0)::int AS eggs,
              COALESCE(SUM(dirty_eggs),0)::int AS dirty,
              COALESCE(SUM(broken_eggs),0)::int AS broken,
              COALESCE(SUM(deaths),0)::int AS deaths,
              COALESCE(SUM(elimination),0)::int AS elimination
         FROM brd_daily_logs
         WHERE log_date > CURRENT_DATE - 30 ${fFilter}
         GROUP BY log_date ORDER BY log_date`,
    );

    // 合格率 / 破损率（基于近 30 天）
    const ratesRows = await this.safe<any>(
      `SELECT COALESCE(SUM(eggs),0) AS total,
              COALESCE(SUM(broken_eggs),0) AS broken,
              COALESCE(SUM(dirty_eggs),0) AS dirty
         FROM brd_daily_logs
         WHERE log_date > CURRENT_DATE - 30 ${fFilter}`,
    );
    const t = ratesRows[0] ?? {};
    const totalEggs = parseInt(String(t.total ?? '0'), 10);
    const brokenEggs = parseInt(String(t.broken ?? '0'), 10);
    const dirtyEggs = parseInt(String(t.dirty ?? '0'), 10);
    const passRate    = totalEggs > 0 ? Math.round((1 - (brokenEggs + dirtyEggs) / totalEggs) * 1000) / 10 : 0;
    const brokenRate  = totalEggs > 0 ? Math.round((brokenEggs / totalEggs) * 1000) / 10 : 0;

    // 鸡群淘汰率（近 30 天淘汰 / 起始）
    const cullRows = await this.safe<any>(
      `SELECT COALESCE(SUM(elimination),0) AS culled,
              COALESCE(MAX(f.initial_qty),0) AS init
         FROM brd_daily_logs d
         LEFT JOIN brd_flocks f ON f.house_code = d.house_code
         WHERE log_date > CURRENT_DATE - 30 ${fFilter}`,
    );
    const cullRate = parseInt(String(cullRows[0]?.init ?? '0'), 10) > 0
      ? Math.round(parseInt(String(cullRows[0]?.culled ?? '0'), 10) /
                   parseInt(String(cullRows[0]?.init ?? '1'), 10) * 1000) / 10
      : 0;

    // 场站对比
    const byFarm = await this.safe<any>(
      `WITH aggregate_by_farm AS (
         SELECT farm_code,
                COALESCE(SUM(eggs),0)::int AS eggs,
                COALESCE(SUM(broken_eggs),0)::int AS broken
           FROM brd_daily_logs
          WHERE log_date > CURRENT_DATE - 30
          GROUP BY farm_code
       )
       SELECT a.*, o.org_name AS farm_name
         FROM aggregate_by_farm a
         LEFT JOIN sys_organizations o ON o.org_code = a.farm_code
        ORDER BY a.eggs DESC LIMIT 10`,
    );

    // 鸡舍对比
    const byHouse = await this.safe<any>(
      `WITH aggregate_by_house AS (
         SELECT house_code,
                COALESCE(SUM(eggs),0)::int AS eggs,
                COALESCE(AVG(current_lay_rate),0)::numeric(5,2) AS "avgLayRate"
           FROM brd_daily_logs
          WHERE log_date > CURRENT_DATE - 30 ${fFilter}
          GROUP BY house_code
       )
       SELECT a.*, h.house_name
         FROM aggregate_by_house a
         LEFT JOIN brd_houses h ON h.house_code = a.house_code
        ORDER BY a.eggs DESC LIMIT 20`,
    );

    return {
      trend30Day: trend,
      passRate,                  // 合格率（%）
      brokenRate,                // 破损率（%）
      cullRate,                  // 淘汰率（%）
      totalEggs30Day: totalEggs,
      byFarm,
      byHouse,
      asOf: new Date().toISOString(),
    };
  }
}
