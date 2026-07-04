import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource }   from '@nestjs/typeorm';
import { DataSource }         from 'typeorm';

/**
 * FinancialReportsService — Finance V2 Phase 6 Financial Reports Runtime
 *
 * 本服务只做经营财务 Runtime 报表（聚合读），不涉及凭证/总账/科目体系。
 * 全部接口只读，无写操作，无事务。
 * DataScope：scopeAll 用户不做 company_code 过滤；受限用户严格过滤。
 *
 * 数据来源（只读）：
 *   fin_ap_invoices, fin_ar_invoices,
 *   fin_cash_accounts, fin_cash_transactions,
 *   fin_shareholder_contributions,
 *   fin_expense_requests, fin_reimbursements
 */
@Injectable()
export class FinancialReportsService {
  private readonly logger = new Logger(FinancialReportsService.name);

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  // ── 内部工具 ──────────────────────────────────────────────────────────────

  private scope(user: any): { all: boolean; codes: string[] } {
    return {
      all:   !!(user?.dataScope?.scopeAll),
      codes: (user?.dataScope?.companyCodes ?? []) as string[],
    };
  }

  /**
   * 动态构建带可选 company_code 范围过滤的 SQL 片段。
   * 返回 { filter: string; params: any[]; nextIdx: number }
   *
   * @param all   scopeAll 标志
   * @param codes DataScope 公司代码列表
   * @param startIdx 参数起始下标（$1-based）
   * @param alias 字段别名，默认 'company_code'
   */
  private buildScopeFilter(
    all: boolean, codes: string[], startIdx = 1, alias = 'company_code',
  ): { filter: string; params: any[]; nextIdx: number } {
    if (all) return { filter: '', params: [], nextIdx: startIdx };
    return {
      filter:  `AND ${alias} = ANY($${startIdx})`,
      params:  [codes],
      nextIdx: startIdx + 1,
    };
  }

  private emptyScope(all: boolean, codes: string[]) {
    return !all && codes.length === 0;
  }

  private async getChanjetArOpen(all: boolean, codes: string[]) {
    if (this.emptyScope(all, codes)) return { available: false, value: 0, rows: 0, latestPeriod: null as string | null };
    const scopeFilter = all ? '' : 'AND s.company_code = ANY($1)';
    const params = all ? [] : [codes];
    try {
      const rows = await this.ds.query(
        `WITH latest AS (
           SELECT COALESCE(company_code, '') AS company_code, MAX(period) AS period
           FROM chanjet_ar_snapshot
           WHERE 1=1 ${all ? '' : 'AND company_code = ANY($1)'}
           GROUP BY COALESCE(company_code, '')
         )
         SELECT COALESCE(SUM(s.endbalance),0) AS value,
                COUNT(*) AS rows,
                MAX(s.period) AS latest_period
         FROM chanjet_ar_snapshot s
         JOIN latest l
           ON COALESCE(s.company_code, '') = l.company_code
          AND s.period = l.period
         WHERE 1=1 ${scopeFilter}`,
        params,
      );
      const row = rows[0] || {};
      return {
        available: Number(row.rows || 0) > 0,
        value: Number(row.value || 0),
        rows: Number(row.rows || 0),
        latestPeriod: row.latest_period ? String(row.latest_period) : null,
      };
    } catch (error) {
      this.logger.warn(`Chanjet AR alignment unavailable: ${(error as Error).message}`);
      return { available: false, value: 0, rows: 0, latestPeriod: null as string | null };
    }
  }

  private async getChanjetApOpen(all: boolean, codes: string[]) {
    if (this.emptyScope(all, codes)) return { available: false, value: 0, rows: 0, latestPeriod: null as string | null };
    const scopeFilter = all ? '' : 'AND COALESCE(b.company_code, \'\') = ANY($1)';
    const params = all ? [] : [codes];
    try {
      const rows = await this.ds.query(
        `WITH latest AS (
           SELECT s.book_id, COALESCE(s.external_id, s.external_code, s.external_name, '') AS subject_key, MAX(s.updated_at) AS updated_at
           FROM chanjet_entity_snapshots s
           LEFT JOIN chanjet_account_books b ON b.book_id = s.book_id
           WHERE s.entity_type = 'AP_STATISTICS' ${scopeFilter}
           GROUP BY s.book_id, COALESCE(s.external_id, s.external_code, s.external_name, '')
         )
         SELECT COALESCE(SUM(s.amount),0) AS value,
                COUNT(*) AS rows,
                MAX(s.period) AS latest_period
         FROM chanjet_entity_snapshots s
         JOIN latest l
           ON l.book_id = s.book_id
          AND l.subject_key = COALESCE(s.external_id, s.external_code, s.external_name, '')
          AND l.updated_at = s.updated_at
         LEFT JOIN chanjet_account_books b ON b.book_id = s.book_id
         WHERE s.entity_type = 'AP_STATISTICS' ${scopeFilter}`,
        params,
      );
      const row = rows[0] || {};
      return {
        available: Number(row.rows || 0) > 0,
        value: Number(row.value || 0),
        rows: Number(row.rows || 0),
        latestPeriod: row.latest_period ? String(row.latest_period) : null,
      };
    } catch (error) {
      this.logger.warn(`Chanjet AP alignment unavailable: ${(error as Error).message}`);
      return { available: false, value: 0, rows: 0, latestPeriod: null as string | null };
    }
  }

  private async getChanjetEntityAggregate(all: boolean, codes: string[], entityType: string) {
    if (this.emptyScope(all, codes)) return { available: false, value: 0, rows: 0, latestPeriod: null as string | null };
    const scopeFilter = all ? '' : 'AND COALESCE(b.company_code, \'\') = ANY($1)';
    const params = all ? [] : [codes];
    try {
      const rows = await this.ds.query(
        `WITH latest AS (
           SELECT s.book_id,
                  COALESCE(s.external_id, s.external_code, s.external_name, '') AS subject_key,
                  MAX(s.updated_at) AS updated_at
             FROM chanjet_entity_snapshots s
             LEFT JOIN chanjet_account_books b ON b.book_id = s.book_id
            WHERE s.entity_type = $${all ? 1 : 2} ${scopeFilter}
            GROUP BY s.book_id, COALESCE(s.external_id, s.external_code, s.external_name, '')
         )
         SELECT COALESCE(SUM(s.amount),0) AS value,
                COUNT(*) AS rows,
                MAX(s.period) AS latest_period
           FROM chanjet_entity_snapshots s
           JOIN latest l
             ON l.book_id = s.book_id
            AND l.subject_key = COALESCE(s.external_id, s.external_code, s.external_name, '')
            AND l.updated_at = s.updated_at
           LEFT JOIN chanjet_account_books b ON b.book_id = s.book_id
          WHERE s.entity_type = $${all ? 1 : 2} ${scopeFilter}`,
        all ? [entityType] : [codes, entityType],
      );
      const row = rows[0] || {};
      return {
        available: Number(row.rows || 0) > 0,
        value: Number(row.value || 0),
        rows: Number(row.rows || 0),
        latestPeriod: row.latest_period ? String(row.latest_period) : null,
      };
    } catch (error) {
      this.logger.warn(`Chanjet ${entityType} alignment unavailable: ${(error as Error).message}`);
      return { available: false, value: 0, rows: 0, latestPeriod: null as string | null };
    }
  }

  private metricFromChanjet(
    source: string,
    chanjet: { available: boolean; value: number; rows: number; latestPeriod: string | null },
    erpValue: number,
    note: string,
  ) {
    return {
      source: chanjet.available ? source : 'ERP_FALLBACK',
      authoritativeValue: chanjet.available ? chanjet.value : erpValue,
      erpValue,
      diff: (chanjet.available ? chanjet.value : erpValue) - erpValue,
      covered: chanjet.available,
      rows: chanjet.rows,
      latestPeriod: chanjet.latestPeriod,
      note,
    };
  }

  private async getChanjetFinanceAuthority(user: any, erp: {
    apOpen: number;
    arOpen: number;
    cashBalance: number;
    todayInflow: number;
    todayOutflow: number;
  }) {
    const { all, codes } = this.scope(user);
    const [ar, ap, cash, glBalance, arReceipt, apPayment, balanceSheet, incomeStatement] = await Promise.all([
      this.getChanjetArOpen(all, codes),
      this.getChanjetApOpen(all, codes),
      this.getChanjetEntityAggregate(all, codes, 'CASH_ACCOUNT'),
      this.getChanjetEntityAggregate(all, codes, 'GL_BALANCE'),
      this.getChanjetEntityAggregate(all, codes, 'AR_RECEIPT'),
      this.getChanjetEntityAggregate(all, codes, 'AP_PAYMENT'),
      this.getChanjetEntityAggregate(all, codes, 'BALANCE_SHEET'),
      this.getChanjetEntityAggregate(all, codes, 'INCOME_STATEMENT'),
    ]);
    const metrics = {
      arOpen: this.metricFromChanjet('CHANJET_AR_SNAPSHOT', ar, erp.arOpen, '好业财应收汇总优先；ERP 应收发票/总账作为辅助明细。'),
      apOpen: this.metricFromChanjet('CHANJET_AP_STATISTICS_MIRROR', ap, erp.apOpen, '好业财应付汇总优先；ERP 应付发票作为辅助明细。'),
      cashBalance: this.metricFromChanjet('CHANJET_CASH_ACCOUNT_MIRROR', cash, erp.cashBalance, '好业财资金账户镜像优先；ERP 现金账户余额作为辅助差异。'),
      todayInflow: this.metricFromChanjet('CHANJET_AR_RECEIPT_MIRROR', arReceipt, erp.todayInflow, '好业财收款单镜像可用时作为今日收款校验口径；日期字段未映射前保留条件项。'),
      todayOutflow: this.metricFromChanjet('CHANJET_AP_PAYMENT_MIRROR', apPayment, erp.todayOutflow, '好业财付款单镜像可用时作为今日付款校验口径；日期字段未映射前保留条件项。'),
      subjectBalance: this.metricFromChanjet('CHANJET_GL_BALANCE_MIRROR', glBalance, 0, '科目余额表用于财务卡片与科目余额对账，不反写业务明细。'),
      balanceSheet: this.metricFromChanjet('CHANJET_BALANCE_SHEET_MIRROR', balanceSheet, 0, '资产负债表关键项用于经营驾驶舱一致性校验。'),
      incomeStatement: this.metricFromChanjet('CHANJET_INCOME_STATEMENT_MIRROR', incomeStatement, 0, '利润表关键项用于经营驾驶舱一致性校验。'),
    };
    const coveredCount = Object.values(metrics).filter((metric) => metric.covered).length;
    const metricCount = Object.values(metrics).length;
    return {
      authority: 'CHANJET_FIRST_FOR_FINANCIAL_CARDS',
      coverageRate: metricCount ? coveredCount / metricCount : 0,
      metrics,
      guardrail: 'Chanjet readonly mirror overrides finance card authority when available. ERP tables remain operational detail and are not overwritten; mismatches must be shown, not silently covered.',
    };
  }

  // ── 1. 经营资金总览 ───────────────────────────────────────────────────────

  async getOverview(user: any) {
    const { all, codes } = this.scope(user);
    const { filter: sf, params: sp } = this.buildScopeFilter(all, codes);

    const run = (sql: string, extraParams: any[] = []) =>
      this.ds.query(sql, [...extraParams, ...sp]);

    const [apRow, arRow, cashRow, shRow, expRow, reimbRow, todayRows, byCurrRows, byCompRows, arLedgerRow] =
      await Promise.all([
        // AP 未付款余额
        run(`SELECT COALESCE(SUM(balance_amount_base),0) AS v FROM fin_ap_invoices WHERE status NOT IN ('PAID','CANCELLED') ${sf}`),
        // AR 未收款余额
        run(`SELECT COALESCE(SUM(balance_amount_base),0) AS v FROM fin_ar_invoices WHERE status NOT IN ('COLLECTED','CANCELLED') ${sf}`),
        // 现金账户总余额
        run(`SELECT COALESCE(SUM(current_balance),0) AS v FROM fin_cash_accounts WHERE status='ACTIVE' ${sf}`),
        // 股东出资余额
        run(`SELECT COALESCE(SUM(balance_amount_base),0) AS v FROM fin_shareholder_contributions WHERE status NOT IN ('SETTLED','CANCELLED') ${sf}`),
        // 费用申请（未结束状态）
        run(`SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_base),0) AS v FROM fin_expense_requests WHERE status IN ('SUBMITTED','PENDING_APPROVAL','APPROVED') ${sf}`),
        // 报销待处理
        run(`SELECT COUNT(*) AS cnt, COALESCE(SUM(reimb_amount_base),0) AS v FROM fin_reimbursements WHERE status IN ('PENDING','PENDING_APPROVAL','APPROVED') ${sf}`),
        // 今日现金流
        run(`SELECT direction, COALESCE(SUM(amount),0) AS v FROM fin_cash_transactions WHERE DATE(created_at)=CURRENT_DATE ${sf} GROUP BY direction`),
        // 按币种现金余额
        run(`SELECT currency_code, COALESCE(SUM(current_balance),0) AS v FROM fin_cash_accounts WHERE status='ACTIVE' ${sf} GROUP BY currency_code ORDER BY v DESC`),
        // 按公司现金余额
        run(`SELECT company_code, COALESCE(SUM(current_balance),0) AS v FROM fin_cash_accounts WHERE status='ACTIVE' ${sf} GROUP BY company_code ORDER BY v DESC`),
        // G61：应收总账(OCR快照) — 每客户最新期间期末本币(CNY)，并入应收待收（fin_ar_invoices 之外的应收来源）
        run(`SELECT COALESCE(SUM(closing_amount_base),0) AS v FROM (
               SELECT DISTINCT ON (farm_code, counterparty_code) closing_amount_base
               FROM fin_ar_ledger WHERE 1=1 ${sf}
               ORDER BY farm_code, counterparty_code, period_date DESC
             ) t`),
      ]);

    const erpApOpen = Number(apRow[0]?.v   ?? 0);
    // G61：应收待收 = 发票应收(fin_ar_invoices) + 应收总账OCR快照最新期末(fin_ar_ledger)
    const erpArOpen = Number(arRow[0]?.v   ?? 0) + Number(arLedgerRow[0]?.v ?? 0);
    const erpCashBal = Number(cashRow[0]?.v ?? 0);
    const shBal     = Number(shRow[0]?.v   ?? 0);
    const reimbPend = Number(reimbRow[0]?.v ?? 0);

    const erpTodayIn  = Number(todayRows.find((r: any) => r.direction === 'IN')?.v  ?? 0);
    const erpTodayOut = Number(todayRows.find((r: any) => r.direction === 'OUT')?.v ?? 0);
    const chanjetAlignment = await this.getChanjetFinanceAuthority(user, {
      apOpen: erpApOpen,
      arOpen: erpArOpen,
      cashBalance: erpCashBal,
      todayInflow: erpTodayIn,
      todayOutflow: erpTodayOut,
    });
    const apOpen    = chanjetAlignment.metrics.apOpen.authoritativeValue;
    const arOpen    = chanjetAlignment.metrics.arOpen.authoritativeValue;
    const cashBal   = chanjetAlignment.metrics.cashBalance.authoritativeValue;
    const todayIn   = chanjetAlignment.metrics.todayInflow.authoritativeValue;
    const todayOut  = chanjetAlignment.metrics.todayOutflow.authoritativeValue;

    // 经营净头寸 = 现金 + AR - AP - 待报销
    const netOperatingPosition = cashBal + arOpen - apOpen - reimbPend;

    return {
      apOpen,
      arOpen,
      cashBalance:               cashBal,
      shareholderBalance:        shBal,
      expensePendingCount:       Number(expRow[0]?.cnt ?? 0),
      expensePendingAmount:      Number(expRow[0]?.v   ?? 0),
      reimbursementPendingCount:  Number(reimbRow[0]?.cnt ?? 0),
      reimbursementPendingAmount: reimbPend,
      netOperatingPosition,
      todayInflow:  todayIn,
      todayOutflow: todayOut,
      byCurrency: byCurrRows.map((r: any) => ({ currencyCode: r.currency_code, cashBalance: Number(r.v) })),
      byCompany:  byCompRows.map((r: any) => ({ companyCode: r.company_code,   cashBalance: Number(r.v) })),
      sourceAuthority: {
        apOpen: chanjetAlignment.metrics.apOpen.source,
        arOpen: chanjetAlignment.metrics.arOpen.source,
        cashBalance: chanjetAlignment.metrics.cashBalance.source,
        todayInflow: chanjetAlignment.metrics.todayInflow.source,
        todayOutflow: chanjetAlignment.metrics.todayOutflow.source,
        subjectBalance: chanjetAlignment.metrics.subjectBalance.source,
        balanceSheet: chanjetAlignment.metrics.balanceSheet.source,
        incomeStatement: chanjetAlignment.metrics.incomeStatement.source,
        shareholderBalance: 'ERP_SHAREHOLDER_LEDGER',
        expensePending: 'ERP_EXPENSE_WORKFLOW',
        reimbursementPending: 'ERP_REIMBURSEMENT_WORKFLOW',
      },
      chanjetAlignment,
    };
  }

  async getChanjetAlignment(user: any) {
    const overview = await this.getOverview(user);
    return {
      generatedAt: new Date().toISOString(),
      coverageRate: overview.chanjetAlignment.coverageRate,
      authority: overview.chanjetAlignment.authority,
      metrics: overview.chanjetAlignment.metrics,
      cards: [
        {
          cardKey: 'arOpen',
          label: '应收待收款',
          displayValue: overview.arOpen,
          source: overview.sourceAuthority.arOpen,
          erpValue: overview.chanjetAlignment.metrics.arOpen.erpValue,
          chanjetValue: overview.chanjetAlignment.metrics.arOpen.covered ? overview.chanjetAlignment.metrics.arOpen.authoritativeValue : null,
          diff: overview.chanjetAlignment.metrics.arOpen.diff,
        },
        {
          cardKey: 'apOpen',
          label: '应付待付款',
          displayValue: overview.apOpen,
          source: overview.sourceAuthority.apOpen,
          erpValue: overview.chanjetAlignment.metrics.apOpen.erpValue,
          chanjetValue: overview.chanjetAlignment.metrics.apOpen.covered ? overview.chanjetAlignment.metrics.apOpen.authoritativeValue : null,
          diff: overview.chanjetAlignment.metrics.apOpen.diff,
        },
        {
          cardKey: 'cashBalance',
          label: '现金账户余额',
          displayValue: overview.cashBalance,
          source: overview.sourceAuthority.cashBalance,
          erpValue: overview.chanjetAlignment.metrics.cashBalance.erpValue,
          chanjetValue: overview.chanjetAlignment.metrics.cashBalance.covered ? overview.chanjetAlignment.metrics.cashBalance.authoritativeValue : null,
          diff: overview.chanjetAlignment.metrics.cashBalance.diff,
        },
        {
          cardKey: 'todayInflow',
          label: '今日收款',
          displayValue: overview.todayInflow,
          source: overview.sourceAuthority.todayInflow,
          erpValue: overview.chanjetAlignment.metrics.todayInflow.erpValue,
          chanjetValue: overview.chanjetAlignment.metrics.todayInflow.covered ? overview.chanjetAlignment.metrics.todayInflow.authoritativeValue : null,
          diff: overview.chanjetAlignment.metrics.todayInflow.diff,
        },
        {
          cardKey: 'todayOutflow',
          label: '今日付款',
          displayValue: overview.todayOutflow,
          source: overview.sourceAuthority.todayOutflow,
          erpValue: overview.chanjetAlignment.metrics.todayOutflow.erpValue,
          chanjetValue: overview.chanjetAlignment.metrics.todayOutflow.covered ? overview.chanjetAlignment.metrics.todayOutflow.authoritativeValue : null,
          diff: overview.chanjetAlignment.metrics.todayOutflow.diff,
        },
        {
          cardKey: 'subjectBalance',
          label: '科目余额',
          displayValue: overview.chanjetAlignment.metrics.subjectBalance.authoritativeValue,
          source: overview.sourceAuthority.subjectBalance,
          erpValue: 0,
          chanjetValue: overview.chanjetAlignment.metrics.subjectBalance.covered ? overview.chanjetAlignment.metrics.subjectBalance.authoritativeValue : null,
          diff: overview.chanjetAlignment.metrics.subjectBalance.diff,
        },
        {
          cardKey: 'balanceSheet',
          label: '资产负债表关键项',
          displayValue: overview.chanjetAlignment.metrics.balanceSheet.authoritativeValue,
          source: overview.sourceAuthority.balanceSheet,
          erpValue: 0,
          chanjetValue: overview.chanjetAlignment.metrics.balanceSheet.covered ? overview.chanjetAlignment.metrics.balanceSheet.authoritativeValue : null,
          diff: overview.chanjetAlignment.metrics.balanceSheet.diff,
        },
        {
          cardKey: 'incomeStatement',
          label: '利润表关键项',
          displayValue: overview.chanjetAlignment.metrics.incomeStatement.authoritativeValue,
          source: overview.sourceAuthority.incomeStatement,
          erpValue: 0,
          chanjetValue: overview.chanjetAlignment.metrics.incomeStatement.covered ? overview.chanjetAlignment.metrics.incomeStatement.authoritativeValue : null,
          diff: overview.chanjetAlignment.metrics.incomeStatement.diff,
        },
      ],
      decision: overview.chanjetAlignment.coverageRate >= 0.9 ? 'GO' : 'GO_WITH_CONDITIONS',
      conditions: overview.chanjetAlignment.coverageRate >= 0.9
        ? []
        : ['当前自动化覆盖率低于 90% 时，未覆盖卡片继续显示 ERP-only 来源，需继续补齐好业财现金/费用/股东资金映射。'],
    };
  }

  // ── 2. AP 账龄分析 ────────────────────────────────────────────────────────

  async getApAging(user: any, companyCode?: string) {
    const { all, codes } = this.scope(user);
    const effectiveCodes = companyCode ? [companyCode] : codes;
    const skipScope = all && !companyCode;

    const params: any[] = skipScope ? [] : [effectiveCodes];
    const filter = skipScope ? '' : 'AND company_code = ANY($1)';

    const rows: any[] = await this.ds.query(
      `SELECT
         supplier_name,
         supplier_code,
         currency_code,
         company_code,
         COALESCE(SUM(CASE WHEN due_date IS NULL OR due_date >= CURRENT_DATE
                          THEN balance_amount_base END), 0)                                                AS not_due,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days'
                          THEN balance_amount_base END), 0)                                                AS d0_30,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '30 days'
                            AND due_date >= CURRENT_DATE - INTERVAL '60 days'
                          THEN balance_amount_base END), 0)                                                AS d31_60,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '60 days'
                            AND due_date >= CURRENT_DATE - INTERVAL '90 days'
                          THEN balance_amount_base END), 0)                                                AS d61_90,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '90 days'
                          THEN balance_amount_base END), 0)                                                AS d_over90,
         COALESCE(SUM(balance_amount_base), 0)                                                             AS total
       FROM fin_ap_invoices
       WHERE status NOT IN ('PAID','CANCELLED')
       ${filter}
       GROUP BY supplier_name, supplier_code, currency_code, company_code
       ORDER BY total DESC`,
      params,
    );

    const summary = { notDue: 0, d030: 0, d3160: 0, d6190: 0, dOver90: 0, total: 0 };
    rows.forEach((r: any) => {
      summary.notDue  += Number(r.not_due);
      summary.d030    += Number(r.d0_30);
      summary.d3160   += Number(r.d31_60);
      summary.d6190   += Number(r.d61_90);
      summary.dOver90 += Number(r.d_over90);
      summary.total   += Number(r.total);
    });

    return {
      summary,
      rows: rows.map((r: any) => ({
        supplierName: r.supplier_name,
        supplierCode: r.supplier_code,
        currencyCode: r.currency_code,
        companyCode:  r.company_code,
        notDue:       Number(r.not_due),
        d030:         Number(r.d0_30),
        d3160:        Number(r.d31_60),
        d6190:        Number(r.d61_90),
        dOver90:      Number(r.d_over90),
        total:        Number(r.total),
      })),
    };
  }

  // ── 3. AP 供应商 TOP 20 ───────────────────────────────────────────────────

  async getApTopSuppliers(user: any) {
    const { all, codes } = this.scope(user);
    const { filter, params } = this.buildScopeFilter(all, codes);

    const rows: any[] = await this.ds.query(
      `SELECT supplier_name, supplier_code,
              COUNT(*)              AS invoice_count,
              COALESCE(SUM(amount_base),0)          AS total_amount,
              COALESCE(SUM(balance_amount_base),0)  AS open_amount
       FROM fin_ap_invoices
       WHERE status NOT IN ('CANCELLED')
       ${filter}
       GROUP BY supplier_name, supplier_code
       ORDER BY total_amount DESC
       LIMIT 20`,
      params,
    );

    return rows.map((r: any, i: number) => ({
      rank:         i + 1,
      supplierName: r.supplier_name,
      supplierCode: r.supplier_code,
      invoiceCount: Number(r.invoice_count),
      totalAmount:  Number(r.total_amount),
      openAmount:   Number(r.open_amount),
    }));
  }

  // ── 4. AR 账龄分析 ────────────────────────────────────────────────────────

  async getArAging(user: any, companyCode?: string) {
    const { all, codes } = this.scope(user);
    const effectiveCodes = companyCode ? [companyCode] : codes;
    const skipScope = all && !companyCode;

    const params: any[] = skipScope ? [] : [effectiveCodes];
    const filter = skipScope ? '' : 'AND company_code = ANY($1)';

    const rows: any[] = await this.ds.query(
      `SELECT
         customer_name,
         currency_code,
         company_code,
         COALESCE(SUM(CASE WHEN due_date IS NULL OR due_date >= CURRENT_DATE
                          THEN balance_amount_base END), 0)                                                AS not_due,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days'
                          THEN balance_amount_base END), 0)                                                AS d0_30,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '30 days'
                            AND due_date >= CURRENT_DATE - INTERVAL '60 days'
                          THEN balance_amount_base END), 0)                                                AS d31_60,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '60 days'
                            AND due_date >= CURRENT_DATE - INTERVAL '90 days'
                          THEN balance_amount_base END), 0)                                                AS d61_90,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '90 days'
                          THEN balance_amount_base END), 0)                                                AS d_over90,
         COALESCE(SUM(balance_amount_base), 0)                                                             AS total
       FROM fin_ar_invoices
       WHERE status NOT IN ('COLLECTED','CANCELLED')
       ${filter}
       GROUP BY customer_name, currency_code, company_code
       ORDER BY total DESC`,
      params,
    );

    const summary = { notDue: 0, d030: 0, d3160: 0, d6190: 0, dOver90: 0, total: 0 };
    rows.forEach((r: any) => {
      summary.notDue  += Number(r.not_due);
      summary.d030    += Number(r.d0_30);
      summary.d3160   += Number(r.d31_60);
      summary.d6190   += Number(r.d61_90);
      summary.dOver90 += Number(r.d_over90);
      summary.total   += Number(r.total);
    });

    return {
      summary,
      rows: rows.map((r: any) => ({
        customerName: r.customer_name,
        currencyCode: r.currency_code,
        companyCode:  r.company_code,
        notDue:       Number(r.not_due),
        d030:         Number(r.d0_30),
        d3160:        Number(r.d31_60),
        d6190:        Number(r.d61_90),
        dOver90:      Number(r.d_over90),
        total:        Number(r.total),
      })),
    };
  }

  // ── 5. AR 客户 TOP 20 ─────────────────────────────────────────────────────

  async getArTopCustomers(user: any) {
    const { all, codes } = this.scope(user);
    const { filter, params } = this.buildScopeFilter(all, codes);

    const rows: any[] = await this.ds.query(
      `SELECT customer_name,
              COUNT(*)              AS invoice_count,
              COALESCE(SUM(amount_base),0)          AS total_amount,
              COALESCE(SUM(balance_amount_base),0)  AS open_amount
       FROM fin_ar_invoices
       WHERE status NOT IN ('CANCELLED')
       ${filter}
       GROUP BY customer_name
       ORDER BY total_amount DESC
       LIMIT 20`,
      params,
    );

    return rows.map((r: any, i: number) => ({
      rank:         i + 1,
      customerName: r.customer_name,
      invoiceCount: Number(r.invoice_count),
      totalAmount:  Number(r.total_amount),
      openAmount:   Number(r.open_amount),
    }));
  }

  // ── 6. 资金账户总览 ───────────────────────────────────────────────────────

  async getCashOverview(user: any) {
    const { all, codes } = this.scope(user);
    const { filter, params } = this.buildScopeFilter(all, codes);

    const [totRow, byTypeRows, byCurrRows, byCompRows] = await Promise.all([
      this.ds.query(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(current_balance),0) AS v FROM fin_cash_accounts WHERE status='ACTIVE' ${filter}`,
        params,
      ),
      this.ds.query(
        `SELECT account_type, COUNT(*) AS cnt, COALESCE(SUM(current_balance),0) AS v FROM fin_cash_accounts WHERE status='ACTIVE' ${filter} GROUP BY account_type ORDER BY v DESC`,
        params,
      ),
      this.ds.query(
        `SELECT currency_code, COUNT(*) AS cnt, COALESCE(SUM(current_balance),0) AS v FROM fin_cash_accounts WHERE status='ACTIVE' ${filter} GROUP BY currency_code ORDER BY v DESC`,
        params,
      ),
      this.ds.query(
        `SELECT company_code, COUNT(*) AS cnt, COALESCE(SUM(current_balance),0) AS v FROM fin_cash_accounts WHERE status='ACTIVE' ${filter} GROUP BY company_code ORDER BY v DESC`,
        params,
      ),
    ]);

    return {
      totalBalance:   Number(totRow[0]?.v   ?? 0),
      activeAccounts: Number(totRow[0]?.cnt ?? 0),
      byAccountType:  byTypeRows.map((r: any) => ({ accountType: r.account_type, count: Number(r.cnt), balance: Number(r.v) })),
      byCurrency:     byCurrRows.map((r: any) => ({ currencyCode: r.currency_code, count: Number(r.cnt), balance: Number(r.v) })),
      byCompany:      byCompRows.map((r: any) => ({ companyCode: r.company_code,   count: Number(r.cnt), balance: Number(r.v) })),
    };
  }

  // ── 7. 资金日度流水 ───────────────────────────────────────────────────────

  async getCashDailyFlow(user: any, dateFrom?: string, dateTo?: string) {
    const { all, codes } = this.scope(user);
    const { filter, params: scopeParams } = this.buildScopeFilter(all, codes, 3);

    const from = dateFrom ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const to   = dateTo   ?? new Date().toISOString().slice(0, 10);

    const rows: any[] = await this.ds.query(
      `SELECT DATE(created_at) AS txn_date, direction, COALESCE(SUM(amount),0) AS v
       FROM fin_cash_transactions
       WHERE DATE(created_at) BETWEEN $1 AND $2
       ${filter}
       GROUP BY DATE(created_at), direction
       ORDER BY txn_date ASC`,
      [from, to, ...scopeParams],
    );

    const pivot: Record<string, { date: string; inflow: number; outflow: number }> = {};
    rows.forEach((r: any) => {
      const d = String(r.txn_date).slice(0, 10);
      if (!pivot[d]) pivot[d] = { date: d, inflow: 0, outflow: 0 };
      if (r.direction === 'IN')  pivot[d].inflow  += Number(r.v);
      if (r.direction === 'OUT') pivot[d].outflow += Number(r.v);
    });

    return {
      dateFrom: from,
      dateTo:   to,
      rows: Object.values(pivot).map(r => ({ ...r, net: r.inflow - r.outflow })),
    };
  }

  // ── 8. 费用统计 ───────────────────────────────────────────────────────────

  async getExpenseSummary(user: any) {
    const { all, codes } = this.scope(user);
    const { filter, params } = this.buildScopeFilter(all, codes);
    const activeFilter = `${filter ? filter + ' AND' : 'AND'} status NOT IN ('CANCELLED')`;
    const activeParams = params;

    const [statusRows, byTypeRows, byCompRows, byProjRows] = await Promise.all([
      this.ds.query(
        `SELECT status, COUNT(*) AS cnt, COALESCE(SUM(amount_base),0) AS v FROM fin_expense_requests WHERE 1=1 ${filter} GROUP BY status`,
        params,
      ),
      this.ds.query(
        `SELECT expense_type, COUNT(*) AS cnt, COALESCE(SUM(amount_base),0) AS v FROM fin_expense_requests WHERE 1=1 ${activeFilter} GROUP BY expense_type ORDER BY v DESC`,
        activeParams,
      ),
      this.ds.query(
        `SELECT company_code, COUNT(*) AS cnt, COALESCE(SUM(amount_base),0) AS v FROM fin_expense_requests WHERE 1=1 ${activeFilter} GROUP BY company_code ORDER BY v DESC`,
        activeParams,
      ),
      this.ds.query(
        `SELECT project_code, COUNT(*) AS cnt, COALESCE(SUM(amount_base),0) AS v FROM fin_expense_requests WHERE project_code IS NOT NULL ${activeFilter} GROUP BY project_code ORDER BY v DESC LIMIT 20`,
        activeParams,
      ),
    ]);

    const byStatus: Record<string, { count: number; amount: number }> = {};
    statusRows.forEach((r: any) => {
      byStatus[r.status] = { count: Number(r.cnt), amount: Number(r.v) };
    });

    return {
      byStatus,
      byExpenseType: byTypeRows.map((r: any) => ({ expenseType: r.expense_type, count: Number(r.cnt), total: Number(r.v) })),
      byCompany:     byCompRows.map((r: any) => ({ companyCode: r.company_code,  count: Number(r.cnt), total: Number(r.v) })),
      byProject:     byProjRows.map((r: any) => ({ projectCode: r.project_code,  count: Number(r.cnt), total: Number(r.v) })),
    };
  }

  // ── 9. 报销统计 ───────────────────────────────────────────────────────────

  async getReimbursementSummary(user: any) {
    const { all, codes } = this.scope(user);
    const { filter, params } = this.buildScopeFilter(all, codes);

    const [statusRows, avgRow] = await Promise.all([
      this.ds.query(
        `SELECT status, COUNT(*) AS cnt, COALESCE(SUM(reimb_amount_base),0) AS v FROM fin_reimbursements WHERE 1=1 ${filter} GROUP BY status`,
        params,
      ),
      this.ds.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400) AS avg_days FROM fin_reimbursements WHERE status='PAID' ${filter}`,
        params,
      ),
    ]);

    const byStatus: Record<string, { count: number; amount: number }> = {};
    statusRows.forEach((r: any) => {
      byStatus[r.status] = { count: Number(r.cnt), amount: Number(r.v) };
    });

    return {
      byStatus,
      avgProcessingDays: avgRow[0]?.avg_days != null
        ? Number(Number(avgRow[0].avg_days).toFixed(1))
        : null,
    };
  }

  // ── 10. 股东资金统计 ──────────────────────────────────────────────────────

  async getShareholderSummary(user: any) {
    const { all, codes } = this.scope(user);
    const { filter, params } = this.buildScopeFilter(all, codes);
    const activeFilter = `${filter ? filter + ' AND' : 'AND'} status NOT IN ('CANCELLED')`;

    const [byShRows, byTypeRows, upcomingRows] = await Promise.all([
      this.ds.query(
        `SELECT shareholder_name,
                COUNT(*) AS cnt,
                COALESCE(SUM(amount_base),0)          AS total,
                COALESCE(SUM(settled_amount_base),0)  AS settled,
                COALESCE(SUM(balance_amount_base),0)  AS balance
         FROM fin_shareholder_contributions
         WHERE status NOT IN ('CANCELLED') ${filter}
         GROUP BY shareholder_name
         ORDER BY total DESC LIMIT 20`,
        params,
      ),
      this.ds.query(
        `SELECT contribution_type,
                COUNT(*) AS cnt,
                COALESCE(SUM(amount_base),0)         AS total,
                COALESCE(SUM(balance_amount_base),0) AS balance
         FROM fin_shareholder_contributions
         WHERE status NOT IN ('CANCELLED') ${filter}
         GROUP BY contribution_type ORDER BY total DESC`,
        params,
      ),
      // 90 天内即将到期的出资
      this.ds.query(
        `SELECT shareholder_name, expected_return_date, balance_amount_base, company_code
         FROM fin_shareholder_contributions
         WHERE status NOT IN ('SETTLED','CANCELLED')
           AND expected_return_date IS NOT NULL
           AND expected_return_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
           ${filter}
         ORDER BY expected_return_date ASC LIMIT 20`,
        params,
      ),
    ]);

    return {
      byShareholder: byShRows.map((r: any) => ({
        shareholderName: r.shareholder_name,
        count:           Number(r.cnt),
        totalAmount:     Number(r.total),
        settledAmount:   Number(r.settled),
        balanceAmount:   Number(r.balance),
      })),
      byContributionType: byTypeRows.map((r: any) => ({
        contributionType: r.contribution_type,
        count:            Number(r.cnt),
        totalAmount:      Number(r.total),
        balanceAmount:    Number(r.balance),
      })),
      upcomingReturns: upcomingRows.map((r: any) => ({
        shareholderName:    r.shareholder_name,
        expectedReturnDate: r.expected_return_date,
        balanceAmount:      Number(r.balance_amount_base),
        companyCode:        r.company_code,
      })),
    };
  }

  // ── 11. 项目维度财务 ──────────────────────────────────────────────────────

  async getProjectFinance(user: any, projectCode?: string) {
    const { all, codes } = this.scope(user);

    /** 动态 SQL builder（参数位置安全） */
    const buildQ = (
      from: string,
      excludeStatuses: string[],
      valCol: string,
    ) => {
      const params: any[] = [];
      let idx = 1;
      const conds: string[] = [
        `status NOT IN (${excludeStatuses.map(s => `'${s}'`).join(',')})`,
        `project_code IS NOT NULL`,
      ];
      if (projectCode)  { conds.push(`project_code = $${idx++}`);       params.push(projectCode); }
      if (!all)         { conds.push(`company_code = ANY($${idx++})`);   params.push(codes);       }
      return this.ds.query(
        `SELECT project_code, company_code, COALESCE(SUM(${valCol}),0) AS v
         FROM ${from} WHERE ${conds.join(' AND ')}
         GROUP BY project_code, company_code`,
        params,
      );
    };

    const [apRows, arRows, shRows, expRows] = await Promise.all([
      buildQ('fin_ap_invoices',               ['PAID', 'CANCELLED'],       'balance_amount_base'),
      buildQ('fin_ar_invoices',               ['COLLECTED', 'CANCELLED'],  'balance_amount_base'),
      buildQ('fin_shareholder_contributions', ['SETTLED', 'CANCELLED'],    'balance_amount_base'),
      buildQ('fin_expense_requests',          ['CANCELLED'],               'amount_base'),
    ]);

    const map: Record<string, {
      projectCode: string; companyCode: string;
      apOpen: number; arOpen: number; shBalance: number; expenseTotal: number;
    }> = {};
    const ensure = (pc: string, cc: string) => {
      const k = `${pc}|${cc}`;
      if (!map[k]) map[k] = { projectCode: pc, companyCode: cc, apOpen: 0, arOpen: 0, shBalance: 0, expenseTotal: 0 };
      return k;
    };
    apRows.forEach((r: any)  => { map[ensure(r.project_code, r.company_code)].apOpen       = Number(r.v); });
    arRows.forEach((r: any)  => { map[ensure(r.project_code, r.company_code)].arOpen       = Number(r.v); });
    shRows.forEach((r: any)  => { map[ensure(r.project_code, r.company_code)].shBalance    = Number(r.v); });
    expRows.forEach((r: any) => { map[ensure(r.project_code, r.company_code)].expenseTotal = Number(r.v); });

    return Object.values(map)
      .map(p => ({ ...p, netPosition: p.arOpen - p.apOpen - p.expenseTotal }))
      .sort((a, b) => b.arOpen - a.arOpen);
  }

  // ── 12. 公司维度财务 ──────────────────────────────────────────────────────

  async getCompanyFinance(user: any) {
    const { all, codes } = this.scope(user);
    const { filter, params } = this.buildScopeFilter(all, codes);

    const [apRows, arRows, cashRows, shRows, expRows] = await Promise.all([
      this.ds.query(
        `SELECT company_code, COALESCE(SUM(balance_amount_base),0) AS v FROM fin_ap_invoices WHERE status NOT IN ('PAID','CANCELLED') ${filter} GROUP BY company_code`,
        params,
      ),
      this.ds.query(
        `SELECT company_code, COALESCE(SUM(balance_amount_base),0) AS v FROM fin_ar_invoices WHERE status NOT IN ('COLLECTED','CANCELLED') ${filter} GROUP BY company_code`,
        params,
      ),
      this.ds.query(
        `SELECT company_code, COALESCE(SUM(current_balance),0) AS v FROM fin_cash_accounts WHERE status='ACTIVE' ${filter} GROUP BY company_code`,
        params,
      ),
      this.ds.query(
        `SELECT company_code, COALESCE(SUM(balance_amount_base),0) AS v FROM fin_shareholder_contributions WHERE status NOT IN ('SETTLED','CANCELLED') ${filter} GROUP BY company_code`,
        params,
      ),
      this.ds.query(
        `SELECT company_code, COALESCE(SUM(amount_base),0) AS v FROM fin_expense_requests WHERE status NOT IN ('CANCELLED') ${filter} GROUP BY company_code`,
        params,
      ),
    ]);

    const companies: Record<string, {
      companyCode: string;
      apOpen: number; arOpen: number; cashBalance: number; shBalance: number; expenseTotal: number;
    }> = {};
    const ensure = (cc: string) => {
      if (!companies[cc]) companies[cc] = { companyCode: cc, apOpen: 0, arOpen: 0, cashBalance: 0, shBalance: 0, expenseTotal: 0 };
    };
    apRows.forEach((r: any)  => { ensure(r.company_code); companies[r.company_code].apOpen       = Number(r.v); });
    arRows.forEach((r: any)  => { ensure(r.company_code); companies[r.company_code].arOpen       = Number(r.v); });
    cashRows.forEach((r: any) => { ensure(r.company_code); companies[r.company_code].cashBalance  = Number(r.v); });
    shRows.forEach((r: any)  => { ensure(r.company_code); companies[r.company_code].shBalance    = Number(r.v); });
    expRows.forEach((r: any) => { ensure(r.company_code); companies[r.company_code].expenseTotal = Number(r.v); });

    return Object.values(companies)
      .map(c => ({
        ...c,
        netOperatingPosition: c.cashBalance + c.arOpen - c.apOpen - c.expenseTotal,
      }))
      .sort((a, b) => b.cashBalance - a.cashBalance);
  }
}
