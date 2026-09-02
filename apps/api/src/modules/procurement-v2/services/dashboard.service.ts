import { Injectable } from '@nestjs/common';
import { DataSource }  from 'typeorm';
import { QueryDashboardDto } from '../dto/query-dashboard.dto';
import { DataScopeHelper } from '../../org/helpers/data-scope.helper';

@Injectable()
export class DashboardService {
  constructor(
    private readonly ds: DataSource,
    private readonly scopeHelper: DataScopeHelper,
  ) {}

  // ── 1. KPI 汇总 ──────────────────────────────────────────────────────────────
  async getSummary(q: QueryDashboardDto) {
    const cc = q.companyCode ?? null;
    const df = q.dateFrom   ?? null;
    const dt = q.dateTo     ?? null;

    // ── RBAC-2：为每类查询构建数据范围条件 ─────────────────────────────────────
    // 3-param queries (cc, df, dt)
    const scope3 = this.scopeHelper.buildRawCondition({ companyAlias: 'company_code' }, 3);
    // 1-param queries (cc only)
    const scope1 = this.scopeHelper.buildRawCondition({ companyAlias: 'company_code' }, 1);
    // ────────────────────────────────────────────────────────────────────────────

    const [[po], [ap], [pay], [fund], [ship], [pr], [poPend]] = await Promise.all([
      this.ds.query(`
        SELECT COUNT(*) AS po_count, COALESCE(SUM(total_amount), 0) AS po_amount
        FROM prc2_purchase_orders
        WHERE status NOT IN ('CANCELLED')
          AND ($1::varchar IS NULL OR company_code = $1)
          AND ($2::date IS NULL OR created_at::date >= $2::date)
          AND ($3::date IS NULL OR created_at::date <= $3::date)
          AND (${scope3.sql})
      `, [cc, df, dt, ...scope3.params]),

      this.ds.query(`
        SELECT
          COALESCE(SUM(CASE WHEN status IN ('OPEN','PARTIAL') THEN balance_amount_original ELSE 0 END), 0) AS ap_open,
          COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount_original ELSE 0 END), 0) AS ap_paid
        FROM prc2_ap_ledger
        WHERE ($1::varchar IS NULL OR company_code = $1)
          AND ($2::date IS NULL OR created_at::date >= $2::date)
          AND ($3::date IS NULL OR created_at::date <= $3::date)
          AND (${scope3.sql})
      `, [cc, df, dt, ...scope3.params]),

      this.ds.query(`
        SELECT COALESCE(SUM(amount_base), 0) AS payment_amount
        FROM prc2_payments
        -- G152：已付金额只能算"真正执行付款(PAID)"的单。原把 APPROVED(已审批未出款)也算成
        --   已付，且 EXECUTED/CONFIRMED 在付款单生命周期里并不存在(执行态=PAID，见 payments.service)
        --   → 看板出现"应付未减、已付却已满、股东资金为 0"的自相矛盾。统一改 status='PAID'。
        WHERE status = 'PAID'
          AND ($1::varchar IS NULL OR company_code = $1)
          AND ($2::date IS NULL OR payment_date >= $2::date)
          AND ($3::date IS NULL OR payment_date <= $3::date)
          AND (${scope3.sql})
      `, [cc, df, dt, ...scope3.params]),

      this.ds.query(`
        SELECT COALESCE(SUM(amount_base), 0) AS fund_amount, COUNT(*) AS fund_count
        FROM prc2_shareholder_funds
        WHERE ($1::varchar IS NULL OR company_code = $1)
          AND ($2::date IS NULL OR occurred_date >= $2::date)
          AND ($3::date IS NULL OR occurred_date <= $3::date)
          AND (${scope3.sql})
      `, [cc, df, dt, ...scope3.params]),

      this.ds.query(`
        SELECT
          COUNT(*) AS total_count,
          SUM(CASE WHEN status NOT IN ('ARRIVED','CANCELLED') THEN 1 ELSE 0 END) AS in_transit_count,
          SUM(CASE WHEN customs_required = true THEN 1 ELSE 0 END) AS cross_border_count
        FROM prc2_shipments
        WHERE ($1::varchar IS NULL OR company_code = $1)
          AND (${scope1.sql})
      `, [cc, ...scope1.params]),

      this.ds.query(`
        SELECT COUNT(*) AS pending_pr_count
        FROM prc2_purchase_requests
        WHERE status = 'SUBMITTED'
          AND ($1::varchar IS NULL OR company_code = $1)
          AND (${scope1.sql})
      `, [cc, ...scope1.params]),

      this.ds.query(`
        SELECT COUNT(*) AS pending_po_count
        FROM prc2_purchase_orders
        WHERE approval_status = 'PENDING_APPROVAL'
          AND ($1::varchar IS NULL OR company_code = $1)
          AND (${scope1.sql})
      `, [cc, ...scope1.params]),
    ]);

    return {
      poCount:                Number(po.po_count),
      poAmount:               Number(po.po_amount),
      apOpenAmount:           Number(ap.ap_open),
      apPaidAmount:           Number(ap.ap_paid),
      paymentAmount:          Number(pay.payment_amount),
      shareholderFundAmount:  Number(fund.fund_amount),
      shareholderFundCount:   Number(fund.fund_count),
      shipmentTotalCount:     Number(ship.total_count),
      shipmentInTransitCount: Number(ship.in_transit_count),
      shipmentCrossBorderCount: Number(ship.cross_border_count),
      pendingPrCount:         Number(pr.pending_pr_count),
      pendingPoApprovalCount: Number(poPend.pending_po_count),
    };
  }

  // ── 2. AP 账龄分析 ───────────────────────────────────────────────────────────
  async getApAging(q: QueryDashboardDto) {
    const scope = this.scopeHelper.buildRawCondition({ companyAlias: 'company_code' }, 1);
    const rows = await this.ds.query(`
      SELECT
        CASE
          WHEN due_date IS NULL OR due_date >= CURRENT_DATE       THEN 'current'
          WHEN (CURRENT_DATE - due_date) <= 30                    THEN 'overdue_1_30'
          WHEN (CURRENT_DATE - due_date) <= 60                    THEN 'overdue_31_60'
          WHEN (CURRENT_DATE - due_date) <= 90                    THEN 'overdue_61_90'
          ELSE                                                          'overdue_90_plus'
        END AS bucket,
        COUNT(*)                                       AS cnt,
        COALESCE(SUM(balance_amount_original), 0)      AS balance,
        COALESCE(SUM(amount_original), 0)              AS amount,
        currency_code
      FROM prc2_ap_ledger
      WHERE status IN ('OPEN','PARTIAL')
        AND ($1::varchar IS NULL OR company_code = $1)
        AND (${scope.sql})
      GROUP BY bucket, currency_code
      ORDER BY bucket, currency_code
    `, [q.companyCode ?? null, ...scope.params]);

    const ORDER = ['current','overdue_1_30','overdue_31_60','overdue_61_90','overdue_90_plus'];
    const LABELS: Record<string, string> = {
      current:        '未到期',
      overdue_1_30:   '逾期1-30天',
      overdue_31_60:  '逾期31-60天',
      overdue_61_90:  '逾期61-90天',
      overdue_90_plus:'逾期90天以上',
    };

    return rows.map((r: Record<string, string>) => ({
      bucket:       r.bucket,
      bucketLabel:  LABELS[r.bucket] ?? r.bucket,
      order:        ORDER.indexOf(r.bucket),
      count:        Number(r.cnt),
      balance:      Number(r.balance),
      amount:       Number(r.amount),
      currencyCode: r.currency_code,
    })).sort((a: { order: number }, b: { order: number }) => a.order - b.order);
  }

  // ── 3. 项目成本 ──────────────────────────────────────────────────────────────
  async getProjectCost(q: QueryDashboardDto) {
    const scope = this.scopeHelper.buildRawCondition(
      { companyAlias: 'po.company_code', projectAlias: 'po.project_code' }, 4,
    );
    const rows = await this.ds.query(`
      SELECT
        po.project_code,
        po.project_name,
        po.company_code,
        po.company_name,
        po.currency_code,
        COUNT(DISTINCT po.id)                               AS po_count,
        COALESCE(SUM(po.total_amount), 0)                  AS po_amount,
        COALESCE(SUM(ap.paid_amount_original), 0)          AS paid_amount,
        COALESCE(SUM(ap.balance_amount_original), 0)       AS balance,
        MAX(bp.budget_amount)                              AS budget_amount,
        MAX(bp.budget_currency)                            AS budget_currency
      FROM prc2_purchase_orders po
      LEFT JOIN prc2_ap_ledger ap ON ap.po_id = po.id
      LEFT JOIN biz_projects bp ON bp.project_code = po.project_code AND bp.deleted_at IS NULL
      WHERE po.status NOT IN ('CANCELLED')
        AND ($1::varchar IS NULL OR po.company_code = $1)
        AND ($2::varchar IS NULL OR po.project_code = $2)
        AND ($3::date IS NULL OR po.created_at::date >= $3::date)
        AND ($4::date IS NULL OR po.created_at::date <= $4::date)
        AND (${scope.sql})
      GROUP BY po.project_code, po.project_name, po.company_code, po.company_name, po.currency_code
      ORDER BY po_amount DESC NULLS LAST
      LIMIT 50
    `, [q.companyCode ?? null, q.projectCode ?? null, q.dateFrom ?? null, q.dateTo ?? null, ...scope.params]);

    return rows.map((r: Record<string, string>) => ({
      projectCode:  r.project_code  ?? '(无项目)',
      projectName:  r.project_name  ?? '(无项目)',
      companyCode:  r.company_code  ?? '',
      companyName:  r.company_name  ?? '',
      currencyCode: r.currency_code ?? 'CNY',
      poCount:      Number(r.po_count),
      poAmount:     Number(r.po_amount),
      paidAmount:   Number(r.paid_amount),
      balance:      Number(r.balance),
      budgetAmount:   r.budget_amount != null ? Number(r.budget_amount) : null,
      budgetCurrency: r.budget_currency ?? null,
    }));
  }

  // ── 4. 付款趋势 ──────────────────────────────────────────────────────────────
  async getPaymentTrend(q: QueryDashboardDto) {
    const groupBy = q.groupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    const scope = this.scopeHelper.buildRawCondition({ companyAlias: 'company_code' }, 4);
    const rows = await this.ds.query(`
      SELECT
        TO_CHAR(payment_date, $1)          AS period,
        currency_code,
        COUNT(*)                           AS payment_count,
        COALESCE(SUM(amount_original), 0)  AS amount_original,
        COALESCE(SUM(amount_base), 0)      AS amount_base
      FROM prc2_payments
      -- G153：付款趋势同 G152——只算真正执行付款(PAID)。原 EXECUTED/CONFIRMED/APPROVED 使
      --   付款变 PAID 后趋势查不到任何数据(看板"付款趋势"恒为空)；G152 的 replace 因缩进差异漏改此处。
      WHERE status = 'PAID'
        AND ($2::varchar IS NULL OR company_code = $2)
        AND ($3::date IS NULL OR payment_date >= $3::date)
        AND ($4::date IS NULL OR payment_date <= $4::date)
        AND payment_date IS NOT NULL
        AND (${scope.sql})
      GROUP BY period, currency_code
      ORDER BY period ASC, currency_code
    `, [groupBy, q.companyCode ?? null, q.dateFrom ?? null, q.dateTo ?? null, ...scope.params]);

    return rows.map((r: Record<string, string>) => ({
      period:         r.period,
      currencyCode:   r.currency_code,
      paymentCount:   Number(r.payment_count),
      amountOriginal: Number(r.amount_original),
      amountBase:     Number(r.amount_base),
    }));
  }

  // ── 5. 股东资金汇总 ──────────────────────────────────────────────────────────
  async getShareholderSummary(q: QueryDashboardDto) {
    const scope = this.scopeHelper.buildRawCondition({ companyAlias: 'company_code' }, 3);
    const rows = await this.ds.query(`
      SELECT
        shareholder_name,
        fund_nature,
        currency_code,
        COUNT(*)                          AS record_count,
        COALESCE(SUM(amount_base), 0)     AS total_base,
        COALESCE(SUM(amount_original), 0) AS total_original
      FROM prc2_shareholder_funds
      WHERE ($1::varchar IS NULL OR company_code = $1)
        AND ($2::date IS NULL OR occurred_date >= $2::date)
        AND ($3::date IS NULL OR occurred_date <= $3::date)
        AND (${scope.sql})
      GROUP BY shareholder_name, fund_nature, currency_code
      ORDER BY shareholder_name, fund_nature
    `, [q.companyCode ?? null, q.dateFrom ?? null, q.dateTo ?? null, ...scope.params]);

    return rows.map((r: Record<string, string>) => ({
      shareholderName: r.shareholder_name,
      fundNature:      r.fund_nature  ?? '',
      currencyCode:    r.currency_code ?? '',
      recordCount:     Number(r.record_count),
      totalBase:       Number(r.total_base),
      totalOriginal:   Number(r.total_original),
    }));
  }

  // ── 6. 运单状态 ──────────────────────────────────────────────────────────────
  async getShipmentStatus(q: QueryDashboardDto) {
    const scope = this.scopeHelper.buildRawCondition({ companyAlias: 'company_code' }, 3);
    const rows = await this.ds.query(`
      SELECT
        status,
        COUNT(*)                                                                  AS cnt,
        SUM(CASE WHEN customs_required = true THEN 1 ELSE 0 END)                 AS cross_border_cnt,
        SUM(CASE WHEN status NOT IN ('ARRIVED','CANCELLED') THEN 1 ELSE 0 END) AS active_cnt
      FROM prc2_shipments
      WHERE ($1::varchar IS NULL OR company_code = $1)
        AND ($2::date IS NULL OR created_at::date >= $2::date)
        AND ($3::date IS NULL OR created_at::date <= $3::date)
        AND (${scope.sql})
      GROUP BY status
      ORDER BY status
    `, [q.companyCode ?? null, q.dateFrom ?? null, q.dateTo ?? null, ...scope.params]);

    return rows.map((r: Record<string, string>) => ({
      status:          r.status,
      statusLabel:     r.status,
      count:           Number(r.cnt),
      crossBorderCount: Number(r.cross_border_cnt),
      activeCount:     Number(r.active_cnt),
    }));
  }

  // ── 7. 供应商绩效 ────────────────────────────────────────────────────────────
  async getSupplierPerformance(q: QueryDashboardDto) {
    const scope = this.scopeHelper.buildRawCondition({ companyAlias: 'po.company_code' }, 4);
    const rows = await this.ds.query(`
      SELECT
        po.supplier_code,
        po.supplier_name,
        po.currency_code,
        COUNT(DISTINCT po.id)                              AS po_count,
        COALESCE(SUM(po.total_amount), 0)                 AS po_amount,
        COALESCE(SUM(po.received_qty), 0)                 AS received_qty,
        COALESCE(SUM(po.paid_amount), 0)                  AS paid_amount,
        COALESCE(SUM(ap.balance_amount_original), 0)      AS open_ap_amount
      FROM prc2_purchase_orders po
      LEFT JOIN prc2_ap_ledger ap ON ap.po_id = po.id AND ap.status IN ('OPEN','PARTIAL')
      WHERE po.status NOT IN ('CANCELLED')
        AND ($1::varchar IS NULL OR po.company_code = $1)
        AND ($2::varchar IS NULL OR po.supplier_code = $2)
        AND ($3::date IS NULL OR po.created_at::date >= $3::date)
        AND ($4::date IS NULL OR po.created_at::date <= $4::date)
        AND (${scope.sql})
      GROUP BY po.supplier_code, po.supplier_name, po.currency_code
      ORDER BY po_amount DESC NULLS LAST
      LIMIT 20
    `, [q.companyCode ?? null, q.supplierCode ?? null, q.dateFrom ?? null, q.dateTo ?? null, ...scope.params]);

    return rows.map((r: Record<string, string>) => ({
      supplierCode:  r.supplier_code ?? '',
      supplierName:  r.supplier_name ?? '',
      currencyCode:  r.currency_code ?? '',
      poCount:       Number(r.po_count),
      poAmount:      Number(r.po_amount),
      receivedQty:   Number(r.received_qty),
      paidAmount:    Number(r.paid_amount),
      openApAmount:  Number(r.open_ap_amount),
    }));
  }
}
