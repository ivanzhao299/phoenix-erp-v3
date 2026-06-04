import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * G6-C — 销售分析中心
 *
 * 注意：sales-v2 模块已有 `sales-analytics.service.ts` 提供 11 个 SQL 方法。
 * 本 service 提供 G6 标准化的"销售分析摘要"，作为 /analytics/sales 的轻量门面。
 *
 * 业务子项请直接调 `/api/v2/sales/analytics/*`：
 *   - /overview / top-customers / top-products / sales-trend / channel-analysis
 *   - /price-anomalies / delivery-performance / return-analysis / loss-analysis
 *   - /inventory-turnover / credit-risk
 */
@Injectable()
export class SalesAnalyticsAggregatorService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string): Promise<T[]> {
    try { return await this.em.query(sql); } catch { return []; }
  }

  async compute(q: { companyCode?: string }) {
    const cFilter = q.companyCode ? `AND company_code = '${q.companyCode.replace(/'/g, "''")}'` : '';

    const topCustomers = await this.safe<any>(
      `SELECT customer_code, customer_name, COUNT(*)::int AS orders,
              SUM(total_amount)::text AS revenue
         FROM sal_sales_orders WHERE customer_code IS NOT NULL ${cFilter}
         GROUP BY customer_code, customer_name
         ORDER BY SUM(total_amount) DESC LIMIT 10`,
    );

    const topProducts = await this.safe<any>(
      `SELECT soi.product_code, SUM(soi.qty)::int AS qty,
              SUM(soi.actual_unit_price * soi.qty)::text AS revenue
         FROM sal_order_items soi
         JOIN sal_sales_orders so ON so.id = soi.so_id
         WHERE 1=1 ${q.companyCode ? `AND so.company_code = '${q.companyCode.replace(/'/g, "''")}'` : ''}
         GROUP BY soi.product_code ORDER BY SUM(soi.qty) DESC LIMIT 10`,
    );

    const byChannel = await this.safe<any>(
      `SELECT channel_code, COUNT(*)::int AS orders, SUM(total_amount)::text AS revenue
         FROM sal_sales_orders WHERE channel_code IS NOT NULL ${cFilter}
         GROUP BY channel_code ORDER BY SUM(total_amount) DESC`,
    );

    const trend = await this.safe<any>(
      `SELECT DATE_TRUNC('day', created_at)::date AS day,
              COUNT(*)::int AS orders, SUM(total_amount)::text AS revenue
         FROM sal_sales_orders WHERE created_at > NOW() - INTERVAL '30 days' ${cFilter}
         GROUP BY DATE_TRUNC('day', created_at) ORDER BY day`,
    );

    const repeatRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE order_cnt > 1) / NULLIF(COUNT(*),0), 1),0)::text AS v
         FROM (SELECT customer_code, COUNT(*) AS order_cnt FROM sal_sales_orders
                 WHERE customer_code IS NOT NULL ${cFilter} GROUP BY customer_code) x`,
    );

    return {
      topCustomers, topProducts, byChannel, trend30Day: trend,
      repurchaseRatePct: parseFloat(repeatRows[0]?.v ?? '0'),
      hint: '更多细分调用 /api/v2/sales/analytics/*',
      asOf: new Date().toISOString(),
    };
  }
}
