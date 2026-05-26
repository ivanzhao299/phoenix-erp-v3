import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';

import { FinCashAccountEntity } from '../entities/fin-cash-account.entity';
import { CreateCashAccountDto, UpdateCashAccountDto, QueryCashAccountDto } from '../dto/cash-account.dto';

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

    const code = dto.accountCode ?? await this.genAccountCode();
    const exists = await this.repo.findOne({ where: { accountCode: code } });
    if (exists) throw new BadRequestException(`账户编号 ${code} 已存在`);

    const acc = this.repo.create({
      accountCode: code,
      accountName: dto.accountName,
      companyCode: dto.companyCode,
      companyName: dto.companyName ?? null,
      currencyCode: dto.currencyCode,
      accountType: dto.accountType,
      openingBalance: dto.openingBalance ?? 0,
      currentBalance: dto.openingBalance ?? 0,
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

    return this.repo.save(acc);
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
    const row = await this.ds.query(
      `SELECT current_balance, status FROM fin_cash_accounts WHERE id = $1 FOR UPDATE`,
      [accountId],
    );
    if (!row.length) throw new NotFoundException(`账户 ${accountId} 不存在`);
    if (row[0].status !== 'ACTIVE') {
      throw new BadRequestException(`账户状态 ${row[0].status}，不允许收付款`);
    }
    if (Number(row[0].current_balance) < amount) {
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
    const res = await qr.query(
      `UPDATE fin_cash_accounts
       SET current_balance = current_balance + $1,
           updated_by = $2,
           updated_at = now()
       WHERE id = $3
       RETURNING current_balance`,
      [delta, updatedBy, accountId],
    );
    return Number(res[0].current_balance);
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

    const [totals, byType, byStatus] = await Promise.all([
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
    ]);

    return {
      totalAccounts: Number(totals[0]?.total_accounts ?? 0),
      totalBalance: Number(totals[0]?.total_balance ?? 0),
      activeCount: Number(totals[0]?.active_count ?? 0),
      frozenCount: Number(totals[0]?.frozen_count ?? 0),
      closedCount: Number(totals[0]?.closed_count ?? 0),
      byType,
      byStatus,
    };
  }
}
