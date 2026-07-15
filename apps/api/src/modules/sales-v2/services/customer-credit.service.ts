import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../../org/services/data-scope.service';

/**
 * 客户信用分析快照
 * Sales V2 Phase 5 — 读取 Finance V2 fin_ar_invoices，严禁读 fin_transactions
 */
export interface CustomerArSnapshot {
  customerCode:       string;
  customerName:       string;
  companyCode:        string;
  creditLimit:        number;
  creditUsed:         number;
  creditAvailable:    number;
  paymentTerms:       number;   // 账期（天）
  riskLevel:          string;
  creditStatus:       string;
  status:             string;
  // AR 聚合（来自 fin_ar_invoices）
  totalReceivable:    number;   // 所有未收款合计（open + overdue）
  overdueReceivable:  number;   // 逾期未收合计
  notDueReceivable:   number;   // 未到期应收
  openInvoiceCount:   number;   // 未结清发票数
  earliestOverdueDate:string | null; // 最早逾期日期
  overdueDays:        number;   // 最早逾期单的逾期天数
  lastReceiptDate:    string | null;  // 最近收款日期
  snapshotAt:         string;
}

/**
 * 信用状态评估结果
 */
export interface CreditEvaluation {
  creditStatus:      'NORMAL' | 'WARNING' | 'OVER_LIMIT' | 'OVERDUE' | 'FROZEN';
  allowOrder:        boolean;   // 是否允许下单
  requireApproval:   boolean;   // 是否需要审批
  creditWarning:     boolean;   // 是否标记 credit_warning
  snapshot:          CustomerArSnapshot;
  reason:            string;
}

@Injectable()
export class CustomerCreditService {
  private readonly logger = new Logger(CustomerCreditService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  // ── 内部工具 ──────────────────────────────────────────────────────────────

  private getScope(): { companyCodes: string[]; scopeAll: boolean } {
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    return scope
      ? { companyCodes: scope.allowedCompanyCodes, scopeAll: scope.isGlobal }
      : { companyCodes: [], scopeAll: false };
  }

  /**
   * 获取客户行（by customer ID），并做 DataScope 校验
   */
  private async getCustomerRow(id: string): Promise<any> {
    const rows = await this.ds.query(
      `SELECT * FROM sal_customers WHERE id = $1`, [id],
    );
    if (!rows?.length) throw new NotFoundException(`客户 ${id} 不存在`);
    const rec = rows[0];
    const user = this.getScope();
    if (!user.scopeAll) {
      if (user.companyCodes.length === 0 || !user.companyCodes.includes(rec.company_code)) {
        throw new ForbiddenException(`无权访问公司 ${rec.company_code} 的客户数据`);
      }
    }
    return rec;
  }

  // ── 1. getCustomerArSnapshot ──────────────────────────────────────────────

  /**
   * 读取客户应收账款快照
   * 数据源：Finance V2 fin_ar_invoices（严禁读 fin_transactions）
   */
  async getCustomerArSnapshot(customerCode: string, companyCode: string): Promise<CustomerArSnapshot> {
    // 查客户行
    const custRows = await this.ds.query(
      `SELECT * FROM sal_customers
       WHERE customer_no = $1 AND company_code = $2
       LIMIT 1`,
      [customerCode, companyCode],
    );

    // 历史业务单据可能仍保存 legacy_customer_code，主档以 customer_no 为标准。
    let cust = custRows[0] ?? null;
    if (!cust) {
      const byCode = await this.ds.query(
        `SELECT * FROM sal_customers WHERE legacy_customer_code = $1 AND company_code = $2 LIMIT 1`,
        [customerCode, companyCode],
      );
      cust = byCode[0] ?? null;
    }
    if (!cust) throw new NotFoundException(`客户 ${customerCode} 不存在`);

    // 查 fin_ar_invoices
    const arKey = cust.customer_no ?? customerCode;
    const [agingRow, receiptRow] = await Promise.all([
      this.ds.query(
        `SELECT
           COUNT(*)                       FILTER (WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')) AS open_count,
           COALESCE(SUM(balance_amount_original) FILTER (WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')), 0) AS total_receivable,
           COALESCE(SUM(balance_amount_original) FILTER (
             WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')
               AND due_date < CURRENT_DATE
           ), 0) AS overdue_receivable,
           COALESCE(SUM(balance_amount_original) FILTER (
             WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')
               AND (due_date IS NULL OR due_date >= CURRENT_DATE)
           ), 0) AS not_due_receivable,
           MIN(due_date) FILTER (
             WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')
               AND due_date < CURRENT_DATE
           ) AS earliest_overdue_date
         FROM fin_ar_invoices
         WHERE customer_code = $1`,
        [arKey],
      ),
      this.ds.query(
        `SELECT MAX(r.created_at) AS last_receipt_date
         FROM fin_ar_receipts r
         JOIN fin_ar_receipt_allocations a ON a.receipt_id = r.id
         JOIN fin_ar_invoices i ON i.id = a.invoice_id
         WHERE i.customer_code = $1`,
        [arKey],
      ).catch(() => [{ last_receipt_date: null }]),
    ]);

    const ag = agingRow[0];
    const totalReceivable   = Number(ag.total_receivable ?? 0);
    const overdueReceivable = Number(ag.overdue_receivable ?? 0);
    const notDueReceivable  = Number(ag.not_due_receivable ?? 0);
    const openInvoiceCount  = Number(ag.open_count ?? 0);
    const earliestOverdueDate = ag.earliest_overdue_date
      ? String(ag.earliest_overdue_date).slice(0, 10) : null;

    // 逾期天数（最早逾期单距今天数）
    let overdueDays = 0;
    if (earliestOverdueDate) {
      const ms = Date.now() - new Date(earliestOverdueDate).getTime();
      overdueDays = Math.max(0, Math.floor(ms / 86_400_000));
    }

    const creditLimit   = Number(cust.credit_limit ?? 0);
    const creditUsed    = totalReceivable; // 实时应收 = 已用信用
    const creditAvail   = Math.max(0, creditLimit - creditUsed);
    const paymentTerms  = Number(cust.payment_terms ?? 0);
    const lastReceiptDate = receiptRow[0]?.last_receipt_date
      ? String(receiptRow[0].last_receipt_date).slice(0, 10) : null;

    return {
      customerCode:      cust.customer_no ?? customerCode,
      customerName:      cust.customer_name,
      companyCode:       cust.company_code,
      creditLimit,
      creditUsed,
      creditAvailable:   creditAvail,
      paymentTerms,
      riskLevel:         cust.risk_level,
      creditStatus:      cust.credit_status ?? 'NORMAL',
      status:            cust.status,
      totalReceivable,
      overdueReceivable,
      notDueReceivable,
      openInvoiceCount,
      earliestOverdueDate,
      overdueDays,
      lastReceiptDate,
      snapshotAt:        new Date().toISOString(),
    };
  }

  // ── 2. calculateCreditUsage ───────────────────────────────────────────────

  /**
   * 计算客户当前 credit_used（= 实时应收余额合计）
   * 不写库，只返回数值
   */
  async calculateCreditUsage(customerCode: string): Promise<number> {
    const rows = await this.ds.query(
      `SELECT COALESCE(SUM(balance_amount_original), 0) AS credit_used
       FROM fin_ar_invoices
       WHERE customer_code = $1
         AND status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')`,
      [customerCode],
    );
    return Number(rows[0]?.credit_used ?? 0);
  }

  // ── 3. evaluateCreditStatus ───────────────────────────────────────────────

  /**
   * 评估客户信用状态（不写库，纯计算）
   *
   * 规则优先级（从高到低）：
   *   FROZEN    — risk_level=BLACKLIST 或 status=FROZEN
   *   OVERDUE   — overdueDays > payment_terms（且 payment_terms > 0）
   *   OVER_LIMIT — totalReceivable > credit_limit（且 credit_limit > 0）
   *   WARNING   — overdueReceivable > 0
   *   NORMAL    — 其他
   */
  async evaluateCreditStatus(customerCode: string, companyCode: string): Promise<CreditEvaluation> {
    const snap = await this.getCustomerArSnapshot(customerCode, companyCode);

    let creditStatus: CreditEvaluation['creditStatus'] = 'NORMAL';
    let allowOrder      = true;
    let requireApproval = false;
    let creditWarning   = false;
    let reason          = '信用正常';

    // 黑名单或已冻结 → 最高优先级
    if (snap.riskLevel === 'BLACKLIST' || snap.status === 'BLACKLIST') {
      creditStatus    = 'FROZEN';
      allowOrder      = false;
      requireApproval = false;
      reason = '客户已列入黑名单，禁止下单';
    } else if (snap.status === 'FROZEN') {
      creditStatus    = 'FROZEN';
      allowOrder      = false;
      requireApproval = false;
      reason = '客户账户已冻结，禁止下单';
    }
    // 逾期 > 账期
    else if (snap.paymentTerms > 0 && snap.overdueDays > snap.paymentTerms) {
      creditStatus    = 'OVERDUE';
      allowOrder      = true;          // 允许提交，但必须走审批
      requireApproval = true;
      reason = `客户逾期 ${snap.overdueDays} 天，已超账期 ${snap.paymentTerms} 天`;
    }
    // 超信用额度
    else if (snap.creditLimit > 0 && snap.totalReceivable > snap.creditLimit) {
      creditStatus    = 'OVER_LIMIT';
      allowOrder      = true;          // 允许提交，但必须走审批
      requireApproval = true;
      reason = `客户应收 ${snap.totalReceivable.toFixed(2)} 超过信用额度 ${snap.creditLimit.toFixed(2)}`;
    }
    // 有逾期未收（但未超账期）
    else if (snap.overdueReceivable > 0) {
      creditStatus  = 'WARNING';
      allowOrder    = true;
      creditWarning = true;
      reason = `客户存在逾期未收款 ${snap.overdueReceivable.toFixed(2)}，请关注`;
    }

    return { creditStatus, allowOrder, requireApproval, creditWarning, snapshot: snap, reason };
  }

  // ── 4. refreshCustomerCredit ──────────────────────────────────────────────

  /**
   * 重算并更新客户信用字段（credit_used / credit_status / last_overdue_at）
   * 由 Scheduler 每日调用，或手工触发
   */
  async refreshCustomerCredit(customerId: string, mgr?: EntityManager): Promise<void> {
    const executor = mgr ?? this.ds;
    const rows = await executor.query(
      `SELECT customer_no, legacy_customer_code, company_code, credit_limit, payment_terms,
              risk_level, status FROM sal_customers WHERE id = $1`,
      [customerId],
    );
    if (!rows?.length) return;
    const cust = rows[0];
    const arKey = cust.customer_no ?? cust.legacy_customer_code;

    // 重算 AR
    const agRows = await executor.query(
      `SELECT
         COALESCE(SUM(balance_amount_original) FILTER (
           WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')
         ), 0) AS credit_used,
         COALESCE(SUM(balance_amount_original) FILTER (
           WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')
             AND due_date < CURRENT_DATE
         ), 0) AS overdue_amount,
         MIN(due_date) FILTER (
           WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')
             AND due_date < CURRENT_DATE
         ) AS earliest_overdue_date
       FROM fin_ar_invoices
       WHERE customer_code = $1`,
      [arKey],
    );
    const ag = agRows[0];
    const creditUsed      = Number(ag.credit_used ?? 0);
    const overdueAmount   = Number(ag.overdue_amount ?? 0);
    const earliestOverdue = ag.earliest_overdue_date ?? null;

    let overdueDays = 0;
    if (earliestOverdue) {
      const ms = Date.now() - new Date(earliestOverdue).getTime();
      overdueDays = Math.max(0, Math.floor(ms / 86_400_000));
    }

    const creditLimit   = Number(cust.credit_limit ?? 0);
    const paymentTerms  = Number(cust.payment_terms ?? 0);

    // 评估信用状态
    let creditStatus = 'NORMAL';
    if (cust.risk_level === 'BLACKLIST' || cust.status === 'BLACKLIST') {
      creditStatus = 'FROZEN';
    } else if (cust.status === 'FROZEN') {
      creditStatus = 'FROZEN';
    } else if (paymentTerms > 0 && overdueDays > paymentTerms) {
      creditStatus = 'OVERDUE';
    } else if (creditLimit > 0 && creditUsed > creditLimit) {
      creditStatus = 'OVER_LIMIT';
    } else if (overdueAmount > 0) {
      creditStatus = 'WARNING';
    }

    const lastOverdueAt = earliestOverdue ? new Date(earliestOverdue) : null;

    await executor.query(
      `UPDATE sal_customers
       SET credit_used     = $1,
           credit_status   = $2,
           last_overdue_at = $3,
           updated_at      = NOW()
       WHERE id = $4`,
      [creditUsed, creditStatus, lastOverdueAt, customerId],
    );

    this.logger.debug(`[CreditRefresh] 客户 ${customerId} — creditUsed=${creditUsed}, creditStatus=${creditStatus}`);
  }

  // ── 5. autoFreezeCustomer ─────────────────────────────────────────────────

  /**
   * 严重逾期自动冻结
   * 规则：overdueDays > payment_terms * 2 且 overdueAmount > 0
   */
  async autoFreezeCustomer(customerId: string): Promise<boolean> {
    const rows = await this.ds.query(
      `SELECT customer_no, customer_name, company_code, payment_terms, status, auto_frozen, credit_status
       FROM sal_customers WHERE id = $1`,
      [customerId],
    );
    if (!rows?.length) return false;
    const cust = rows[0];

    // 已经冻结/黑名单 → 跳过
    if (['FROZEN', 'BLACKLIST'].includes(cust.status)) return false;

    const arKey = cust.customer_no;
    const paymentTerms = Number(cust.payment_terms ?? 0);

    // 逾期超过 payment_terms * 2 天
    const agRows = await this.ds.query(
      `SELECT
         MIN(due_date) FILTER (
           WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')
             AND due_date < CURRENT_DATE
         ) AS earliest_overdue,
         COALESCE(SUM(balance_amount_original) FILTER (
           WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')
             AND due_date < CURRENT_DATE
         ), 0) AS overdue_amount
       FROM fin_ar_invoices
       WHERE customer_code = $1`,
      [arKey],
    );
    const ag = agRows[0];
    const overdueAmount = Number(ag.overdue_amount ?? 0);
    if (overdueAmount <= 0 || !ag.earliest_overdue) return false;

    const ms = Date.now() - new Date(ag.earliest_overdue).getTime();
    const overdueDays = Math.floor(ms / 86_400_000);
    // [Phase R2 — Config Governance] 冻结阈值从 sys_configs 读取，避免硬编码
    const autoFreezeDays = await this._cfgInt('credit.auto_freeze_days', 60);
    const freezeMultiplier = await this._cfgInt('credit.freeze_multiplier', 2);
    const threshold = paymentTerms > 0 ? paymentTerms * freezeMultiplier : autoFreezeDays;

    if (overdueDays <= threshold) return false;

    // 执行自动冻结
    await this.ds.query(
      `UPDATE sal_customers
       SET status       = 'FROZEN',
           auto_frozen  = TRUE,
           credit_status = 'FROZEN',
           updated_at   = NOW()
       WHERE id = $1`,
      [customerId],
    );

    // 写系统通知
    await this.ds.query(
      `INSERT INTO sys_notifications
         (notification_type, title, content, company_code, status, created_at)
       VALUES ($1, $2, $3, $4, 'UNREAD', NOW())
       ON CONFLICT DO NOTHING`,
      [
        'CUSTOMER_FROZEN',
        `客户自动冻结：${cust.customer_name}`,
        `客户「${cust.customer_name}」逾期 ${overdueDays} 天（超账期 ${threshold} 天阈值），系统已自动冻结，待财务处理。`,
        cust.company_code,
      ],
    ).catch(e => this.logger.warn(`写通知失败: ${e.message}`));

    this.logger.warn(`[AutoFreeze] 客户 ${cust.customer_name}(${customerId}) 自动冻结 — 逾期${overdueDays}天`);
    return true;
  }

  // ── 6. 逾期客户列表 ───────────────────────────────────────────────────────

  async listOverdueCustomers(companyCode?: string, page = 1, limit = 50) {
    const user = this.getScope();
    const params: any[] = [];
    const where: string[] = [`c.credit_status IN ('OVERDUE','WARNING','OVER_LIMIT')`];

    if (!user.scopeAll) {
      if (user.companyCodes.length > 0) {
        params.push(user.companyCodes);
        where.push(`c.company_code = ANY($${params.length})`);
      } else {
        where.push('1=0');  // 未配置数据范围 → 拒绝访问
      }
    }
    if (companyCode) {
      params.push(companyCode);
      where.push(`c.company_code = $${params.length}`);
    }

    const offset = (page - 1) * limit;
    const wc = where.join(' AND ');

    const [countRow, rows] = await Promise.all([
      this.ds.query(`SELECT COUNT(*) AS total FROM sal_customers c WHERE ${wc}`, params),
      this.ds.query(
        `SELECT
           c.id, c.customer_no, c.customer_name, c.company_code,
           c.credit_limit, c.credit_used, c.payment_terms,
           c.risk_level, c.status, c.credit_status, c.last_overdue_at,
           COALESCE(ar.overdue_amount,0) AS overdue_amount,
           COALESCE(ar.earliest_overdue,'') AS earliest_overdue_date,
           CASE
             WHEN ar.earliest_overdue IS NOT NULL
             THEN EXTRACT(DAY FROM NOW() - ar.earliest_overdue::timestamptz)::int
             ELSE 0
           END AS overdue_days
         FROM sal_customers c
         LEFT JOIN LATERAL (
           SELECT
             COALESCE(SUM(balance_amount_original) FILTER (
               WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF') AND due_date < CURRENT_DATE
             ), 0) AS overdue_amount,
             MIN(due_date) FILTER (
               WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF') AND due_date < CURRENT_DATE
             ) AS earliest_overdue
           FROM fin_ar_invoices
           WHERE customer_code = c.customer_no
         ) ar ON TRUE
         WHERE ${wc}
         ORDER BY overdue_days DESC, c.credit_status DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    return { data: rows, total: Number(countRow[0].total), page, limit };
  }

  // ── 7. 高风险客户列表 ─────────────────────────────────────────────────────

  async listHighRiskCustomers(companyCode?: string, page = 1, limit = 50) {
    const user = this.getScope();
    const params: any[] = [];
    const where: string[] = [`c.risk_level IN ('WATCH','HIGH','BLACKLIST')`];

    if (!user.scopeAll) {
      if (user.companyCodes.length > 0) {
        params.push(user.companyCodes);
        where.push(`c.company_code = ANY($${params.length})`);
      } else {
        where.push('1=0');  // 未配置数据范围 → 拒绝访问
      }
    }
    if (companyCode) {
      params.push(companyCode);
      where.push(`c.company_code = $${params.length}`);
    }

    const offset = (page - 1) * limit;
    const wc = where.join(' AND ');

    const [countRow, rows] = await Promise.all([
      this.ds.query(`SELECT COUNT(*) AS total FROM sal_customers c WHERE ${wc}`, params),
      this.ds.query(
        `SELECT c.*, COALESCE(ar.total_receivable,0) AS total_receivable
         FROM sal_customers c
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(balance_amount_original) FILTER (
             WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')
           ), 0) AS total_receivable
           FROM fin_ar_invoices WHERE customer_code = c.customer_no
         ) ar ON TRUE
         WHERE ${wc}
         ORDER BY c.risk_level DESC, ar.total_receivable DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    return { data: rows, total: Number(countRow[0].total), page, limit };
  }

  // ── 8. AR 账龄分析（单个客户）────────────────────────────────────────────

  async getArAging(customerId: string) {
    const cust = await this.getCustomerRow(customerId);
    const arKey = cust.customer_no ?? cust.legacy_customer_code;

    const rows = await this.ds.query(
      `SELECT
         ar_no, source_no, due_date,
         amount_original, balance_amount_original, received_amount_original,
         status, collection_status, currency_code, created_at,
         CASE
           WHEN due_date < CURRENT_DATE
             AND status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')
           THEN EXTRACT(DAY FROM NOW() - due_date::timestamptz)::int
           ELSE 0
         END AS overdue_days
       FROM fin_ar_invoices
       WHERE customer_code = $1
       ORDER BY due_date ASC NULLS LAST`,
      [arKey],
    );

    // 账龄分桶
    const buckets = {
      notDue:    { label: '未到期',   amount: 0, count: 0 },
      d0_30:     { label: '逾期1-30天',  amount: 0, count: 0 },
      d31_60:    { label: '逾期31-60天', amount: 0, count: 0 },
      d61_90:    { label: '逾期61-90天', amount: 0, count: 0 },
      d91_180:   { label: '逾期91-180天',amount: 0, count: 0 },
      d181plus:  { label: '逾期180天+',  amount: 0, count: 0 },
    };

    for (const r of rows) {
      if (['RECEIVED','CANCELLED','WRITTEN_OFF'].includes(r.status)) continue;
      const bal = Number(r.balance_amount_original ?? 0);
      const days = Number(r.overdue_days ?? 0);
      if (days === 0)       { buckets.notDue.amount   += bal; buckets.notDue.count++;   }
      else if (days <= 30)  { buckets.d0_30.amount    += bal; buckets.d0_30.count++;    }
      else if (days <= 60)  { buckets.d31_60.amount   += bal; buckets.d31_60.count++;   }
      else if (days <= 90)  { buckets.d61_90.amount   += bal; buckets.d61_90.count++;   }
      else if (days <= 180) { buckets.d91_180.amount  += bal; buckets.d91_180.count++;  }
      else                  { buckets.d181plus.amount += bal; buckets.d181plus.count++; }
    }

    return {
      customerId:   cust.id,
      customerName: cust.customer_name,
      companyCode:  cust.company_code,
      invoices:     rows,
      aging:        Object.entries(buckets).map(([key, val]) => ({ key, ...val })),
    };
  }

  // ── 9. 手动解冻 ───────────────────────────────────────────────────────────

  async unfreezeCustomer(customerId: string): Promise<any> {
    const cust = await this.getCustomerRow(customerId);
    if (!['FROZEN'].includes(cust.status)) {
      return cust; // 不是冻结状态，直接返回
    }

    const result = await this.ds.query(
      `UPDATE sal_customers
       SET status      = 'ACTIVE',
           auto_frozen = FALSE,
           updated_at  = NOW()
       WHERE id = $1 RETURNING *`,
      [customerId],
    );

    // 刷新信用状态
    await this.refreshCustomerCredit(customerId);
    this.logger.log(`[Unfreeze] 客户 ${cust.customer_name}(${customerId}) 已手动解冻`);
    return result[0];
  }

  // ── Config Governance helpers ─────────────────────────────────────────────
  /**
   * [Phase R2] 从 sys_configs 读取整数配置，失败时返回 defaultVal。
   * 不因配置缺失/格式错误中断主业务。
   */
  private async _cfgInt(key: string, defaultVal: number): Promise<number> {
    try {
      const rows: Array<{ config_value: string }> = await this.ds.query(
        `SELECT config_value FROM sys_configs WHERE config_key = $1`, [key],
      );
      const v = rows[0]?.config_value;
      if (v == null) return defaultVal;
      const n = parseInt(v, 10);
      return isNaN(n) ? defaultVal : n;
    } catch {
      return defaultVal;
    }
  }
}
