import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';

import { FinCashAccountEntity } from '../entities/fin-cash-account.entity';
import { CreateCashAccountDto, UpdateCashAccountDto, QueryCashAccountDto } from '../dto/cash-account.dto';
import { finiteCashNumber, returningRow } from './cash-balance.guard';

@Injectable()
export class CashAccountsService {
  constructor(
    @InjectRepository(FinCashAccountEntity)
    private readonly repo: Repository<FinCashAccountEntity>,
    private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  // ── 权限校验 ─────────────────────────────────────────────────────────────

  private assertOwnership(companyCode: string, user: any) {
    const scopeAll: boolean = user?.dataScope?.scopeAll ?? false;
    if (scopeAll) return;
    const codes: string[] = user?.dataScope?.companyCodes ?? [];
    if (!codes.includes(companyCode)) {
      throw new ForbiddenException(`无权访问公司 ${companyCode} 的资金账户`);
    }
  }

  private userCompanyCodes(user: any): string[] | null {
    if (user?.dataScope?.scopeAll) return null;
    return user?.dataScope?.companyCodes ?? [];
  }

  // ── 编号生成 ─────────────────────────────────────────────────────────────

  private async genAccountCode(): Promise<string> {
    const now = new Date();
    const prefix = `CA-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const row = await this.ds.query(
      `SELECT COUNT(*) cnt FROM fin_cash_accounts WHERE account_code LIKE $1`,
      [`${prefix}%`],
    );
    const seq = String(Number(row[0]?.cnt ?? 0) + 1).padStart(5, '0');
    return `${prefix}-${seq}`;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async list(dto: QueryCashAccountDto, user: any) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const companyCodes = this.userCompanyCodes(user);

    let sql = `
      SELECT id, account_code, account_name, company_code, company_name,
             currency_code, account_type, opening_balance, current_balance,
             bank_name, bank_account_no, status, remark,
             created_by, created_at, updated_at
      FROM fin_cash_accounts
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (companyCodes) {
      sql += ` AND company_code = ANY($${idx++})`;
      params.push(companyCodes);
    }
    if (dto.companyCode) {
      sql += ` AND company_code = $${idx++}`;
      params.push(dto.companyCode);
    }
    if (dto.currencyCode) {
      sql += ` AND currency_code = $${idx++}`;
      params.push(dto.currencyCode);
    }
    if (dto.accountType) {
      sql += ` AND account_type = $${idx++}`;
      params.push(dto.accountType);
    }
    if (dto.status) {
      sql += ` AND status = $${idx++}`;
      params.push(dto.status);
    }
    if (dto.keyword) {
      sql += ` AND (account_code ILIKE $${idx} OR account_name ILIKE $${idx})`;
      params.push(`%${dto.keyword}%`);
      idx++;
    }

    const countSql = sql.replace(
      /SELECT[\s\S]+?FROM fin_cash_accounts/,
      'SELECT COUNT(*) AS cnt FROM fin_cash_accounts',
    );
    const [countRes, rows] = await Promise.all([
      this.ds.query(countSql, params),
      this.ds.query(
        sql + ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset],
      ),
    ]);

    return {
      total: Number(countRes[0]?.cnt ?? 0),
      page,
      pageSize,
      items: rows,
    };
  }

  async findById(id: string, user: any): Promise<FinCashAccountEntity> {
    const acc = await this.repo.findOne({ where: { id } });
    if (!acc) throw new NotFoundException(`资金账户 ${id} 不存在`);
    this.assertOwnership(acc.companyCode, user);
    return acc;
  }

  async create(dto: CreateCashAccountDto, user: any): Promise<FinCashAccountEntity> {
    this.assertOwnership(dto.companyCode, user);
    const u = user;

    const manualCode = typeof dto.accountCode === 'string' ? dto.accountCode.trim() : '';
    const code = manualCode || await this.genAccountCode();
    const exists = await this.repo.findOne({ where: { accountCode: code } });
    if (exists) throw new BadRequestException(`账户编号 ${code} 已存在`);

    const openingBalance = finiteCashNumber(dto.openingBalance ?? 0, 'opening_balance');
    const acc = this.repo.create({
      accountCode: code,
      accountName: dto.accountName,
      companyCode: dto.companyCode,
      companyName: dto.companyName ?? null,
      currencyCode: dto.currencyCode,
      accountType: dto.accountType,
      openingBalance,
      currentBalance: openingBalance,
      bankName: dto.bankName ?? null,
      bankAccountNo: dto.bankAccountNo ?? null,
      remark: dto.remark ?? null,
      status: 'ACTIVE',
      createdBy: u?.username ?? null,
      updatedBy: u?.username ?? null,
    });

    const saved = await this.repo.save(acc);

    // 如果期初余额 > 0，写一条 OPENING 流水（由调用方通过 CashTransactionsService 完成）
    return saved;
  }

  async update(id: string, dto: UpdateCashAccountDto, user: any): Promise<FinCashAccountEntity> {
    const acc = await this.findById(id, user);
    if (acc.status === 'CLOSED') throw new BadRequestException('已关闭账户不可修改');

    if (dto.accountName !== undefined) acc.accountName = dto.accountName;
    if (dto.bankName !== undefined) acc.bankName = dto.bankName ?? null;
    if (dto.bankAccountNo !== undefined) acc.bankAccountNo = dto.bankAccountNo ?? null;
    if (dto.remark !== undefined) acc.remark = dto.remark ?? null;
    (acc as any).updatedBy = user?.username ?? null;

    // 期初余额修正：写入新期初后按 期初 + Σ签名流水 重算当前余额 + 重建 balance_after 链
    const openingChanged =
      dto.openingBalance !== undefined &&
      Number(dto.openingBalance) !== Number(acc.openingBalance);
    if (dto.openingBalance !== undefined) {
      acc.openingBalance = finiteCashNumber(dto.openingBalance, 'opening_balance');
    }
    const saved = await this.repo.save(acc);

    if (openingChanged) {
      const opening = finiteCashNumber(dto.openingBalance, 'opening_balance');
      await this.ds.transaction(async (mgr) => {
        // 同步 OPENING 期初流水金额(若存在)，保持台账自洽
        await mgr.query(
          `UPDATE fin_cash_transactions SET amount = $1
             WHERE account_code = $2 AND source_type = 'OPENING'`,
          [opening, acc.accountCode],
        );
        await this.rebuildChain(mgr, acc.accountCode, opening, user?.username ?? null);
      });
      const fresh = await this.repo.findOne({ where: { id } });
      return fresh ?? saved;
    }
    return saved;
  }

  // ── 余额修正：重算 + 改挂账户（初始数据导入错误时用） ─────────────────────────

  /**
   * 按 期初 + Σ签名流水 重建账户的 balance_after 链与 current_balance。
   * 必须在事务内调用（mgr 为事务 EntityManager）。
   * - 按 (txn_date, id) 升序累加：IN 加、OUT 减
   * - source_type='OPENING' 的流水不计入累加（期初已作为 base），其快照 = 期初
   */
  private async rebuildChain(
    mgr: import('typeorm').EntityManager,
    accountCode: string,
    openingBalance: number,
    updatedBy: string | null,
  ): Promise<{ accountCode: string; currentBalance: number; txnCount: number }> {
    const txns = await mgr.query(
      `SELECT id, direction, amount, source_type
         FROM fin_cash_transactions
        WHERE account_code = $1
        ORDER BY txn_date ASC, id ASC
        FOR UPDATE`,
      [accountCode],
    );
    let running = finiteCashNumber(openingBalance, 'opening_balance');
    for (const t of txns) {
      if (t.source_type === 'OPENING') {
        await mgr.query(
          `UPDATE fin_cash_transactions SET balance_after = $1 WHERE id = $2`,
          [openingBalance, t.id],
        );
        continue;
      }
      if (t.direction !== 'IN' && t.direction !== 'OUT') {
        throw new BadRequestException(`流水 ${t.id} direction 非法`);
      }
      const amount = finiteCashNumber(t.amount, `流水 ${t.id} amount`);
      running += t.direction === 'IN' ? amount : -amount;
      running = finiteCashNumber(running, `流水 ${t.id} balance_after`);
      await mgr.query(
        `UPDATE fin_cash_transactions SET balance_after = $1 WHERE id = $2`,
        [running, t.id],
      );
    }
    await mgr.query(
      `UPDATE fin_cash_accounts
          SET current_balance = $1, updated_by = $2, updated_at = now()
        WHERE account_code = $3`,
      [running, updatedBy, accountCode],
    );
    return { accountCode, currentBalance: running, txnCount: txns.length };
  }

  /** 重算单个账户余额（独立入口，供「重算余额」按钮调用）。 */
  async recalcBalance(id: string, user: any) {
    const acc = await this.findById(id, user); // 含 DataScope 归属校验
    return this.ds.transaction((mgr) =>
      this.rebuildChain(mgr, acc.accountCode, Number(acc.openingBalance), user?.username ?? null),
    );
  }

  /**
   * 流水改挂账户：把一条挂错账户的流水迁移到正确账户，并重算两边余额。
   * 约束：源/目标账户归属当前用户 DataScope；币种必须一致。
   */
  async reassignTransaction(txnId: string, targetAccountId: string, user: any) {
    const txnRows = await this.ds.query(
      `SELECT id, account_code, company_code, currency_code FROM fin_cash_transactions WHERE id = $1`,
      [txnId],
    );
    const txn = txnRows[0];
    if (!txn) throw new NotFoundException(`流水 ${txnId} 不存在`);

    const target = await this.repo.findOne({ where: { id: targetAccountId } });
    if (!target) throw new NotFoundException(`目标账户 ${targetAccountId} 不存在`);
    if (target.status === 'CLOSED') throw new BadRequestException('目标账户已关闭，不可接收流水');

    this.assertOwnership(txn.company_code, user);
    this.assertOwnership(target.companyCode, user);

    if (txn.account_code === target.accountCode) {
      throw new BadRequestException('目标账户与当前账户相同');
    }
    if (txn.currency_code !== target.currencyCode) {
      throw new BadRequestException(
        `币种不一致：流水 ${txn.currency_code} ≠ 目标账户 ${target.currencyCode}`,
      );
    }

    const oldAccountCode = txn.account_code;
    await this.ds.transaction(async (mgr) => {
      await mgr.query(
        `UPDATE fin_cash_transactions
            SET account_id = $1, account_code = $2, account_name = $3,
                company_code = $4, company_name = $5
          WHERE id = $6`,
        [target.id, target.accountCode, target.accountName,
         target.companyCode, target.companyName, txnId],
      );
      const oldAcc = await mgr.query(
        `SELECT opening_balance FROM fin_cash_accounts WHERE account_code = $1`,
        [oldAccountCode],
      );
      if (oldAcc[0]) {
        await this.rebuildChain(mgr, oldAccountCode, Number(oldAcc[0].opening_balance), user?.username ?? null);
      }
      await this.rebuildChain(mgr, target.accountCode, Number(target.openingBalance), user?.username ?? null);
    });

    return { ok: true, txnId, from: oldAccountCode, to: target.accountCode };
  }

  /**
   * G103：修改手工流水（金额/方向/日期/摘要）→ 重算账户余额链与 current_balance。
   *   铁律：仅 source_type='MANUAL' 可改；AR/AP/付款等业务单据带出的流水必须回源单据修正（否则与源单脱账）。
   */
  async editManualTransaction(txnId: string, body: any, user: any) {
    const rows = await this.ds.query(
      `SELECT id, account_code, company_code, source_type FROM fin_cash_transactions WHERE id = $1`,
      [txnId],
    );
    const txn = rows[0];
    if (!txn) throw new NotFoundException(`流水 ${txnId} 不存在`);
    if (txn.source_type !== 'MANUAL') {
      throw new BadRequestException('仅「手工」流水可修改；业务单据（应收/应付/付款）带出的流水请回源单据修正');
    }
    this.assertOwnership(txn.company_code, user);

    const sets: string[] = []; const params: any[] = [];
    if (body.direction !== undefined) {
      if (body.direction !== 'IN' && body.direction !== 'OUT') throw new BadRequestException('direction 必须为 IN 或 OUT');
      params.push(body.direction); sets.push(`direction = $${params.length}`);
    }
    if (body.amount !== undefined) {
      const amt = Number(body.amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new BadRequestException('amount 必须为正数');
      params.push(amt); sets.push(`amount = $${params.length}`);
    }
    if (body.txn_date !== undefined && body.txn_date) {
      params.push(new Date(body.txn_date).toISOString()); sets.push(`txn_date = $${params.length}`);
    }
    if (body.remark !== undefined) { params.push(String(body.remark)); sets.push(`remark = $${params.length}`); }
    if (!sets.length) throw new BadRequestException('无可修改字段');

    await this.ds.transaction(async (mgr) => {
      params.push(txnId);
      await mgr.query(`UPDATE fin_cash_transactions SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      const acc = await mgr.query(`SELECT opening_balance FROM fin_cash_accounts WHERE account_code = $1`, [txn.account_code]);
      await this.rebuildChain(mgr, txn.account_code, Number(acc[0]?.opening_balance ?? 0), user?.username ?? null);
    });
    return { ok: true, txnId };
  }

  /** G103：删除手工流水 → 重算账户余额链。铁律：仅 source_type='MANUAL'。 */
  async deleteManualTransaction(txnId: string, user: any) {
    const rows = await this.ds.query(
      `SELECT id, account_code, company_code, source_type FROM fin_cash_transactions WHERE id = $1`,
      [txnId],
    );
    const txn = rows[0];
    if (!txn) throw new NotFoundException(`流水 ${txnId} 不存在`);
    if (txn.source_type !== 'MANUAL') {
      throw new BadRequestException('仅「手工」流水可删除；业务单据带出的流水请回源单据撤销');
    }
    this.assertOwnership(txn.company_code, user);
    await this.ds.transaction(async (mgr) => {
      await mgr.query(`DELETE FROM fin_cash_transactions WHERE id = $1`, [txnId]);
      const acc = await mgr.query(`SELECT opening_balance FROM fin_cash_accounts WHERE account_code = $1`, [txn.account_code]);
      await this.rebuildChain(mgr, txn.account_code, Number(acc[0]?.opening_balance ?? 0), user?.username ?? null);
    });
    return { ok: true, txnId };
  }

  /**
   * 批量删除流水（初始化对齐用）。放开"仅 MANUAL 可删"铁律为"无源单据(source_id IS NULL)可删"——
   * 手工/期初/导入流水均可删；AR/AP/付款/股东等有源单据流水(source_id 非空)仍禁止删(须回源撤销)。
   * 删后逐个重算受影响账户余额链。需 MENU_FIN2_CASH_TXN:D + 数据域(逐条公司校验)。
   */
  async bulkDeleteTransactions(ids: string[], user: any) {
    const clean = (ids ?? []).filter((x) => /^\d+$/.test(String(x)));
    if (clean.length === 0) return { deleted: 0, accounts: [] as string[] };

    const rows: Array<{ id: string; account_code: string; company_code: string; source_id: string | null }> = await this.ds.query(
      `SELECT id, account_code, company_code, source_id FROM fin_cash_transactions WHERE id = ANY($1::bigint[])`,
      [clean],
    );
    if (rows.length === 0) return { deleted: 0, accounts: [] as string[] };

    // 安全线：有源单据的业务流水不可删（防与源单脱账）
    const blocked = rows.filter((r) => r.source_id != null).length;
    if (blocked > 0) {
      throw new BadRequestException(
        `选中含 ${blocked} 条业务单据流水(有源单据)，不可删除——请回源单据撤销。仅可批量删手工/期初/导入等无源流水。`,
      );
    }
    // 数据域校验（逐条公司）
    for (const r of rows) this.assertOwnership(r.company_code, user);

    const accounts = [...new Set(rows.map((r) => String(r.account_code)))];
    await this.ds.transaction(async (mgr) => {
      await mgr.query(`DELETE FROM fin_cash_transactions WHERE id = ANY($1::bigint[])`, [clean]);
      for (const code of accounts) {
        const acc = await mgr.query(`SELECT opening_balance FROM fin_cash_accounts WHERE account_code = $1`, [code]);
        await this.rebuildChain(mgr, code, Number(acc[0]?.opening_balance ?? 0), user?.username ?? null);
      }
    });
    return { deleted: rows.length, accounts };
  }

  async freeze(id: string, user: any): Promise<FinCashAccountEntity> {
    const acc = await this.findById(id, user);
    if (acc.status !== 'ACTIVE') throw new BadRequestException(`账户当前状态 ${acc.status}，无法冻结`);
    acc.status = 'FROZEN';
    (acc as any).updatedBy = user?.username ?? null;
    return this.repo.save(acc);
  }

  async unfreeze(id: string, user: any): Promise<FinCashAccountEntity> {
    const acc = await this.findById(id, user);
    if (acc.status !== 'FROZEN') throw new BadRequestException(`账户当前状态 ${acc.status}，无法解冻`);
    acc.status = 'ACTIVE';
    (acc as any).updatedBy = user?.username ?? null;
    return this.repo.save(acc);
  }

  async close(id: string, user: any): Promise<FinCashAccountEntity> {
    const acc = await this.findById(id, user);
    if (acc.status === 'CLOSED') throw new BadRequestException('账户已关闭');
    if (Number(acc.currentBalance) !== 0) {
      throw new BadRequestException(`账户余额 ${acc.currentBalance} 不为零，无法关闭`);
    }
    acc.status = 'CLOSED';
    (acc as any).updatedBy = user?.username ?? null;
    return this.repo.save(acc);
  }

  // ── 余额断言（供转账 / AP / AR 调用） ─────────────────────────────────────

  async assertSufficientBalance(accountId: string, amount: number): Promise<void> {
    const required = finiteCashNumber(amount, 'amount');
    const row = await this.ds.query(
      `SELECT current_balance, status FROM fin_cash_accounts WHERE id = $1 FOR UPDATE`,
      [accountId],
    );
    if (!row.length) throw new NotFoundException(`账户 ${accountId} 不存在`);
    if (row[0].status !== 'ACTIVE') {
      throw new BadRequestException(`账户状态 ${row[0].status}，不允许收付款`);
    }
    const currentBalance = finiteCashNumber(row[0].current_balance, 'current_balance');
    if (currentBalance < required) {
      throw new BadRequestException(
        `账户余额不足：当前 ${row[0].current_balance}，需要 ${amount}`,
      );
    }
  }

  // ── 余额更新（内部，必须在事务内调用） ────────────────────────────────────

  async applyBalance(
    qr: import('typeorm').QueryRunner,
    accountId: string,
    delta: number,           // 正 = 加，负 = 减
    updatedBy: string | null,
  ): Promise<number> {
    const finiteDelta = finiteCashNumber(delta, 'delta');
    const res = await qr.query(
      `UPDATE fin_cash_accounts
       SET current_balance = current_balance + $1,
           updated_by = $2,
           updated_at = now()
       WHERE id = $3
       RETURNING current_balance`,
      [finiteDelta, updatedBy, accountId],
    );
    const row = returningRow<{ current_balance: unknown }>(res, '资金账户余额更新');
    return finiteCashNumber(row.current_balance, 'current_balance');
  }

  // ── 汇总统计 ─────────────────────────────────────────────────────────────

  async getSummary(user: any) {
    const companyCodes = this.userCompanyCodes(user);
    let where = '1=1';
    const params: any[] = [];
    if (companyCodes) {
      where += ` AND company_code = ANY($1)`;
      params.push(companyCodes);
    }

    const [totals, byType, byStatus, byCurrency] = await Promise.all([
      this.ds.query(
        `SELECT COUNT(*) total_accounts,
                SUM(current_balance) total_balance,
                COUNT(*) FILTER (WHERE status='ACTIVE')  active_count,
                COUNT(*) FILTER (WHERE status='FROZEN')  frozen_count,
                COUNT(*) FILTER (WHERE status='CLOSED')  closed_count
         FROM fin_cash_accounts WHERE ${where}`,
        params,
      ),
      this.ds.query(
        `SELECT account_type, COUNT(*) cnt, SUM(current_balance) balance
         FROM fin_cash_accounts WHERE ${where}
         GROUP BY account_type`,
        params,
      ),
      this.ds.query(
        `SELECT status, COUNT(*) cnt
         FROM fin_cash_accounts WHERE ${where}
         GROUP BY status`,
        params,
      ),
      // 按币种分组小计：total_balance 是跨币种裸 SUM，不可直接贴单一符号；
      // 前端按此明细分币种展示，避免 USD/THB 账户被当成人民币。
      this.ds.query(
        `SELECT currency_code, COUNT(*) cnt, SUM(current_balance) balance
         FROM fin_cash_accounts WHERE ${where}
         GROUP BY currency_code
         ORDER BY currency_code`,
        params,
      ),
    ]);

    return {
      totalAccounts: Number(totals[0]?.total_accounts ?? 0),
      totalBalance: Number(totals[0]?.total_balance ?? 0),
      activeCount: Number(totals[0]?.active_count ?? 0),
      frozenCount: Number(totals[0]?.frozen_count ?? 0),
      closedCount: Number(totals[0]?.closed_count ?? 0),
      byType,
      byStatus,
      byCurrency,
    };
  }
}
