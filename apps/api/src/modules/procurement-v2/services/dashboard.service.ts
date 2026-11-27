import { ClsService } from 'nestjs-cls';
import { hasPerm } from '../../../auth/permissions.util';
import { DataScopeService } from '../../org/services/data-scope.service';
import { isShareholderSelfScope, shareholderOwnerPredicate } from './shareholder-fund-visibility';
import { Injectable } from '@nestjs/common';
import { DataSource }  from 'typeorm';
import { QueryDashboardDto } from '../dto/query-dashboard.dto';
import { DataScopeHelper } from '../../org/helpers/data-scope.helper';

@Injectable()
export class DashboardService {
  constructor(
    private readonly ds: DataSource,
    private readonly scopeHelper: DataScopeHelper,
    private readonly cls: ClsService,
    private readonly dataScope: DataScopeService,
  ) {}

  private async scopeFor(menu: string, offset: number, alias?: string) {
    const user = this.cls.get('user');
    if (!hasPerm(user?.permissions, menu, 'V')
      && !(user?.roles ?? [user?.role]).includes('ROLE_ADMIN')) return null;
    const scope = await this.dataScope.resolve(String(user.userId ?? user.id), user.roles ?? [user.role], menu);
    const prefix = alias ? `${alias}.` : '';
    if (menu === 'MENU_PRC2_FUND' && isShareholderSelfScope(scope)) {
      return { sql: shareholderOwnerPredicate(`${prefix}shareholder_id`, `$${offset + 1}`), params: [scope.userId] };
    }
    return this.scopeHelper.buildRawCondition({
      companyAlias: `${prefix}company_code`, projectAlias: `${prefix}project_code`,
    }, offset, scope);
  }

  async getSummary(q: QueryDashboardDto) {
    const filters = [q.companyCode ?? null, q.dateFrom ?? null, q.dateTo ?? null];
    const [order, request, payment, fund, shipment] = await Promise.all([
      this.scopeFor('MENU_PRC2_ORDER', 3), this.scopeFor('MENU_PRC2_REQUEST', 3),
      this.scopeFor('MENU_PRC2_PAYMENT', 3), this.scopeFor('MENU_PRC2_FUND', 3),
      this.scopeFor('MENU_PRC2_SHIPMENT', 3),
    ]);
    const [orders, requests, ap, payments, funds, shipments] = await Promise.all([
      order ? this.ds.query(`
        SELECT currency_code, COUNT(*)::int AS count, SUM(total_amount) AS amount,
          COUNT(*) FILTER (WHERE status IN ('SUBMITTED','PENDING_APPROVAL'))::int AS pending
        FROM prc2_purchase_orders
        WHERE status <> 'CANCELLED' AND ($1::text IS NULL OR company_code = $1)
          AND ($2::date IS NULL OR created_at::date >= $2) AND ($3::date IS NULL OR created_at::date <= $3)
          AND (${order.sql})
        GROUP BY currency_code ORDER BY currency_code
      `, [...filters, ...order.params]) : null,
      request ? this.ds.query(`
        SELECT COUNT(*)::int AS pending FROM prc2_purchase_requests
        WHERE status IN ('SUBMITTED','PENDING_APPROVAL') AND ($1::text IS NULL OR company_code = $1)
          AND ($2::date IS NULL OR created_at::date >= $2) AND ($3::date IS NULL OR created_at::date <= $3)
          AND (${request.sql})
      `, [...filters, ...request.params]) : null,
      payment ? this.ds.query(`
        SELECT currency_code, SUM(balance_amount_original) AS amount FROM prc2_ap_ledger
        WHERE status IN ('OPEN','PARTIAL','PARTIALLY_PAID') AND balance_amount_original > 0
          AND ($1::text IS NULL OR company_code = $1)
          AND ($2::date IS NULL OR created_at::date >= $2) AND ($3::date IS NULL OR created_at::date <= $3)
          AND (${payment.sql})
        GROUP BY currency_code ORDER BY currency_code
      `, [...filters, ...payment.params]) : null,
      payment ? this.ds.query(`
        SELECT currency_code, SUM(amount_original) AS amount FROM prc2_payments
        WHERE status IN ('PAID','EXECUTED') AND ($1::text IS NULL OR company_code = $1)
          AND ($2::date IS NULL OR payment_date >= $2) AND ($3::date IS NULL OR payment_date <= $3)
          AND (${payment.sql})
        GROUP BY currency_code ORDER BY currency_code
      `, [...filters, ...payment.params]) : null,
      fund ? this.ds.query(`
        SELECT currency_code, COUNT(*)::int AS count, SUM(amount_original) AS amount FROM prc2_shareholder_funds
        WHERE ($1::text IS NULL OR company_code = $1)
          AND ($2::date IS NULL OR occurred_date >= $2) AND ($3::date IS NULL OR occurred_date <= $3)
          AND (${fund.sql})
        GROUP BY currency_code ORDER BY currency_code
      `, [...filters, ...fund.params]) : null,
      shipment ? this.ds.query(`
        SELECT COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE status IN ('IN_TRANSIT','CUSTOMS_CLEARING'))::int AS active
        FROM prc2_shipments
        WHERE ($1::text IS NULL OR company_code = $1)
          AND ($2::date IS NULL OR created_at::date >= $2) AND ($3::date IS NULL OR created_at::date <= $3)
          AND (${shipment.sql})
      `, [...filters, ...shipment.params]) : null,
    ]);
    const amounts = (rows: { currency_code: string; amount: string }[] | null) =>
      rows?.map(row => ({ currencyCode: row.currency_code, amount: Number(row.amount) })) ?? null;
    const count = (rows: Record<string, number>[] | null, field: string) =>
      rows?.reduce((total, row) => total + Number(row[field] ?? 0), 0) ?? null;

    return {
      poCount: count(orders, 'count'), poByCurrency: amounts(orders),
      pendingPrCount: count(requests, 'pending'), pendingPoApprovalCount: count(orders, 'pending'),
      apByCurrency: amounts(ap), paymentByCurrency: amounts(payments), fundByCurrency: amounts(funds),
      shareholderFundCount: count(funds, 'count'),
      shipmentTotalCount: count(shipments, 'count'), shipmentInTransitCount: count(shipments, 'active'),
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
      WHERE status IN ('OPEN','PARTIAL','PARTIALLY_PAID')
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
    const scope = await this.scopeFor('MENU_PRC2_ORDER', 4, 'po');
    if (!scope) return [];
    const rows = await this.ds.query(`
      SELECT
        po.project_code,
        po.project_name,
        po.company_code,
        po.company_name,
        po.currency_code,
        COUNT(DISTINCT po.id)                               AS po_count,
        COALESCE(SUM(po.total_amount), 0)                  AS po_amount,
        MAX(bp.budget_amount)                              AS budget_amount,
        MAX(bp.budget_currency)                            AS budget_currency
      FROM prc2_purchase_orders po
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
      WHERE status IN ('PAID','EXECUTED')
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
    const scope = await this.scopeFor('MENU_PRC2_FUND', 3);
    if (!scope) return [];
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
        SUM(CASE WHEN status IN ('IN_TRANSIT','CUSTOMS_CLEARING') THEN 1 ELSE 0 END) AS active_cnt
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
    const scope = await this.scopeFor('MENU_PRC2_ORDER', 4, 'po');
    if (!scope) return [];
    const rows = await this.ds.query(`
      WITH aggregate_by_supplier AS (
        SELECT po.supplier_code,
          po.currency_code,
          MAX(po.supplier_name)                            AS supplier_snapshot_name,
          COUNT(DISTINCT po.id)                            AS po_count,
          COALESCE(SUM(po.total_amount), 0)                AS po_amount,
          COALESCE(SUM(po.received_qty), 0)                AS received_qty
        FROM prc2_purchase_orders po
        WHERE po.status IN ('APPROVED','PARTIALLY_RECEIVED','RECEIVED','PARTIALLY_PAID','PAID','CLOSED')
        AND ($1::varchar IS NULL OR po.company_code = $1)
        AND ($2::varchar IS NULL OR po.supplier_code = $2)
        AND ($3::date IS NULL OR po.created_at::date >= $3::date)
        AND ($4::date IS NULL OR po.created_at::date <= $4::date)
        AND (${scope.sql})
        GROUP BY po.supplier_code, po.currency_code
      ), ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY currency_code ORDER BY po_amount DESC, supplier_code) AS rank
        FROM aggregate_by_supplier
      )
      SELECT a.*, s.supplier_name, s.supplier_name_en, s.supplier_name_lo
      FROM ranked a
      LEFT JOIN prc2_suppliers s ON s.supplier_code = a.supplier_code
      WHERE a.rank <= 20
      ORDER BY a.currency_code, a.rank
    `, [q.companyCode ?? null, q.supplierCode ?? null, q.dateFrom ?? null, q.dateTo ?? null, ...scope.params]);

    return rows.map((r: Record<string, string>) => ({
      supplierCode:  r.supplier_code ?? '',
      supplierName:  r.supplier_name ?? r.supplier_snapshot_name ?? '',
      supplierSnapshotName: r.supplier_snapshot_name ?? '',
      supplierNameEn: r.supplier_name_en ?? '',
      supplierNameLo: r.supplier_name_lo ?? '',
      currencyCode:  r.currency_code ?? '',
      poCount:       Number(r.po_count),
      poAmount:      Number(r.po_amount),
      receivedQty:   Number(r.received_qty),
    }));
  }
}
