/**
 * Phoenix ERP V3 — Pilot Run 1 Dashboard Service
 * Pilot Run Execution Center
 *
 * 功能：
 *   1. 实时 Dashboard 聚合（今日订单/销售/配送/签收/退货/收款/异常）
 *   2. 每日评分（0~100，6 维加权：销售25%+库存20%+配送20%+财务15%+审批10%+稳定性10%）
 *   3. 每日日报生成（手动触发 + Scheduler 自动生成）
 *   4. 上线准备度评估
 *
 * 评分规则：
 *   - CRITICAL 未解决 issue 存在：总分上限 70
 *   - GREEN ≥ 80 / YELLOW ≥ 60 / RED < 60
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface PilotDashboard {
  pilotRunId:           number;
  runNo:                string;
  siteName:             string;
  status:               string;
  daysRunning:          number;
  daysRemaining:        number;
  runStartDate:         string;
  runEndDate:           string;

  // 今日业务指标
  todayOrderCount:      number;
  todaySalesAmount:     number;
  todayDeliveryCount:   number;
  todayReceiptCount:    number;
  todayReturnCount:     number;
  todayCollectionCount: number;
  todayAbnormalCount:   number;

  // 问题追踪
  openIssues:           number;
  criticalIssues:       number;
  resolvedToday:        number;

  // 今日评分
  score:                number;
  scoreStatus:          'GREEN' | 'YELLOW' | 'RED';
  scoreDimensions: {
    sales:      number;
    inventory:  number;
    delivery:   number;
    finance:    number;
    approval:   number;
    stability:  number;
  };

  // 上线准备度
  goLiveReady:          boolean;
  goLiveBlockers:       string[];

  // 最近 7 天评分趋势
  scoreTrend:           Array<{ date: string; score: number; status: string }>;
}

@Injectable()
export class PilotRunDashboardService {
  private readonly logger = new Logger(PilotRunDashboardService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  // ── 获取试运行项目 ─────────────────────────────────────────────────

  private async getPilotRun(id: number) {
    const [row] = await this.ds.query(
      `SELECT * FROM uat_pilot_runs WHERE id = $1`, [id],
    );
    if (!row) throw new NotFoundException(`试运行 ${id} 不存在`);
    return row;
  }

  // ── 1. 实时 Dashboard ─────────────────────────────────────────────

  async getDashboard(pilotRunId: number): Promise<PilotDashboard> {
    const pr = await this.getPilotRun(pilotRunId);

    const companyCode: string | null = pr.company_code ?? null;
    const companyFilter = companyCode
      ? `AND company_code = '${companyCode.replace(/'/g, "''")}'`
      : '';

    // 并行查所有指标
    const [
      ordersRow, deliveryRow, returnsRow, storeRow,
      issuesRow, approvalRow, invRow, arRow,
    ] = await Promise.all([
      // 今日销售订单
      this.ds.query(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(total_amount),0) AS amount
         FROM sal_sales_orders
         WHERE created_at >= CURRENT_DATE ${companyFilter}`,
      ),
      // 今日配送/签收
      this.ds.query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)       AS deliveries,
           COUNT(*) FILTER (WHERE status = 'DELIVERED'
                            AND updated_at >= CURRENT_DATE)          AS receipts
         FROM sal_delivery_orders
         WHERE 1=1 ${companyFilter}`,
      ),
      // 今日退货
      this.ds.query(
        `SELECT COUNT(*) AS cnt
         FROM sal_return_orders
         WHERE created_at >= CURRENT_DATE ${companyFilter}`,
      ),
      // 今日门店收款
      this.ds.query(
        `SELECT COUNT(*) AS cnt
         FROM sal_store_sales
         WHERE status = 'COMPLETED'
           AND completed_at >= CURRENT_DATE ${companyFilter.replace('company_code', 'company_code')}`,
      ),
      // 问题追踪
      this.ds.query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS')) AS open_issues,
           COUNT(*) FILTER (WHERE severity = 'CRITICAL'
                            AND status IN ('OPEN','IN_PROGRESS'))   AS critical_issues,
           COUNT(*) FILTER (WHERE status IN ('RESOLVED','CLOSED')
                            AND updated_at >= CURRENT_DATE)         AS resolved_today
         FROM uat_feedbacks
         WHERE ($1::bigint IS NULL OR pilot_run_id = $1::bigint)`,
        [pilotRunId],
      ),
      // 待审批
      this.ds.query(
        `SELECT COUNT(*) AS cnt
         FROM wf_instances
         WHERE status = 'PENDING'`,
      ).catch(() => [{ cnt: 0 }]),
      // 可用库存批次数
      this.ds.query(
        `SELECT COUNT(*) AS cnt
         FROM inv_batches
         WHERE status = 'AVAILABLE' AND qty_available > 0 ${companyFilter}`,
      ),
      // 今日生成的 AR
      this.ds.query(
        `SELECT COUNT(*) AS cnt
         FROM fin_ar_invoices
         WHERE created_at >= CURRENT_DATE ${companyFilter}`,
      ).catch(() => [{ cnt: 0 }]),
    ]);

    const todayOrderCount      = Number(ordersRow[0]?.cnt ?? 0);
    const todaySalesAmount     = Number(ordersRow[0]?.amount ?? 0);
    const todayDeliveryCount   = Number(deliveryRow[0]?.deliveries ?? 0);
    const todayReceiptCount    = Number(deliveryRow[0]?.receipts ?? 0);
    const todayReturnCount     = Number(returnsRow[0]?.cnt ?? 0);
    const todayCollectionCount = Number(storeRow[0]?.cnt ?? 0);
    const openIssues           = Number(issuesRow[0]?.open_issues ?? 0);
    const criticalIssues       = Number(issuesRow[0]?.critical_issues ?? 0);
    const resolvedToday        = Number(issuesRow[0]?.resolved_today ?? 0);
    const pendingApprovals     = Number(approvalRow[0]?.cnt ?? 0);
    const availableBatches     = Number(invRow[0]?.cnt ?? 0);
    const todayArCount         = Number(arRow[0]?.cnt ?? 0);

    const todayAbnormalCount = openIssues + (pendingApprovals > 10 ? 1 : 0);

    // 计算评分
    const scoring = this.calculateScore({
      todayOrderCount, todaySalesAmount, todayDeliveryCount,
      todayReceiptCount, todayReturnCount, openIssues,
      criticalIssues, pendingApprovals, availableBatches, todayArCount,
    });

    // 趋势（最近 7 天）
    const trendRows = await this.ds.query(
      `SELECT report_date::text AS date, score, score_status AS status
       FROM pilot_daily_reports
       WHERE pilot_run_id = $1
       ORDER BY report_date DESC
       LIMIT 7`,
      [pilotRunId],
    );

    // 上线准备度
    const startDate   = new Date(pr.run_start_date);
    const endDate     = pr.run_end_date ? new Date(pr.run_end_date) : new Date(startDate.getTime() + 14 * 86400000);
    const now         = new Date();
    const daysRunning = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / 86400000));
    const daysRemaining = Math.max(0, Math.floor((endDate.getTime() - now.getTime()) / 86400000));

    const { goLiveReady, goLiveBlockers } = this.assessGoLiveReadiness({
      daysRunning, criticalIssues, openIssues, scoring,
    });

    return {
      pilotRunId,
      runNo:       pr.run_no,
      siteName:    pr.site_name ?? '',
      status:      pr.status,
      daysRunning,
      daysRemaining,
      runStartDate: pr.run_start_date ? String(pr.run_start_date).slice(0, 10) : '',
      runEndDate:   pr.run_end_date   ? String(pr.run_end_date).slice(0, 10)   : '',

      todayOrderCount, todaySalesAmount, todayDeliveryCount,
      todayReceiptCount, todayReturnCount, todayCollectionCount, todayAbnormalCount,

      openIssues, criticalIssues, resolvedToday,

      score:         scoring.total,
      scoreStatus:   scoring.status,
      scoreDimensions: scoring.dimensions,

      goLiveReady, goLiveBlockers,
      scoreTrend: trendRows.reverse(),
    };
  }

  // ── 2. 评分引擎 ────────────────────────────────────────────────────

  private calculateScore(metrics: {
    todayOrderCount:    number;
    todaySalesAmount:   number;
    todayDeliveryCount: number;
    todayReceiptCount:  number;
    todayReturnCount:   number;
    openIssues:         number;
    criticalIssues:     number;
    pendingApprovals:   number;
    availableBatches:   number;
    todayArCount:       number;
  }) {
    // 6 维评分（各 0~100）
    const sales      = this.scoreSales(metrics);
    const inventory  = this.scoreInventory(metrics);
    const delivery   = this.scoreDelivery(metrics);
    const finance    = this.scoreFinance(metrics);
    const approval   = this.scoreApproval(metrics);
    const stability  = this.scoreStability(metrics);

    // 加权总分 = 25%+20%+20%+15%+10%+10%
    let total = Math.round(
      sales     * 0.25 +
      inventory * 0.20 +
      delivery  * 0.20 +
      finance   * 0.15 +
      approval  * 0.10 +
      stability * 0.10,
    );

    // CRITICAL issue 上限 70
    if (metrics.criticalIssues > 0) {
      total = Math.min(total, 70);
    }

    total = Math.max(0, Math.min(100, total));

    const status: 'GREEN' | 'YELLOW' | 'RED' =
      total >= 80 ? 'GREEN' : total >= 60 ? 'YELLOW' : 'RED';

    return { total, status, dimensions: { sales, inventory, delivery, finance, approval, stability } };
  }

  private scoreSales(m: any): number {
    // 有订单活动：+60；无：20
    let s = m.todayOrderCount > 0 ? 60 : 20;
    // 销售额正常（试运行期非 0）
    if (m.todaySalesAmount > 0) s += 20;
    // 退货率合理（退货 < 订单 20%）
    if (m.todayOrderCount > 0 && m.todayReturnCount / m.todayOrderCount < 0.2) s += 20;
    else if (m.todayOrderCount === 0) s += 10;
    return Math.min(100, s);
  }

  private scoreInventory(m: any): number {
    // 有可用批次
    let s = m.availableBatches > 0 ? 70 : 10;
    if (m.availableBatches > 5) s += 30;
    return Math.min(100, s);
  }

  private scoreDelivery(m: any): number {
    if (m.todayDeliveryCount === 0) return 70; // 无配送任务不扣分
    const receiptRate = m.todayReceiptCount / m.todayDeliveryCount;
    if (receiptRate >= 0.9) return 100;
    if (receiptRate >= 0.7) return 80;
    if (receiptRate >= 0.5) return 60;
    return 40;
  }

  private scoreFinance(m: any): number {
    // AR 生成正常
    let s = 70;
    if (m.todayArCount > 0) s += 30;
    return Math.min(100, s);
  }

  private scoreApproval(m: any): number {
    // 待审批过多扣分
    if (m.pendingApprovals === 0) return 100;
    if (m.pendingApprovals <= 3) return 80;
    if (m.pendingApprovals <= 10) return 60;
    return 40;
  }

  private scoreStability(m: any): number {
    // 基于 open issues 数量
    if (m.openIssues === 0) return 100;
    if (m.openIssues <= 2) return 85;
    if (m.openIssues <= 5) return 70;
    if (m.openIssues <= 10) return 55;
    return 30;
  }

  // ── 3. 上线准备度评估 ──────────────────────────────────────────────

  private assessGoLiveReadiness(params: {
    daysRunning:     number;
    criticalIssues:  number;
    openIssues:      number;
    scoring: { total: number; status: string };
  }) {
    const blockers: string[] = [];

    if (params.daysRunning < 14) {
      blockers.push(`试运行天数不足 14 天（当前 ${params.daysRunning} 天）`);
    }
    if (params.criticalIssues > 0) {
      blockers.push(`存在 ${params.criticalIssues} 个未解决 CRITICAL 问题`);
    }
    if (params.openIssues > 5) {
      blockers.push(`未解决 HIGH/以上问题超过 5 个（当前 ${params.openIssues} 个）`);
    }
    if (params.scoring.total < 80) {
      blockers.push(`上线评分 ${params.scoring.total} 未达到 80 分`);
    }

    return {
      goLiveReady: blockers.length === 0,
      goLiveBlockers: blockers,
    };
  }

  // ── 4. 生成每日日报 ────────────────────────────────────────────────

  async generateDailyReport(pilotRunId: number, date?: string): Promise<any> {
    const reportDate = date ?? new Date().toISOString().slice(0, 10);

    // 获取当天实时 dashboard 数据
    const dashboard = await this.getDashboard(pilotRunId);

    // UPSERT 日报
    const [row] = await this.ds.query(
      `INSERT INTO pilot_daily_reports (
         pilot_run_id, report_date,
         order_count, sales_amount, delivery_count, receipt_count,
         return_count, collection_count,
         issue_count, critical_issue_count, new_feedback_count,
         score, score_status,
         score_sales, score_inventory, score_delivery,
         score_finance, score_approval, score_stability,
         generated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
       ON CONFLICT (pilot_run_id, report_date)
       DO UPDATE SET
         order_count          = EXCLUDED.order_count,
         sales_amount         = EXCLUDED.sales_amount,
         delivery_count       = EXCLUDED.delivery_count,
         receipt_count        = EXCLUDED.receipt_count,
         return_count         = EXCLUDED.return_count,
         collection_count     = EXCLUDED.collection_count,
         issue_count          = EXCLUDED.issue_count,
         critical_issue_count = EXCLUDED.critical_issue_count,
         new_feedback_count   = EXCLUDED.new_feedback_count,
         score                = EXCLUDED.score,
         score_status         = EXCLUDED.score_status,
         score_sales          = EXCLUDED.score_sales,
         score_inventory      = EXCLUDED.score_inventory,
         score_delivery       = EXCLUDED.score_delivery,
         score_finance        = EXCLUDED.score_finance,
         score_approval       = EXCLUDED.score_approval,
         score_stability      = EXCLUDED.score_stability,
         generated_at         = NOW()
       RETURNING *`,
      [
        pilotRunId, reportDate,
        dashboard.todayOrderCount, dashboard.todaySalesAmount,
        dashboard.todayDeliveryCount, dashboard.todayReceiptCount,
        dashboard.todayReturnCount, dashboard.todayCollectionCount,
        dashboard.openIssues, dashboard.criticalIssues,
        0,  // new_feedback_count (can be enhanced later)
        dashboard.score, dashboard.scoreStatus,
        dashboard.scoreDimensions.sales,
        dashboard.scoreDimensions.inventory,
        dashboard.scoreDimensions.delivery,
        dashboard.scoreDimensions.finance,
        dashboard.scoreDimensions.approval,
        dashboard.scoreDimensions.stability,
      ],
    );

    this.logger.log(`[PilotRun] 日报生成: pilotRunId=${pilotRunId} date=${reportDate} score=${dashboard.score} status=${dashboard.scoreStatus}`);
    return row;
  }

  // ── 5. 查询每日日报列表 ────────────────────────────────────────────

  async getDailyReports(pilotRunId: number, page = 1, limit = 14) {
    await this.getPilotRun(pilotRunId);
    const offset = (page - 1) * limit;
    const [rows, countRow] = await Promise.all([
      this.ds.query(
        `SELECT * FROM pilot_daily_reports
         WHERE pilot_run_id = $1
         ORDER BY report_date DESC
         LIMIT $2 OFFSET $3`,
        [pilotRunId, limit, offset],
      ),
      this.ds.query(
        `SELECT COUNT(*) AS total FROM pilot_daily_reports WHERE pilot_run_id = $1`,
        [pilotRunId],
      ),
    ]);
    return { items: rows, total: Number(countRow[0]?.total ?? 0), page, limit };
  }

  // ── 6. 获取当前评分（快速接口） ───────────────────────────────────

  async getCurrentScore(pilotRunId: number) {
    const dashboard = await this.getDashboard(pilotRunId);
    return {
      score:           dashboard.score,
      scoreStatus:     dashboard.scoreStatus,
      scoreDimensions: dashboard.scoreDimensions,
      criticalIssues:  dashboard.criticalIssues,
      openIssues:      dashboard.openIssues,
      goLiveReady:     dashboard.goLiveReady,
      goLiveBlockers:  dashboard.goLiveBlockers,
    };
  }
}
