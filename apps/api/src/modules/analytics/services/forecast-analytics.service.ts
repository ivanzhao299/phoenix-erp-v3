import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface ForecastSeries {
  metric: string;
  history: Array<{ date: string; value: number }>;
  forecast7d: Array<{ date: string; value: number }>;
  forecast30d: Array<{ date: string; value: number }>;
  forecast90d: Array<{ date: string; value: number }>;
  method: 'MOVING_AVERAGE_7D' | 'LINEAR_REGRESSION';
}

/**
 * G6-H — 预测分析中心（第一阶段：简单预测）
 *
 * 4 个核心序列：
 *   - 现金流（每日净流入）
 *   - 库存（每日库存量）
 *   - 销售（每日营收）
 *   - 产蛋（每日产蛋）
 *
 * 算法（第一阶段）：
 *   MOVING_AVERAGE_7D — 取近 7 天移动平均，向后投影
 *
 * 周期：7 天 / 30 天 / 90 天
 *
 * 注：第二阶段建议引入季节性 / 节假日 / Holt-Winters，本服务保持接口稳定。
 */
@Injectable()
export class ForecastAnalyticsService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string): Promise<T[]> {
    try { return await this.em.query(sql); } catch (e: any) { console.error("[catch-audit] safe() SQL failed:", e?.message); return []; }
  }

  private movingAvgForecast(history: number[], days: number): number[] {
    const w = Math.min(7, history.length);
    if (w === 0) return Array(days).fill(0);
    const avg = history.slice(-w).reduce((a, b) => a + b, 0) / w;
    return Array(days).fill(Math.round(avg * 100) / 100);
  }

  private buildSeries(metric: string, rows: Array<{ day: string; v: string }>): ForecastSeries {
    const history = rows.map(r => ({ date: r.day, value: parseFloat(r.v) }));
    const values = history.map(h => h.value);
    const today = new Date();
    const project = (n: number) => {
      const start = new Date(today);
      const arr: Array<{ date: string; value: number }> = [];
      const fc = this.movingAvgForecast(values, n);
      for (let i = 1; i <= n; i++) {
        const d = new Date(start); d.setDate(d.getDate() + i);
        arr.push({ date: d.toISOString().slice(0, 10), value: fc[i - 1] });
      }
      return arr;
    };
    return {
      metric, history,
      forecast7d:  project(7),
      forecast30d: project(30),
      forecast90d: project(90),
      method: 'MOVING_AVERAGE_7D',
    };
  }

  async compute(_q: any): Promise<{ series: ForecastSeries[]; asOf: string }> {
    // 销售（30 天历史）
    const sales = await this.safe<{ day: string; v: string }>(
      `SELECT DATE_TRUNC('day', created_at)::date::text AS day,
              COALESCE(SUM(total_amount),0)::text AS v
         FROM sal_sales_orders WHERE created_at > NOW() - INTERVAL '30 days'
         GROUP BY DATE_TRUNC('day', created_at) ORDER BY day`,
    );

    // 产蛋（30 天）
    const eggs = await this.safe<{ day: string; v: string }>(
      `SELECT log_date::text AS day, COALESCE(SUM(eggs),0)::text AS v
         FROM brd_daily_logs WHERE log_date > CURRENT_DATE - 30
         GROUP BY log_date ORDER BY log_date`,
    );

    // 现金流（每日净流入：AR receipts - AP payments）
    const cash = await this.safe<{ day: string; v: string }>(
      `SELECT day::text AS day, COALESCE(SUM(net),0)::text AS v FROM (
         SELECT DATE_TRUNC('day', created_at)::date AS day, amount_original AS net
           FROM fin_ar_receipts WHERE status='CONFIRMED' AND created_at > NOW() - INTERVAL '30 days'
         UNION ALL
         SELECT DATE_TRUNC('day', created_at)::date AS day, -amount_original AS net
           FROM prc2_payments WHERE status IN ('PAID','EXECUTED') AND created_at > NOW() - INTERVAL '30 days'
       ) x GROUP BY day ORDER BY day`,
    );

    // 库存（每日库存量 — 用近 30 天每日截止 inv_batches 总量；用 AVAILABLE 状态）
    const inv = await this.safe<{ day: string; v: string }>(
      `SELECT generate_series.day::text AS day,
              (SELECT COALESCE(SUM(qty),0) FROM inv_batches
                 WHERE created_at <= generate_series.day AND status='AVAILABLE')::text AS v
         FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, INTERVAL '1 day') AS generate_series(day)
         ORDER BY day`,
    );

    return {
      series: [
        this.buildSeries('sales_revenue', sales),
        this.buildSeries('egg_production', eggs),
        this.buildSeries('cash_net_flow', cash),
        this.buildSeries('inventory_qty', inv),
      ],
      asOf: new Date().toISOString(),
    };
  }
}
