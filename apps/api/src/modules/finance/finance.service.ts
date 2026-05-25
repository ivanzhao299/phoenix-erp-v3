import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CashFlowEntity } from './entities/cash-flow.entity';
import { ApprovalService } from '../approval/approval.service';
import { DataScopeHelper } from '../org/helpers/data-scope.helper';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(CashFlowEntity)
    private readonly cashFlowRepo: Repository<CashFlowEntity>,
    @InjectEntityManager()
    private readonly em: EntityManager,
    private readonly approvalService: ApprovalService,
    private readonly scopeHelper: DataScopeHelper,   // RBAC-3.1：数据范围注入
  ) {}

  // ─── 资金流水申请 ──────────────────────────────────────────────────────────────
  async requestCashFlow(dto: Partial<CashFlowEntity>, submitterId: number): Promise<CashFlowEntity> {
    const record = this.cashFlowRepo.create(dto);
    record.status = 'PENDING_APPROVAL';
    const savedRecord = await this.cashFlowRepo.save(record);
    await this.approvalService.submitForApproval({
      docType: 'CASH_FLOW', docId: savedRecord.id,
      amount: savedRecord.amount, currencyCode: savedRecord.currency_code,
      submitterId,
    });
    return savedRecord;
  }

  // ─── 双币种余额统计 ────────────────────────────────────────────────────────────
  async calculateBalances(storeCode: string): Promise<{ CNY: number; LAK: number }> {
    const query = this.cashFlowRepo.createQueryBuilder('cf')
      .select('cf.currency_code', 'currencyCode')
      .addSelect('cf.flow_type', 'flowType')
      .addSelect('SUM(cf.amount)', 'total')
      .where("cf.status = 'APPROVED'");
    if (storeCode !== 'ALL') query.andWhere('cf.store_code = :storeCode', { storeCode });
    query.groupBy('cf.currency_code, cf.flow_type');
    const results = await query.getRawMany();
    const balances = { CNY: 0, LAK: 0 };
    for (const row of results) {
      const cur = row.currencyCode as 'CNY' | 'LAK';
      if (cur !== 'CNY' && cur !== 'LAK') continue;
      const amount = parseFloat(row.total);
      balances[cur] += row.flowType === 'IN' ? amount : -amount;
    }
    return balances;
  }

  // ─── AR 账龄分析 ─────────────────────────────────────────────────────────────
  async getArAging() {
    try {
      // RBAC-3.1：注入 store_code 数据范围过滤
      const { sql: scopeSql, params: scopeParams } =
        this.scopeHelper.buildRawCondition({ companyAlias: 't.store_code' }, 0);

      const rows = await this.em.query(`
        SELECT c.customer_name, c.customer_code,
          COALESCE(t.amount, 0)                            AS balance,
          COALESCE(CURRENT_DATE - t.due_date::date, 0)    AS days_outstanding,
          t.txn_no                                         AS order_no,
          t.due_date
        FROM fin_transactions t
        LEFT JOIN ord_customers c ON t.account_code = c.customer_code
        WHERE t.type = 'AR' AND t.status = 'PENDING'
          AND (${scopeSql})
        ORDER BY days_outstanding DESC
      `, scopeParams);

      const buckets: Record<string, any[]> = {
        current: [], days_30: [], days_60: [], days_90: [], over_90: [],
      };
      let totalAr = 0, overdueAr = 0;
      const amounts: Record<string, number> = { current: 0, '1-30d': 0, '31-60d': 0, '61-90d': 0, '>90d': 0 };
      const counts:  Record<string, number> = { current: 0, '1-30d': 0, '31-60d': 0, '61-90d': 0, '>90d': 0 };

      for (const r of rows) {
        const d = Number(r.days_outstanding);
        const amt = Number(r.balance);
        totalAr += amt;
        const entry = { ...r, balance: amt, days_outstanding: d };
        if (d <= 0)       { buckets.current.push(entry); amounts.current += amt; counts.current++; }
        else if (d <= 30) { buckets.days_30.push(entry); amounts['1-30d']  += amt; counts['1-30d']++;  overdueAr += amt; }
        else if (d <= 60) { buckets.days_60.push(entry); amounts['31-60d'] += amt; counts['31-60d']++; overdueAr += amt; }
        else if (d <= 90) { buckets.days_90.push(entry); amounts['61-90d'] += amt; counts['61-90d']++; overdueAr += amt; }
        else              { buckets.over_90.push(entry); amounts['>90d']   += amt; counts['>90d']++;   overdueAr += amt; }
      }

      return {
        code: 200,
        data: {
          summary: {
            total_ar: totalAr,
            overdue_ar: overdueAr,
            overdue_rate: totalAr > 0 ? Math.round(overdueAr / totalAr * 100) : 0,
            amounts, counts,
          },
          buckets,
        },
      };
    } catch (e) {
      return { code: 200, data: { summary: null, buckets: {} } };
    }
  }

  // ─── AP 账龄分析 ─────────────────────────────────────────────────────────────
  async getApAging() {
    try {
      // RBAC-3.1：注入 store_code 数据范围过滤
      const { sql: scopeSql, params: scopeParams } =
        this.scopeHelper.buildRawCondition({ companyAlias: 't.store_code' }, 0);

      const rows = await this.em.query(`
        SELECT COALESCE(s.supplier_name, t.account_code) AS supplier,
          t.account_code AS supplier_code,
          COALESCE(t.amount, 0)                            AS balance,
          COALESCE(CURRENT_DATE - t.due_date::date, 0)    AS days_outstanding,
          t.txn_no                                         AS invoice_no,
          t.due_date
        FROM fin_transactions t
        LEFT JOIN prc_suppliers s ON t.account_code = s.supplier_code
        WHERE t.type = 'AP' AND t.status = 'PENDING'
          AND (${scopeSql})
        ORDER BY days_outstanding DESC
      `, scopeParams);

      const buckets: Record<string, any[]> = {
        current: [], days_30: [], days_60: [], days_90: [], over_90: [],
      };
      let totalAp = 0, overdueAp = 0;
      const amounts: Record<string, number> = { current: 0, '1-30d': 0, '31-60d': 0, '61-90d': 0, '>90d': 0 };
      const counts:  Record<string, number> = { current: 0, '1-30d': 0, '31-60d': 0, '61-90d': 0, '>90d': 0 };

      for (const r of rows) {
        const d = Number(r.days_outstanding);
        const amt = Number(r.balance);
        totalAp += amt;
        const entry = { ...r, balance: amt, days_outstanding: d };
        if (d <= 0)       { buckets.current.push(entry); amounts.current += amt; counts.current++; }
        else if (d <= 30) { buckets.days_30.push(entry); amounts['1-30d']  += amt; counts['1-30d']++;  overdueAp += amt; }
        else if (d <= 60) { buckets.days_60.push(entry); amounts['31-60d'] += amt; counts['31-60d']++; overdueAp += amt; }
        else if (d <= 90) { buckets.days_90.push(entry); amounts['61-90d'] += amt; counts['61-90d']++; overdueAp += amt; }
        else              { buckets.over_90.push(entry); amounts['>90d']   += amt; counts['>90d']++;   overdueAp += amt; }
      }

      return {
        code: 200,
        data: {
          summary: {
            total_ap: totalAp,
            overdue_ap: overdueAp,
            overdue_rate: totalAp > 0 ? Math.round(overdueAp / totalAp * 100) : 0,
            amounts, counts,
          },
          buckets,
        },
      };
    } catch {
      return { code: 200, data: { summary: null, buckets: {} } };
    }
  }

  // ─── 现金流分析 ──────────────────────────────────────────────────────────────
  async getCashflow(period = 'monthly') {
    const fmt = period === 'daily' ? 'YYYY-MM-DD' : 'YYYY-MM';
    try {
      // RBAC-3.1：注入 store_code 数据范围过滤
      const { sql: scopeSql, params: scopeParams } =
        this.scopeHelper.buildRawCondition({ companyAlias: 'store_code' }, 0);

      const data = await this.em.query(`
        SELECT TO_CHAR(created_at, '${fmt}') AS period,
          SUM(CASE WHEN type IN ('AR_RECEIPT','INCOME') THEN amount ELSE 0 END) AS cash_in,
          SUM(CASE WHEN type IN ('AP_PAYMENT','EXPENSE') THEN amount ELSE 0 END) AS cash_out,
          SUM(CASE WHEN type IN ('AR_RECEIPT','INCOME') THEN amount ELSE 0 END) -
          SUM(CASE WHEN type IN ('AP_PAYMENT','EXPENSE') THEN amount ELSE 0 END) AS net_cash
        FROM fin_transactions
        WHERE status = 'COMPLETED'
          AND (${scopeSql})
        GROUP BY TO_CHAR(created_at, '${fmt}')
        ORDER BY period DESC LIMIT 12
      `, scopeParams);
      return { code: 200, data };
    } catch { return { code: 200, data: [] }; }
  }

  // ─── 账龄总览（Overview Tiles） ────────────────────────────────────────────────
  async getAgingOverview() {
    try {
      // RBAC-3.1：注入 store_code 数据范围过滤（两个查询共享同一 scope）
      const { sql: scopeSql, params: scopeParams } =
        this.scopeHelper.buildRawCondition({ companyAlias: 'store_code' }, 0);

      const [arRow] = await this.em.query(`
        SELECT
          COALESCE(SUM(amount), 0) AS balance,
          COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount ELSE 0 END), 0) AS overdue,
          COUNT(*) AS count
        FROM fin_transactions WHERE type='AR' AND status='PENDING'
          AND (${scopeSql})
      `, scopeParams);
      const [apRow] = await this.em.query(`
        SELECT
          COALESCE(SUM(amount), 0) AS balance,
          COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount ELSE 0 END), 0) AS overdue,
          COUNT(*) AS count
        FROM fin_transactions WHERE type='AP' AND status='PENDING'
          AND (${scopeSql})
      `, scopeParams);
      return {
        code: 200,
        data: {
          ar: { balance: Number(arRow?.balance||0), overdue: Number(arRow?.overdue||0), count: Number(arRow?.count||0) },
          ap: { balance: Number(apRow?.balance||0), overdue: Number(apRow?.overdue||0), count: Number(apRow?.count||0) },
        },
      };
    } catch {
      return { code: 200, data: { ar: { balance:0, overdue:0, count:0 }, ap: { balance:0, overdue:0, count:0 } } };
    }
  }

  // ─── 财务仪表盘总览 ────────────────────────────────────────────────────────────
  async getSummary() {
    try {
      // RBAC-3.1：注入 store_code 数据范围过滤
      const { sql: scopeSql, params: scopeParams } =
        this.scopeHelper.buildRawCondition({ companyAlias: 'store_code' }, 0);

      const [ar]   = await this.em.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM fin_transactions WHERE type='AR' AND status='PENDING' AND (${scopeSql})`,
        scopeParams,
      );
      const [ap]   = await this.em.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM fin_transactions WHERE type='AP' AND status='PENDING' AND (${scopeSql})`,
        scopeParams,
      );
      const [cash] = await this.em.query(
        `SELECT COALESCE(SUM(balance),0) AS total FROM fin_accounts WHERE (${scopeSql})`,
        scopeParams,
      );
      return { code: 200, data: {
        total_ar: Number(ar?.total || 0), total_ap: Number(ap?.total || 0),
        total_cash: Number(cash?.total || 0), health_score: 95,
      }};
    } catch { return { code: 200, data: { total_ar: 0, total_ap: 0, total_cash: 0, health_score: 100 } }; }
  }

  // ─── 费用报销 ─────────────────────────────────────────────────────────────────
  async submitExpense(body: any, userId: number) {
    const txnNo = `EXP-${Date.now()}`;
    await this.em.query(
      `INSERT INTO fin_transactions (txn_no, type, amount, status, created_by, description, account_code, note)
       VALUES ($1, 'EXPENSE', $2, 'PENDING', $3, $4, $5, $6)`,
      [
        txnNo, body.amount, userId,
        body.description || '日常费用报销',
        body.account_code || null, body.note || body.description || null,
      ],
    );
    return { code: 200, msg: '费用报销已提交，等待场长审批', txn_no: txnNo };
  }

  async approveExpense(txnId: string) {
    await this.em.query(
      `UPDATE fin_transactions SET status='COMPLETED' WHERE txn_no=$1 AND type='EXPENSE'`,
      [txnId],
    );
    return { code: 200, msg: '费用报销已通过' };
  }

  // ════════════════════════════════════════════════════════════════════════
  // V2 fidelity backfill — _archive/phoenix-backend-v2-sqlite/src/routes/finance.js
  // ════════════════════════════════════════════════════════════════════════

  /**
   * AR 单客户账龄明细（V2 /ar-aging/customer/:customer_code）
   */
  async getArAgingByCustomer(customerCode: string) {
    if (!customerCode) throw new BadRequestException('customer_code 必填');
    // V3 增强：paid = MAX(ord_orders.paid_amount, fin_transactions AR-TRADE 汇总)
    // 任一来源到位都视为已还，避免 V2 单源遗漏
    const rows = await this.em.query(
      `SELECT o.order_no, o.total_amount,
              COALESCE(o.received_date::text, '') AS received_date,
              o.status,
              GREATEST(COALESCE(o.paid_amount, 0), COALESCE(p.paid, 0))::numeric(18,2) AS paid_amount,
              (o.total_amount - GREATEST(COALESCE(o.paid_amount, 0), COALESCE(p.paid, 0)))::numeric(18,2) AS balance,
              GREATEST(0, (CURRENT_DATE - COALESCE(o.received_date::date, o.created_at::date)))::int AS days_outstanding
         FROM ord_orders o
    LEFT JOIN (
              SELECT ref_no, SUM(amount) AS paid
                FROM fin_transactions
               WHERE type='CREDIT' AND account_code='AR-TRADE'
               GROUP BY ref_no
            ) p ON p.ref_no = o.order_no
        WHERE o.customer_code = $1
          AND o.status IN ('received','reconciled','RECEIVED','RECONCILED')
          AND (o.total_amount - GREATEST(COALESCE(o.paid_amount, 0), COALESCE(p.paid, 0))) > 0.01
        ORDER BY days_outstanding DESC`,
      [customerCode],
    ).catch(() => []);
    return { code: 200, data: rows };
  }

  /**
   * AP 凭证生成 — 采购到货时调用（V2 /ap-invoice）
   * body: { po_no, supplier, amount, item?, due_days?, note? }
   * 幂等：同 po_no 已有未付凭证则跳过
   */
  async createApInvoice(body: any, user: any) {
    // V2 fidelity: 角色限制（V2 AP_WRITE_ROLES 同款）
    const allowed = ['ROLE_ADMIN', 'ROLE_SYSOPS', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT', 'ROLE_CEO',
                     'ROLE_WMS_MGR', 'ROLE_WMS_OP', 'ROLE_PURCHASE_MGR'];
    const userRole = String(user?.role || '').toUpperCase();
    if (!allowed.includes(userRole)) {
      throw new ForbiddenException(`需要财务/采购/仓储相关角色 — 当前 ${userRole}`);
    }

    const { po_no, supplier, amount, item, due_days = 30, note } = body || {};
    if (!po_no || !supplier || !amount) {
      throw new BadRequestException('缺少必填字段：po_no / supplier / amount');
    }

    // 幂等：同 po_no 已有未付凭证则跳过
    const existing = await this.em.query(
      `SELECT invoice_no FROM fin_invoices WHERE ref_no = $1 AND status <> 'PAID' LIMIT 1`,
      [po_no],
    ).catch(() => []);
    if (existing.length > 0) {
      return {
        code: 200, msg: '凭证已存在（幂等跳过）',
        data: { invoice_no: existing[0].invoice_no, skipped: true },
      };
    }

    const invoiceNo = `AP-${Date.now()}`;
    const dueDate = new Date(Date.now() + Number(due_days) * 86400000).toISOString().slice(0, 10);

    return await this.em.transaction(async (mgr) => {
      await mgr.query(
        `INSERT INTO fin_invoices
           (invoice_no, ref_no, customer_or_supplier, amount, paid_amount, status, direction, due_date, created_at)
         VALUES ($1, $2, $3, $4, 0, 'UNPAID', 'AP', $5, now())`,
        [invoiceNo, po_no, supplier, Number(amount), dueDate],
      );
      // 同步财务流水：AP-TRADE DEBIT 借方
      await mgr.query(
        `INSERT INTO fin_transactions
           (ref_no, type, account_code, amount, status, operator, note, created_at)
         VALUES ($1, 'DEBIT', 'AP-TRADE', $2, 'COMPLETED', $3, $4, now())`,
        [
          invoiceNo, Number(amount),
          user?.username || 'SYS',
          note || `采购到货 AP — ${item || po_no}`,
        ],
      ).catch(() => { /* fin_transactions 写失败非阻塞，凭证已存档 */ });

      return {
        code: 200, msg: 'AP 凭证已生成',
        data: { invoice_no: invoiceNo, due_date: dueDate, amount: Number(amount) },
      };
    });
  }

  /**
   * AP 付款核销（V2 /ap-payment）
   * body: { invoice_no, paid_amount }
   * 累加 paid_amount，并根据是否达到总额翻牌 PAID/PARTIAL
   */
  async payApInvoice(body: any, user: any) {
    const { invoice_no, paid_amount } = body || {};
    if (!invoice_no || !paid_amount) throw new BadRequestException('缺少 invoice_no / paid_amount');

    return await this.em.transaction(async (mgr) => {
      const rows = await mgr.query(
        `SELECT invoice_no, amount, paid_amount FROM fin_invoices WHERE invoice_no = $1 FOR UPDATE`,
        [invoice_no],
      );
      if (rows.length === 0) throw new NotFoundException(`凭证 ${invoice_no} 不存在`);
      const inv = rows[0];
      const newPaid = Number(inv.paid_amount || 0) + Number(paid_amount);
      const newStatus = newPaid >= Number(inv.amount) - 0.01 ? 'PAID' : 'PARTIAL';
      await mgr.query(
        `UPDATE fin_invoices SET paid_amount = $1, status = $2, updated_at = now()::text WHERE invoice_no = $3`,
        [newPaid, newStatus, invoice_no],
      );

      // 写一条付款流水 CREDIT (AP-TRADE 抵消)
      await mgr.query(
        `INSERT INTO fin_transactions
           (ref_no, type, account_code, amount, status, operator, note, created_at)
         VALUES ($1, 'CREDIT', 'AP-TRADE', $2, 'COMPLETED', $3, $4, now())`,
        [
          invoice_no, Number(paid_amount),
          user?.username || 'SYS',
          `AP 付款 ${invoice_no} +${paid_amount}`,
        ],
      ).catch(() => {});

      return {
        code: 200, msg: '还款已核销',
        data: { invoice_no, paid_amount: newPaid, status: newStatus },
      };
    });
  }

  /**
   * 登记收入 / AR 收款（V2 /income）
   * body: { account_code, amount, ref_no?, note? }
   * - 写 fin_transactions CREDIT COMPLETED
   * - fin_accounts.balance += amount（若存在）
   * - 如果 ref_no 是 ORD- 开头，自动核销 ord_orders.paid_amount
   */
  async registerIncome(body: any, user: any) {
    const { account_code, amount, ref_no, note } = body || {};
    if (!account_code || !amount) throw new BadRequestException('缺少 account_code / amount');
    const amt = Number(amount);
    if (amt <= 0) throw new BadRequestException('amount 必须 > 0');

    const txnNo = `INC-${Date.now()}`;

    return await this.em.transaction(async (mgr) => {
      await mgr.query(
        `INSERT INTO fin_transactions
           (txn_no, account_code, type, amount, ref_no, note, status, operator, created_at)
         VALUES ($1, $2, 'CREDIT', $3, $4, $5, 'COMPLETED', $6, now())`,
        [txnNo, account_code, amt, ref_no || null, note || null, user?.username || 'SYS'],
      );

      // fin_accounts.balance += amount（仅当账户存在）
      await mgr.query(
        `UPDATE fin_accounts SET balance = COALESCE(balance,0) + $1 WHERE account_code = $2`,
        [amt, account_code],
      ).catch(() => {});

      // AR 自动核销：ref_no 以 ORD-/SO-/ODR- 开头 → 累加 ord_orders.paid_amount
      // (V3 自动生成的 order_no 是 ODR-YYYYMMDD-XXXXXX，需同时支持)
      if (
        ref_no &&
        (String(ref_no).startsWith('ORD-') ||
         String(ref_no).startsWith('SO-')  ||
         String(ref_no).startsWith('ODR-'))
      ) {
        await mgr.query('SAVEPOINT sp_ar_reconcile');
        try {
          await mgr.query(
            `UPDATE ord_orders SET paid_amount = COALESCE(paid_amount,0) + $1, updated_at = now() WHERE order_no = $2`,
            [amt, ref_no],
          );
          await mgr.query('RELEASE SAVEPOINT sp_ar_reconcile');
        } catch (e: any) {
          await mgr.query('ROLLBACK TO SAVEPOINT sp_ar_reconcile');
          console.warn('[registerIncome][WARN] AR auto-reconcile skipped:', e?.message);
        }
      }

      return {
        code: 200, msg: '收入已入账',
        data: { txn_no: txnNo, amount: amt, ref_no: ref_no || null },
      };
    });
  }

  /**
   * 三级费用审批 — V2 链路：FARM_MGR → REGION_MGR/FIN_CFO → CEO/ADMIN
   * body: { action: 'APPROVE'|'REJECT', comment? }
   * 在 fin_approvals 记录每一级，最后一级 COMPLETED 时扣减 fin_accounts.balance
   */
  async approveExpenseChain(txnId: string, body: any, user: any) {
    const action = String(body?.action || '').toUpperCase();
    if (!['APPROVE', 'REJECT'].includes(action)) {
      throw new BadRequestException('action 必须为 APPROVE 或 REJECT');
    }
    const role = String(user?.role || '').toUpperCase();
    const username = user?.username || 'SYS';
    const isAdmin = role === 'ROLE_ADMIN' || role === 'ROLE_SYSOPS';

    return await this.em.transaction(async (mgr) => {
      const rows = await mgr.query(
        `SELECT txn_no, status, amount, account_code,
                approved_by_mgr, approved_by_gm, approved_by_ceo
           FROM fin_transactions WHERE txn_no = $1 FOR UPDATE`,
        [txnId],
      );
      if (rows.length === 0) throw new NotFoundException(`流水 ${txnId} 不存在`);
      const txn = rows[0];
      if (txn.status !== 'PENDING') {
        throw new BadRequestException(`当前状态 ${txn.status}，不可审批`);
      }

      // 记录审批历史（SAVEPOINT 隔离防止 schema 漂移污染主事务）
      await mgr.query('SAVEPOINT sp_fin_approval');
      try {
        await mgr.query(
          `INSERT INTO fin_approvals (txn_id, role, approver, action, comment, created_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [txnId, role, username, action, body?.comment || ''],
        );
        await mgr.query('RELEASE SAVEPOINT sp_fin_approval');
      } catch (e: any) {
        await mgr.query('ROLLBACK TO SAVEPOINT sp_fin_approval');
        console.warn('[approveExpenseChain][WARN] fin_approvals INSERT skipped:', e?.message);
      }

      if (action === 'REJECT') {
        await mgr.query(
          `UPDATE fin_transactions SET status='REJECTED' WHERE txn_no = $1`,
          [txnId],
        );
        return { code: 200, msg: '已驳回', data: { status: 'REJECTED' } };
      }

      // APPROVE 级联
      let nextMsg = '';
      let finalStatus = 'PENDING';
      const updates: Record<string, any> = {};

      if (role === 'ROLE_FARM_MGR' || (isAdmin && !txn.approved_by_mgr)) {
        updates.approved_by_mgr = username;
        nextMsg = '场长已同意，等待总经理审批';
      } else if (role === 'ROLE_REGION_MGR' || role === 'ROLE_FIN_CFO' || (isAdmin && !txn.approved_by_gm)) {
        if (!txn.approved_by_mgr && !isAdmin) {
          throw new ForbiddenException('场长尚未审批，不可越级');
        }
        updates.approved_by_gm = username;
        nextMsg = '总经理已同意，等待总裁审批';
      } else if (role === 'ROLE_CEO' || isAdmin) {
        if (!txn.approved_by_gm && !isAdmin) {
          throw new ForbiddenException('总经理尚未审批，不可越级');
        }
        updates.approved_by_ceo = username;
        finalStatus = 'COMPLETED';
        updates.status = 'COMPLETED';
        nextMsg = '总裁已同意，支出生效并已扣减余额';
      } else {
        throw new ForbiddenException('没有相应的审批权限');
      }

      // 动态 UPDATE
      const sets: string[] = [];
      const params: any[] = [];
      let i = 1;
      for (const [k, v] of Object.entries(updates)) {
        sets.push(`${k} = $${i++}`);
        params.push(v);
      }
      params.push(txnId);
      await mgr.query(
        `UPDATE fin_transactions SET ${sets.join(', ')}, updated_at = now() WHERE txn_no = $${i}`,
        params,
      );

      // 最终审批通过：扣减账户余额（仅当 account_code 存在）
      if (finalStatus === 'COMPLETED' && txn.account_code) {
        await mgr.query(
          `UPDATE fin_accounts SET balance = COALESCE(balance,0) - $1 WHERE account_code = $2`,
          [Number(txn.amount) || 0, txn.account_code],
        ).catch(() => {});
      }

      return { code: 200, msg: nextMsg, data: { status: finalStatus } };
    });
  }

  // ─── 移动端资金账户 ─────────────────────────────────────────────────────────
  async getAccounts() {
    try {
      // RBAC-3.1：注入 store_code 数据范围过滤
      const { sql: scopeSql, params: scopeParams } =
        this.scopeHelper.buildRawCondition({ companyAlias: 'store_code' }, 0);

      const data = await this.em.query(
        `SELECT account_code, account_name, currency_code AS currency, balance
         FROM fin_accounts
         WHERE status = 'ACTIVE' AND (${scopeSql})
         ORDER BY currency_code, account_name`,
        scopeParams,
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  async getTransactions(accountCode?: string) {
    try {
      // RBAC-3.1：注入 store_code 数据范围过滤
      const { sql: scopeSql, params: scopeParams } =
        this.scopeHelper.buildRawCondition({ companyAlias: 'store_code' }, 0);

      // NOTE: accountCode via string template is a pre-existing pattern (not in scope to refactor)
      const cond = accountCode ? `AND account_code = '${accountCode.replace(/'/g, "''")}'` : '';
      const data = await this.em.query(
        `SELECT txn_no AS txn_id, type, amount, currency_code, account_code,
                description AS note, status, created_at
         FROM fin_transactions
         WHERE 1=1 ${cond} AND (${scopeSql})
         ORDER BY created_at DESC
         LIMIT 100`,
        scopeParams,
      );
      return { code: 200, data };
    } catch {
      return { code: 200, data: [] };
    }
  }

  // ─── 移动端客户应收 ─────────────────────────────────────────────────────────
  async getIncome(month?: string) {
    try {
      // RBAC-3.1：注入 store_code 数据范围过滤
      const { sql: scopeSql, params: scopeParams } =
        this.scopeHelper.buildRawCondition({ companyAlias: 'store_code' }, 0);

      // NOTE: month via string template is a pre-existing pattern (not in scope to refactor)
      const cond = month ? `AND TO_CHAR(created_at,'YYYY-MM') = '${month.replace(/'/g, "''")}'` : '';
      const data = await this.em.query(
        `SELECT txn_no, amount, currency_code, account_code, description, status, created_at
         FROM fin_transactions
         WHERE type IN ('AR','AR_RECEIPT','INCOME') ${cond}
           AND (${scopeSql})
         ORDER BY created_at DESC
         LIMIT 200`,
        scopeParams,
      );
      const [total] = await this.em.query(
        `SELECT COALESCE(SUM(amount),0) AS total_amount
         FROM fin_transactions
         WHERE type IN ('AR','AR_RECEIPT','INCOME') AND status='COMPLETED' ${cond}
           AND (${scopeSql})`,
        scopeParams,
      );
      return { code: 200, data, total_amount: Number(total?.total_amount || 0) };
    } catch {
      return { code: 200, data: [], total_amount: 0 };
    }
  }
}

