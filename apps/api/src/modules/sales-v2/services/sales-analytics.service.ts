import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../../org/services/data-scope.service';

/**
 * SalesAnalyticsService — Sales V2 Phase 8
 *
 * 经营分析 Runtime — 11 个只读分析方法。
 *
 * 原则：
 *   · 全部只读，不写 Runtime 数据
 *   · 全部 DataScope（company_code 范围控制）
 *   · 全部参数化 SQL
 *   · 不查 ord_* / fin_transactions 旧表
 *   · 不做复杂 ETL / AI / OLAP
 *
 * 数据来源：
 *   sal_sales_orders / sal_order_items
 *   sal_delivery_orders / sal_delivery_order_items / sal_receipts
 *   sal_return_orders / sal_return_items
 *   sal_customers
 *   fin_ar_invoices
 *   inv_batches / inv_ledger
 */
@Injectable()
export class SalesAnalyticsService {
  private readonly logger = new Logger(SalesAnalyticsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  // ── 内部工具 ─────────────────────────────────────────────────────────────────

  private getScope(): { companyCodes: string[]; scopeAll: boolean } {
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    return scope
      ? { companyCodes: scope.allowedCompanyCodes, scopeAll: scope.isGlobal }
      : { companyCodes: [], scopeAll: false };
  }

  /**
   * 构建 DataScope WHERE 子句片段。
   * 返回 { clause: 'AND company_code = ANY($n)', offset: n+1, params: [...existing, codes[]] }
   */
  private buildScope(
    alias: string,
    existingParams: unknown[],
    companyCodeFilter?: string,
  ): { clause: string; params: unknown[] } {
    const { companyCodes, scopeAll } = this.getScope();
    const params = [...existingParams];

    // 优先使用显式过滤器（前端传来的 companyCode 参数）
    if (companyCodeFilter) {
      params.push(companyCodeFilter);
      return { clause: `AND ${alias}.company_code = $${params.length}`, params };
    }

    // DataScope 控制
    if (!scopeAll) {
      if (companyCodes.length > 0) {
        params.push(companyCodes);
        return { clause: `AND ${alias}.company_code = ANY($${params.length})`, params };
      } else {
        return { clause: 'AND 1=0', params };  // 未配置数据范围 → 拒绝访问
      }
    }

    // scopeAll — 无限制
    return { clause: '', params };
  }

  private n(v: unknown): number {
    return Number(v ?? 0);
  }

  // ── 1. 经营总览 ────────────────────────────────────────────────────────────

  async getOverview(companyCode?: string) {
    const { clause: sc, params: sp } = this.buildScope('so', [], companyCode);

    const [orderStats] = await this.ds.query(
      `SELECT
         COUNT(*)                                               AS total_orders,
         COALESCE(SUM(total_amount)  FILTER (WHERE status NOT IN ('DRAFT','CANCELLED','REJECTED')), 0) AS total_amount,
         COUNT(*) FILTER (WHERE status IN ('DELIVERED','RECEIVED','RECONCILED'))                        AS total_delivered,
         COUNT(*) FILTER (WHERE status NOT IN ('DRAFT','CANCELLED','REJECTED'))                         AS total_active
       FROM sal_sales_orders so
       WHERE 1=1 ${sc}`,
      sp,
    );

    // AR 应收
    const { clause: ac, params: ap } = this.buildScope('ar', [], companyCode);
    const [arStats] = await this.ds.query(
      `SELECT
         COALESCE(SUM(balance_amount_original) FILTER (WHERE status IN ('OPEN','PARTIALLY_RECEIVED','OVERDUE')), 0) AS total_receivable,
         COALESCE(SUM(balance_amount_original) FILTER (WHERE status = 'OVERDUE'), 0)                               AS overdue_receivable
       FROM fin_ar_invoices ar
       WHERE source_type IN ('SALES_ORDER') ${ac}`,
      ap,
    );

    // 退货
    const { clause: rc, params: rp } = this.buildScope('ro', [], companyCode);
    const [returnStats] = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'COMPLETED') AS total_returns,
         COALESCE(SUM(subtotal) FILTER (WHERE status = 'COMPLETED'), 0) AS total_return_amount
       FROM sal_return_orders ro
       WHERE 1=1 ${rc}`,
      rp,
    );

    // 库存
    const { clause: ic, params: ip } = this.buildScope('ib', [], companyCode);
    const [invStats] = await this.ds.query(
      `SELECT
         COALESCE(SUM(qty_available) FILTER (WHERE status = 'AVAILABLE'), 0) AS inventory_balance,
         COUNT(*)                    FILTER (WHERE status = 'AVAILABLE' AND expire_date IS NOT NULL AND expire_date <= CURRENT_DATE + INTERVAL '7 days' AND expire_date >= CURRENT_DATE) AS inventory_expiring
       FROM inv_batches ib
       WHERE 1=1 ${ic}`,
      ip,
    );

    // 损耗
    const { clause: lc, params: lp } = this.buildScope('il', [], companyCode);
    const [lossStats] = await this.ds.query(
      `SELECT COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type IN ('EXPIRE_WRITEOFF','DAMAGE_WRITEOFF','WRITE_OFF')), 0) AS total_loss
       FROM inv_ledger il
       WHERE 1=1 ${lc}`,
      lp,
    );

    // 配送时效
    const { clause: dc, params: dp } = this.buildScope('del', [], companyCode);
    const [deliveryStats] = await this.ds.query(
      `SELECT
         AVG(EXTRACT(EPOCH FROM (completed_at - departure_at))/3600)::numeric(8,2) AS avg_delivery_hours,
         COUNT(*) FILTER (WHERE status = 'COMPLETED') AS total_deliveries,
         COUNT(*) FILTER (WHERE status = 'COMPLETED'
           AND completed_at IS NOT NULL AND departure_at IS NOT NULL
           AND EXTRACT(EPOCH FROM (completed_at - departure_at))/3600 <= 24) AS on_time_deliveries
       FROM sal_delivery_orders del
       WHERE status IN ('COMPLETED','CANCELLED') ${dc}`,
      dp,
    );

    // byCompany
    const { clause: bcc, params: bcp } = this.buildScope('so2', [], companyCode);
    const byCompany = await this.ds.query(
      `SELECT so2.company_code,
         MAX((SELECT COALESCE(o.org_name_cn, o.org_name)
                FROM sys_organizations o
               WHERE o.org_type = 'COMPANY'
                 AND COALESCE(o.company_code, o.org_code) = so2.company_code
               ORDER BY o.org_code LIMIT 1)) AS company_name,
         COUNT(*)                                                                        AS order_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('DRAFT','CANCELLED','REJECTED')), 0) AS sales_amount
       FROM sal_sales_orders so2
       WHERE 1=1 ${bcc}
       GROUP BY so2.company_code
       ORDER BY sales_amount DESC
       LIMIT 10`,
      bcp,
    );

    // byChannel
    const { clause: chc, params: chp } = this.buildScope('so3', [], companyCode);
    const byChannel = await this.ds.query(
      `SELECT COALESCE(so3.channel_code,'DIRECT') AS channel_code,
         MAX((SELECT ch.channel_name FROM sal_channels ch
               WHERE ch.channel_code = so3.channel_code
               ORDER BY ch.id LIMIT 1)) AS channel_name,
         COUNT(*)                                                                        AS order_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('DRAFT','CANCELLED','REJECTED')), 0) AS sales_amount
       FROM sal_sales_orders so3
       WHERE 1=1 ${chc}
       GROUP BY COALESCE(so3.channel_code,'DIRECT')
       ORDER BY sales_amount DESC
       LIMIT 10`,
      chp,
    );

    const totalActive    = this.n(orderStats.total_active);
    const totalReturns   = this.n(returnStats.total_returns);
    const onTimeD        = this.n(deliveryStats.on_time_deliveries);
    const totalDeliveries = this.n(deliveryStats.total_deliveries);

    return {
      totalSalesOrders:     this.n(orderStats.total_orders),
      totalSalesAmount:     this.n(orderStats.total_amount),
      totalDelivered:       this.n(orderStats.total_delivered),
      totalReceivable:      this.n(arStats.total_receivable),
      overdueReceivable:    this.n(arStats.overdue_receivable),
      totalReturns,
      totalReturnAmount:    this.n(returnStats.total_return_amount),
      totalLoss:            this.n(lossStats.total_loss),
      inventoryBalance:     this.n(invStats.inventory_balance),
      inventoryExpiring:    this.n(invStats.inventory_expiring),
      averageDeliveryHours: this.n(deliveryStats.avg_delivery_hours),
      onTimeDeliveryRate:   totalDeliveries > 0 ? +(onTimeD / totalDeliveries * 100).toFixed(1) : 0,
      returnRate:           totalActive > 0 ? +(totalReturns / totalActive * 100).toFixed(2) : 0,
      byCompany,
      byChannel,
    };
  }

  // ── 2. 销售趋势 ────────────────────────────────────────────────────────────

  async getSalesTrend(opts: {
    dateFrom?: string;
    dateTo?: string;
    groupBy?: 'day' | 'week' | 'month';
    companyCode?: string;
  }) {
    const { dateFrom, dateTo, groupBy = 'day', companyCode } = opts;
    const params: unknown[] = [];

    let dateClause = '';
    if (dateFrom) { params.push(dateFrom); dateClause += ` AND so.created_at >= $${params.length}::date`; }
    if (dateTo)   { params.push(dateTo);   dateClause += ` AND so.created_at <= ($${params.length}::date + INTERVAL '1 day')`; }

    const { clause: sc, params: sp } = this.buildScope('so', params, companyCode);
    const finalParams = sp;

    const truncExpr = groupBy === 'month' ? `DATE_TRUNC('month', so.created_at)`
                    : groupBy === 'week'  ? `DATE_TRUNC('week',  so.created_at)`
                    :                       `DATE_TRUNC('day',   so.created_at)`;

    const rows = await this.ds.query(
      `SELECT
         ${truncExpr}::date AS period,
         COUNT(*) FILTER (WHERE status NOT IN ('DRAFT','CANCELLED','REJECTED')) AS order_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('DRAFT','CANCELLED','REJECTED')), 0) AS sales_amount,
         COUNT(*) FILTER (WHERE status IN ('DELIVERED','RECEIVED','RECONCILED'))                       AS delivered_count
       FROM sal_sales_orders so
       WHERE 1=1 ${dateClause} ${sc}
       GROUP BY 1
       ORDER BY 1`,
      finalParams,
    );

    return rows;
  }

  // ── 3. TOP 客户 ────────────────────────────────────────────────────────────

  async getTopCustomers(companyCode?: string, limit = 20) {
    const { clause: sc, params: sp } = this.buildScope('so', [], companyCode);
    const { clause: ac, params: ap } = this.buildScope('ar', [], companyCode);
    const p1 = [...sp, limit];

    const topBySales = await this.ds.query(
      `SELECT
         so.customer_code,
         MAX(so.customer_name)               AS customer_name,
         COUNT(*)                            AS total_orders,
         COALESCE(SUM(so.total_amount)
           FILTER (WHERE so.status NOT IN ('DRAFT','CANCELLED','REJECTED')), 0) AS total_sales
       FROM sal_sales_orders so
       WHERE 1=1 ${sc}
       GROUP BY so.customer_code
       ORDER BY total_sales DESC
       LIMIT $${p1.length}`,
      p1,
    );

    // 补充欠款
    const { clause: arc, params: arp } = this.buildScope('ar', [limit], companyCode);
    const overdueMap = await this.ds.query(
      `SELECT
         ar.customer_code,
         COALESCE(SUM(ar.balance_amount_original) FILTER (WHERE ar.status IN ('OVERDUE')), 0) AS overdue_receivable
       FROM fin_ar_invoices ar
       WHERE ar.source_type IN ('SALES_ORDER') ${arc}
       GROUP BY ar.customer_code`,
      arp,
    );

    const overdueByCode: Record<string, number> = {};
    for (const r of overdueMap) {
      overdueByCode[r.customer_code] = this.n(r.overdue_receivable);
    }

    return topBySales.map((r: any) => ({
      customerCode:      r.customer_code,
      customerName:      r.customer_name,
      totalOrders:       this.n(r.total_orders),
      totalSales:        this.n(r.total_sales),
      overdueReceivable: overdueByCode[r.customer_code] ?? 0,
    }));
  }

  // ── 4. TOP 产品 ────────────────────────────────────────────────────────────

  async getTopProducts(companyCode?: string, limit = 20) {
    const { clause: sc, params: sp } = this.buildScope('so', [], companyCode);
    const p1 = [...sp, limit];

    const rows = await this.ds.query(
      `SELECT
         oi.product_code,
         MAX(oi.product_name) AS product_name,
         COALESCE(SUM(oi.qty), 0)    AS total_qty,
         COALESCE(SUM(oi.amount), 0) AS total_amount
       FROM sal_order_items oi
       JOIN sal_sales_orders so ON so.id = oi.sales_order_id
       WHERE so.status NOT IN ('DRAFT','CANCELLED','REJECTED') ${sc}
       GROUP BY oi.product_code
       ORDER BY total_qty DESC
       LIMIT $${p1.length}`,
      p1,
    );

    // 退货量
    const { clause: rc, params: rp } = this.buildScope('ro', [limit], companyCode);
    const returnQtyMap = await this.ds.query(
      `SELECT
         ri.product_code,
         COALESCE(SUM(ri.returned_qty), 0) AS return_qty
       FROM sal_return_items ri
       JOIN sal_return_orders ro ON ro.id = ri.return_order_id
       WHERE ro.status = 'COMPLETED' ${rc}
       GROUP BY ri.product_code`,
      rp,
    );

    // 损耗
    const { clause: lc, params: lp } = this.buildScope('il', [limit], companyCode);
    const lossQtyMap = await this.ds.query(
      `SELECT
         SPLIT_PART(il.batch_no, '-', 1) AS product_hint,
         COALESCE(SUM(ABS(il.qty_change)), 0) AS loss_qty
       FROM inv_ledger il
       WHERE il.change_type IN ('EXPIRE_WRITEOFF','DAMAGE_WRITEOFF','WRITE_OFF') ${lc}
       GROUP BY product_hint`,
      lp,
    );

    const returnMap: Record<string, number> = {};
    for (const r of returnQtyMap) returnMap[r.product_code] = this.n(r.return_qty);

    return rows.map((r: any) => ({
      productCode:  r.product_code,
      productName:  r.product_name,
      totalQty:     this.n(r.total_qty),
      totalAmount:  this.n(r.total_amount),
      returnQty:    returnMap[r.product_code] ?? 0,
    }));
  }

  // ── 5. 渠道分析 ────────────────────────────────────────────────────────────

  async getChannelAnalysis(companyCode?: string) {
    const { clause: sc, params: sp } = this.buildScope('so', [], companyCode);

    const channelSales = await this.ds.query(
      `SELECT
         COALESCE(so.channel_code, 'DIRECT') AS channel_code,
         COUNT(DISTINCT so.customer_code)    AS customer_count,
         COUNT(*)                            AS order_count,
         COALESCE(SUM(so.total_amount) FILTER (WHERE so.status NOT IN ('DRAFT','CANCELLED','REJECTED')), 0) AS sales_amount,
         COUNT(*) FILTER (WHERE so.status IN ('DELIVERED','RECEIVED','RECONCILED'))                          AS delivered_count
       FROM sal_sales_orders so
       WHERE 1=1 ${sc}
       GROUP BY so.channel_code
       ORDER BY sales_amount DESC`,
      sp,
    );

    // 退货率
    const { clause: rc, params: rp } = this.buildScope('ro', [], companyCode);
    const returnByChannel = await this.ds.query(
      `SELECT
         COALESCE(so.channel_code, 'DIRECT') AS channel_code,
         COUNT(ro.id)                        AS return_count
       FROM sal_return_orders ro
       JOIN sal_sales_orders  so ON so.order_no = ro.sales_order_no
       WHERE ro.status = 'COMPLETED' ${rc}
       GROUP BY so.channel_code`,
      rp,
    );

    // 欠款
    const { clause: ac, params: ap } = this.buildScope('ar', [], companyCode);
    const arByChannel = await this.ds.query(
      `SELECT
         COALESCE(so.channel_code, 'DIRECT') AS channel_code,
         COALESCE(SUM(ar.balance_amount_original) FILTER (WHERE ar.status IN ('OVERDUE')), 0) AS overdue_ar
       FROM fin_ar_invoices ar
       JOIN sal_sales_orders so ON so.order_no = ar.source_no
       WHERE ar.source_type = 'SALES_ORDER' ${ac}
       GROUP BY so.channel_code`,
      ap,
    );

    const returnMap: Record<string, number> = {};
    for (const r of returnByChannel) returnMap[r.channel_code] = this.n(r.return_count);
    const arMap: Record<string, number> = {};
    for (const r of arByChannel) arMap[r.channel_code] = this.n(r.overdue_ar);

    return channelSales.map((r: any) => ({
      channelCode:       r.channel_code,
      customerCount:     this.n(r.customer_count),
      orderCount:        this.n(r.order_count),
      salesAmount:       this.n(r.sales_amount),
      deliveredCount:    this.n(r.delivered_count),
      returnCount:       returnMap[r.channel_code] ?? 0,
      returnRate:        this.n(r.order_count) > 0
                         ? +((returnMap[r.channel_code] ?? 0) / this.n(r.order_count) * 100).toFixed(2)
                         : 0,
      overdueReceivable: arMap[r.channel_code] ?? 0,
    }));
  }

  // ── 6. 价格异常 ────────────────────────────────────────────────────────────

  async getPriceAnomalies(opts: {
    companyCode?: string;
    threshold?: number;   // 价格偏离阈值（%），默认 5%
    limit?: number;
  } = {}) {
    const { companyCode, threshold = 5, limit = 100 } = opts;
    const { clause: sc, params: sp } = this.buildScope('so', [threshold / 100, limit], companyCode);

    const rows = await this.ds.query(
      `SELECT * FROM (SELECT
         so.order_no        AS sales_order_no,
         so.customer_code,
         so.customer_name,
         so.company_code,
         so.created_at,
         so.created_by,
         oi.product_code,
         oi.product_name,
         oi.actual_unit_price,
         oi.resolved_unit_price,
         oi.floor_price,
         oi.below_floor_price,
         CASE WHEN oi.resolved_unit_price > 0
              THEN ROUND((oi.actual_unit_price - oi.resolved_unit_price)::numeric / oi.resolved_unit_price * 100, 2)
              ELSE 0
         END AS diff_rate
       FROM sal_order_items oi
       JOIN sal_sales_orders so ON so.id = oi.sales_order_id
       WHERE (
         oi.below_floor_price = TRUE
         OR (oi.resolved_unit_price > 0
             AND ABS((oi.actual_unit_price - oi.resolved_unit_price) / oi.resolved_unit_price) > $1)
       )
       AND so.status NOT IN ('DRAFT','CANCELLED','REJECTED')
       ${sc}
       ) AS anomalies
       ORDER BY ABS(anomalies.diff_rate) DESC, anomalies.created_at DESC
       LIMIT $2`,
      sp,
    );

    return rows;
  }

  // ── 7. 配送分析 ────────────────────────────────────────────────────────────

  async getDeliveryPerformance(opts: {
    companyCode?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    const { companyCode, dateFrom, dateTo } = opts;
    const params: unknown[] = [];

    let dateClause = '';
    if (dateFrom) { params.push(dateFrom); dateClause += ` AND del.created_at >= $${params.length}::date`; }
    if (dateTo)   { params.push(dateTo);   dateClause += ` AND del.created_at <= ($${params.length}::date + INTERVAL '1 day')`; }

    const { clause: sc, params: sp } = this.buildScope('del', params, companyCode);

    const [overall] = await this.ds.query(
      `SELECT
         COUNT(*)                                                       AS total_deliveries,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')                  AS completed_count,
         COUNT(*) FILTER (WHERE status = 'CANCELLED')                  AS cancelled_count,
         ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - departure_at))/3600)
           FILTER (WHERE status = 'COMPLETED'
             AND completed_at IS NOT NULL
             AND departure_at IS NOT NULL)::numeric, 2)                AS avg_delivery_hours,
         COUNT(*) FILTER (WHERE status = 'COMPLETED'
           AND completed_at IS NOT NULL AND departure_at IS NOT NULL
           AND EXTRACT(EPOCH FROM (completed_at - departure_at))/3600 <= 24) AS on_time_count,
         COUNT(*) FILTER (WHERE status = 'COMPLETED'
           AND completed_at IS NOT NULL AND departure_at IS NOT NULL
           AND EXTRACT(EPOCH FROM (completed_at - departure_at))/3600 > 24)  AS delayed_count,
         ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - departure_at))/3600)
           FILTER (WHERE status = 'COMPLETED'
             AND completed_at IS NOT NULL
             AND departure_at IS NOT NULL
             AND EXTRACT(EPOCH FROM (completed_at - departure_at))/3600 > 24)::numeric, 2)
                                                                       AS avg_delayed_hours
       FROM sal_delivery_orders del
       WHERE 1=1 ${dateClause} ${sc}`,
      sp,
    );

    const completedCount = this.n(overall?.completed_count);
    const onTimeCount    = this.n(overall?.on_time_count);

    // 司机排名
    const { clause: drc, params: drp } = this.buildScope('del2', params, companyCode);
    const driverRanking = await this.ds.query(
      `SELECT
         del2.driver_name,
         del2.driver_code,
         COUNT(*) FILTER (WHERE del2.status = 'COMPLETED') AS completed_trips,
         ROUND(AVG(EXTRACT(EPOCH FROM (del2.completed_at - del2.departure_at))/3600)
           FILTER (WHERE del2.status = 'COMPLETED' AND del2.completed_at IS NOT NULL AND del2.departure_at IS NOT NULL)::numeric, 2)
                                                           AS avg_hours
       FROM sal_delivery_orders del2
       WHERE 1=1 ${dateClause} ${drc}
       GROUP BY del2.driver_code, del2.driver_name
       HAVING COUNT(*) FILTER (WHERE del2.status = 'COMPLETED') > 0
       ORDER BY completed_trips DESC
       LIMIT 10`,
      [...params, ...(companyCode ? [companyCode] : sp.slice(params.length))],
    );

    // 车辆排名
    const { clause: vhc, params: vhp } = this.buildScope('del3', params, companyCode);
    const vehicleRanking = await this.ds.query(
      `SELECT
         del3.vehicle_no,
         COUNT(*) FILTER (WHERE del3.status = 'COMPLETED') AS completed_trips,
         ROUND(AVG(EXTRACT(EPOCH FROM (del3.completed_at - del3.departure_at))/3600)
           FILTER (WHERE del3.status = 'COMPLETED' AND del3.completed_at IS NOT NULL AND del3.departure_at IS NOT NULL)::numeric, 2)
                                                           AS avg_hours
       FROM sal_delivery_orders del3
       WHERE del3.vehicle_no IS NOT NULL ${dateClause} ${vhc}
       GROUP BY del3.vehicle_no
       HAVING COUNT(*) FILTER (WHERE del3.status = 'COMPLETED') > 0
       ORDER BY completed_trips DESC
       LIMIT 10`,
      [...params, ...(companyCode ? [companyCode] : sp.slice(params.length))],
    );

    return {
      totalDeliveries:    this.n(overall?.total_deliveries),
      completedCount,
      cancelledCount:     this.n(overall?.cancelled_count),
      averageDeliveryHours: this.n(overall?.avg_delivery_hours),
      onTimeCount,
      onTimeRate:         completedCount > 0 ? +(onTimeCount / completedCount * 100).toFixed(1) : 0,
      delayedCount:       this.n(overall?.delayed_count),
      avgDelayedHours:    this.n(overall?.avg_delayed_hours),
      driverRanking,
      vehicleRanking,
    };
  }

  // ── 8. 退货分析 ────────────────────────────────────────────────────────────

  async getReturnAnalysis(companyCode?: string) {
    const { clause: rc, params: rp } = this.buildScope('ro', [], companyCode);

    const [summary] = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'COMPLETED')                  AS total_returns,
         COALESCE(SUM(subtotal) FILTER (WHERE status = 'COMPLETED'), 0) AS total_return_amount,
         COUNT(*) FILTER (WHERE return_type = 'CUSTOMER_RETURN')        AS customer_return_count,
         COUNT(*) FILTER (WHERE return_type = 'DELIVERY_REJECT')        AS delivery_reject_count,
         COUNT(*) FILTER (WHERE return_type = 'QUALITY_RETURN')         AS quality_return_count,
         COUNT(*) FILTER (WHERE return_type = 'DAMAGE_RETURN')          AS damage_return_count
       FROM sal_return_orders ro
       WHERE 1=1 ${rc}`,
      rp,
    );

    // 退货率（与销售订单比较）
    const { clause: oc, params: op } = this.buildScope('so', [], companyCode);
    const [orderTotal] = await this.ds.query(
      `SELECT COUNT(*) AS total FROM sal_sales_orders so
       WHERE status NOT IN ('DRAFT','CANCELLED','REJECTED') ${oc}`,
      op,
    );

    // TOP 退货客户
    const { clause: rc2, params: rp2 } = this.buildScope('ro2', [], companyCode);
    const topReturnCustomers = await this.ds.query(
      `SELECT
         ro2.customer_code,
         MAX(ro2.customer_name) AS customer_name,
         COUNT(*)               AS return_count,
         COALESCE(SUM(ro2.subtotal), 0) AS return_amount
       FROM sal_return_orders ro2
       WHERE ro2.status = 'COMPLETED' ${rc2}
       GROUP BY ro2.customer_code
       ORDER BY return_count DESC
       LIMIT 10`,
      rp2,
    );

    // TOP 退货产品
    const { clause: rc3, params: rp3 } = this.buildScope('ro3', [], companyCode);
    const topReturnProducts = await this.ds.query(
      `SELECT
         ri.product_code,
         MAX(ri.product_name) AS product_name,
         COALESCE(SUM(ri.returned_qty), 0) AS return_qty,
         COALESCE(SUM(ri.amount), 0)       AS return_amount
       FROM sal_return_items ri
       JOIN sal_return_orders ro3 ON ro3.id = ri.return_order_id
       WHERE ro3.status = 'COMPLETED' ${rc3}
       GROUP BY ri.product_code
       ORDER BY return_qty DESC
       LIMIT 10`,
      rp3,
    );

    // TOP 退货原因
    const { clause: rc4, params: rp4 } = this.buildScope('ro4', [], companyCode);
    const topReturnReasons = await this.ds.query(
      `SELECT
         COALESCE(ro4.reason_code, 'UNKNOWN') AS reason_code,
         COUNT(*)                              AS count
       FROM sal_return_orders ro4
       WHERE ro4.status = 'COMPLETED' ${rc4}
       GROUP BY ro4.reason_code
       ORDER BY count DESC
       LIMIT 10`,
      rp4,
    );

    const totalOrders  = this.n(orderTotal?.total);
    const totalReturns = this.n(summary?.total_returns);

    return {
      totalReturns,
      totalReturnAmount:       this.n(summary?.total_return_amount),
      returnRate:              totalOrders > 0 ? +(totalReturns / totalOrders * 100).toFixed(2) : 0,
      byType: {
        customerReturn:  this.n(summary?.customer_return_count),
        deliveryReject:  this.n(summary?.delivery_reject_count),
        qualityReturn:   this.n(summary?.quality_return_count),
        damageReturn:    this.n(summary?.damage_return_count),
      },
      topReturnCustomers,
      topReturnProducts,
      topReturnReasons,
    };
  }

  // ── 9. 损耗分析 ────────────────────────────────────────────────────────────

  async getLossAnalysis(companyCode?: string) {
    const { clause: lc, params: lp } = this.buildScope('il', [], companyCode);

    const [summary] = await this.ds.query(
      `SELECT
         COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type = 'EXPIRE_WRITEOFF'),  0) AS expire_qty,
         COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type = 'DAMAGE_WRITEOFF'),  0) AS damage_qty,
         COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type = 'WRITE_OFF'),        0) AS writeoff_qty,
         COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type IN
           ('EXPIRE_WRITEOFF','DAMAGE_WRITEOFF','WRITE_OFF')), 0)                          AS total_loss
       FROM inv_ledger il
       WHERE 1=1 ${lc}`,
      lp,
    );

    const { clause: lc2, params: lp2 } = this.buildScope('il2', [], companyCode);
    const byDate = await this.ds.query(
      `SELECT
         DATE_TRUNC('day', il2.created_at)::date AS period,
         COALESCE(SUM(ABS(il2.qty_change)) FILTER (WHERE il2.change_type = 'EXPIRE_WRITEOFF'), 0)  AS expire_loss,
         COALESCE(SUM(ABS(il2.qty_change)) FILTER (WHERE il2.change_type IN ('DAMAGE_WRITEOFF','WRITE_OFF')), 0) AS damage_loss
       FROM inv_ledger il2
       WHERE il2.change_type IN ('EXPIRE_WRITEOFF','DAMAGE_WRITEOFF','WRITE_OFF')
         AND il2.created_at >= CURRENT_DATE - INTERVAL '30 days'
         ${lc2}
       GROUP BY 1
       ORDER BY 1`,
      lp2,
    );

    // 总库存周转损耗率
    const { clause: ibc, params: ibp } = this.buildScope('ib', [], companyCode);
    const [invTotal] = await this.ds.query(
      `SELECT COALESCE(SUM(qty), 1) AS total_in FROM inv_batches ib WHERE 1=1 ${ibc}`,
      ibp,
    );

    const totalIn   = this.n(invTotal?.total_in);
    const totalLoss = this.n(summary?.total_loss);

    return {
      expiredQty:    this.n(summary?.expire_qty),
      damagedQty:    this.n(summary?.damage_qty),
      writeOffQty:   this.n(summary?.writeoff_qty),
      totalLoss,
      lossRate:      totalIn > 0 ? +(totalLoss / totalIn * 100).toFixed(2) : 0,
      byDate,
    };
  }

  // ── 10. 库存周转分析 ────────────────────────────────────────────────────────

  async getInventoryTurnover(companyCode?: string) {
    const { clause: ibc, params: ibp } = this.buildScope('ib', [], companyCode);

    const [invStats] = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'AVAILABLE')                  AS active_batches,
         COALESCE(SUM(qty_available) FILTER (WHERE status = 'AVAILABLE'), 0)  AS total_available,
         COUNT(*) FILTER (WHERE status = 'AVAILABLE'
           AND expire_date IS NOT NULL
           AND expire_date <= CURRENT_DATE + INTERVAL '7 days'
           AND expire_date >= CURRENT_DATE)                             AS expiring_batches,
         COALESCE(SUM(qty_available) FILTER (WHERE status = 'AVAILABLE'
           AND expire_date IS NOT NULL
           AND expire_date <= CURRENT_DATE + INTERVAL '7 days'
           AND expire_date >= CURRENT_DATE), 0)                         AS expiring_qty,
         COUNT(*) FILTER (WHERE status = 'EXPIRED')                    AS expired_batches,
         COALESCE(SUM(qty) FILTER (WHERE status = 'EXPIRED'), 0)       AS expired_qty,
         COUNT(*) FILTER (WHERE status = 'RETURNED')                   AS returned_batches,
         ROUND(AVG(
           CASE WHEN expire_date IS NOT NULL AND egg_date IS NOT NULL
                THEN expire_date - egg_date ELSE NULL END
         )::numeric, 1)                                                AS avg_shelf_days
       FROM inv_batches ib
       WHERE 1=1 ${ibc}`,
      ibp,
    );

    // 出库流水 (FIFO_OUT) 近30天
    const { clause: lc, params: lp } = this.buildScope('il', [], companyCode);
    const [outStats] = await this.ds.query(
      `SELECT
         COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type = 'FIFO_OUT'), 0) AS total_outbound_30d,
         COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type = 'RESERVED'),  0) AS total_reserved_30d
       FROM inv_ledger il
       WHERE il.created_at >= CURRENT_DATE - INTERVAL '30 days'
         ${lc}`,
      lp,
    );

    // 按质量等级分布
    const { clause: ibc2, params: ibp2 } = this.buildScope('ib2', [], companyCode);
    const byGrade = await this.ds.query(
      `SELECT
         COALESCE(ib2.quality_grade, 'UNKNOWN') AS quality_grade,
         COUNT(*)                                AS batch_count,
         COALESCE(SUM(ib2.qty_available), 0)    AS qty_available
       FROM inv_batches ib2
       WHERE ib2.status = 'AVAILABLE' ${ibc2}
       GROUP BY ib2.quality_grade
       ORDER BY qty_available DESC`,
      ibp2,
    );

    // 按公司分布
    const { clause: ibc3, params: ibp3 } = this.buildScope('ib3', [], companyCode);
    const byCompany = await this.ds.query(
      `SELECT
         ib3.company_code,
         COUNT(*) FILTER (WHERE ib3.status = 'AVAILABLE') AS active_batches,
         COALESCE(SUM(ib3.qty_available) FILTER (WHERE ib3.status = 'AVAILABLE'), 0) AS qty_available
       FROM inv_batches ib3
       WHERE 1=1 ${ibc3}
       GROUP BY ib3.company_code
       ORDER BY qty_available DESC`,
      ibp3,
    );

    const totalAvailable = this.n(invStats?.total_available);
    const totalOutbound  = this.n(outStats?.total_outbound_30d);

    return {
      activeBatches:   this.n(invStats?.active_batches),
      totalAvailable,
      expiringBatches: this.n(invStats?.expiring_batches),
      expiringQty:     this.n(invStats?.expiring_qty),
      expiredBatches:  this.n(invStats?.expired_batches),
      expiredQty:      this.n(invStats?.expired_qty),
      returnedBatches: this.n(invStats?.returned_batches),
      avgShelfDays:    this.n(invStats?.avg_shelf_days),
      totalOutbound30d: totalOutbound,
      totalReserved30d: this.n(outStats?.total_reserved_30d),
      // 周转率 = 近30天出库 / 平均库存（简化：当前库存作为分母）
      turnoverRate: totalAvailable > 0 ? +(totalOutbound / totalAvailable * 100).toFixed(1) : 0,
      byGrade,
      byCompany,
    };
  }

  // ── 11. 信用风险分析 ────────────────────────────────────────────────────────

  async getCreditRisk(companyCode?: string) {
    const { clause: cc, params: cp } = this.buildScope('c', [], companyCode);

    const [summary] = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE credit_status = 'OVERDUE')                AS overdue_count,
         COUNT(*) FILTER (WHERE credit_status = 'FROZEN')                 AS frozen_count,
         COUNT(*) FILTER (WHERE credit_status = 'OVER_LIMIT')             AS over_limit_count,
         COUNT(*) FILTER (WHERE credit_status = 'WARNING')                AS warning_count,
         COUNT(*) FILTER (WHERE credit_status = 'NORMAL')                 AS normal_count,
         COUNT(*) FILTER (WHERE auto_frozen = TRUE)                       AS auto_frozen_count,
         COALESCE(SUM(credit_used) FILTER (WHERE credit_status IN ('OVERDUE','FROZEN','OVER_LIMIT')), 0) AS high_risk_exposure
       FROM sal_customers c
       WHERE c.status = 'ACTIVE' ${cc}`,
      cp,
    );

    // TOP 欠款客户（来自 fin_ar_invoices）
    const { clause: ac, params: ap } = this.buildScope('ar', [], companyCode);
    const topOverdueCustomers = await this.ds.query(
      `SELECT
         ar.customer_code,
         MAX(ar.customer_name)                                                  AS customer_name,
         COALESCE(SUM(ar.balance_amount_original) FILTER (WHERE ar.status = 'OVERDUE'), 0) AS overdue_amount,
         MIN(ar.due_date) FILTER (WHERE ar.status = 'OVERDUE')                 AS earliest_due_date,
         COUNT(*) FILTER (WHERE ar.status = 'OVERDUE')                         AS overdue_invoices
       FROM fin_ar_invoices ar
       WHERE ar.source_type IN ('SALES_ORDER') ${ac}
       GROUP BY ar.customer_code
       HAVING SUM(ar.balance_amount_original) FILTER (WHERE ar.status = 'OVERDUE') > 0
       ORDER BY overdue_amount DESC
       LIMIT 20`,
      ap,
    );

    // 冻结客户列表
    const { clause: fc, params: fp } = this.buildScope('c2', [], companyCode);
    const frozenCustomers = await this.ds.query(
      `SELECT
         c2.customer_no AS customer_code,
         c2.customer_name,
         c2.credit_status,
         c2.credit_used,
         c2.credit_limit,
         c2.auto_frozen,
         c2.last_overdue_at
       FROM sal_customers c2
       WHERE c2.credit_status IN ('FROZEN','OVERDUE','OVER_LIMIT') ${fc}
       ORDER BY c2.credit_used DESC
       LIMIT 20`,
      fp,
    );

    return {
      summary: {
        overdueCount:     this.n(summary?.overdue_count),
        frozenCount:      this.n(summary?.frozen_count),
        overLimitCount:   this.n(summary?.over_limit_count),
        warningCount:     this.n(summary?.warning_count),
        normalCount:      this.n(summary?.normal_count),
        autoFrozenCount:  this.n(summary?.auto_frozen_count),
        highRiskExposure: this.n(summary?.high_risk_exposure),
      },
      topOverdueCustomers,
      frozenCustomers,
    };
  }
}
