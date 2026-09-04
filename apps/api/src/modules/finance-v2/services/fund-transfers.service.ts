import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';

import { FinFundTransferEntity } from '../entities/fin-fund-transfer.entity';
import { FinCashAccountEntity }  from '../entities/fin-cash-account.entity';
import { CashAccountsService }    from './cash-accounts.service';
import { CashTransactionsService } from './cash-transactions.service';
import { finiteCashNumber } from './cash-balance.guard';
import {
  CreateFundTransferDto,
  ApproveFundTransferDto,
  CancelFundTransferDto,
  QueryFundTransferDto,
} from '../dto/fund-transfer.dto';

@Injectable()
export class FundTransfersService {
  constructor(
    @InjectRepository(FinFundTransferEntity)
    private readonly repo: Repository<FinFundTransferEntity>,
    @InjectRepository(FinCashAccountEntity)
    private readonly accRepo: Repository<FinCashAccountEntity>,
    private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly cashAccSvc: CashAccountsService,
    private readonly cashTxnSvc: CashTransactionsService,
  ) {}

  // ── 编号生成 ─────────────────────────────────────────────────────────────

  private async genTransferNo(): Promise<string> {
    const now = new Date();
    const prefix = `TRF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const row = await this.ds.query(
      `SELECT COUNT(*) cnt FROM fin_fund_transfers WHERE transfer_no LIKE $1`,
      [`${prefix}%`],
    );
    const seq = String(Number(row[0]?.cnt ?? 0) + 1).padStart(5, '0');
    return `${prefix}-${seq}`;
  }

  // ── 权限 ─────────────────────────────────────────────────────────────────

  private assertOwnership(companyCode: string, user: any) {
    if (user?.dataScope?.scopeAll) return;
    const codes: string[] = user?.dataScope?.companyCodes ?? [];
    if (!codes.includes(companyCode)) {
      throw new ForbiddenException(`无权访问公司 ${companyCode} 的转账记录`);
    }
  }

  // ── 查询 ──────────────────────────────────────────────────────────────────

  async list(dto: QueryFundTransferDto, user: any) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const companyCodes: string[] | null = user?.dataScope?.scopeAll
      ? null
      : (user?.dataScope?.companyCodes ?? []);

    let sql = `
      SELECT id, transfer_no, from_account_id, from_account_code, from_account_name,
             to_account_id, to_account_code, to_account_name,
             company_code, company_name,
             currency_code, amount_original, exchange_rate, amount_base, base_currency,
             status, wf_instance_id, out_txn_id, in_txn_id,
             remark, created_by, created_at, updated_at
      FROM fin_fund_transfers WHERE 1=1
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
    if (dto.fromAccountId) {
      sql += ` AND from_account_id = $${idx++}`;
      params.push(dto.fromAccountId);
    }
    if (dto.toAccountId) {
      sql += ` AND to_account_id = $${idx++}`;
      params.push(dto.toAccountId);
    }
    if (dto.status) {
      sql += ` AND status = $${idx++}`;
      params.push(dto.status);
    }
    if (dto.dateFrom) {
      sql += ` AND created_at >= $${idx++}`;
      params.push(dto.dateFrom);
    }
    if (dto.dateTo) {
      sql += ` AND created_at <= $${idx++}`;
      params.push(dto.dateTo + ' 23:59:59');
    }

    const countSql = sql.replace(
      /SELECT[\s\S]+?FROM fin_fund_transfers/,
      'SELECT COUNT(*) AS cnt FROM fin_fund_transfers',
    );
    const [countRes, rows] = await Promise.all([
      this.ds.query(countSql, params),
      this.ds.query(
        sql + ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset],
      ),
    ]);

    return { total: Number(countRes[0]?.cnt ?? 0), page, pageSize, items: this.snakeToCamel(rows) };
  }

  async findById(id: string, user: any): Promise<FinFundTransferEntity> {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`转账单 ${id} 不存在`);
    this.assertOwnership(t.companyCode, user);
    return t;
  }

  // ── 创建（DRAFT） ─────────────────────────────────────────────────────────

  async create(dto: CreateFundTransferDto, user: any): Promise<FinFundTransferEntity> {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('转出账户与转入账户不能相同');
    }

    const [fromAcc, toAcc] = await Promise.all([
      this.accRepo.findOne({ where: { id: dto.fromAccountId } }),
      this.accRepo.findOne({ where: { id: dto.toAccountId } }),
    ]);
    if (!fromAcc) throw new NotFoundException(`转出账户 ${dto.fromAccountId} 不存在`);
    if (!toAcc)   throw new NotFoundException(`转入账户 ${dto.toAccountId} 不存在`);
    if (fromAcc.status !== 'ACTIVE') throw new BadRequestException(`转出账户状态 ${fromAcc.status}，不允许转账`);
    if (toAcc.status !== 'ACTIVE')   throw new BadRequestException(`转入账户状态 ${toAcc.status}，不允许转账`);

    this.assertOwnership(fromAcc.companyCode, user);

    const transferNo = await this.genTransferNo();
    const rate = dto.exchangeRate ?? 1;
    const amountBase = dto.amountBase ?? Number((dto.amountOriginal * rate).toFixed(2));

    const t = this.repo.create({
      transferNo,
      fromAccountId: fromAcc.id,
      fromAccountCode: fromAcc.accountCode,
      fromAccountName: fromAcc.accountName,
      toAccountId: toAcc.id,
      toAccountCode: toAcc.accountCode,
      toAccountName: toAcc.accountName,
      companyCode: fromAcc.companyCode,
      companyName: fromAcc.companyName ?? null,
      currencyCode: fromAcc.currencyCode,
      amountOriginal: dto.amountOriginal,
      exchangeRate: rate,
      amountBase,
      status: 'DRAFT',
      remark: dto.remark ?? null,
      createdBy: user?.username ?? null,
      updatedBy: user?.username ?? null,
    });

    return this.repo.save(t);
  }

  // ── 提交审批 ──────────────────────────────────────────────────────────────

  async submit(id: string, user: any): Promise<FinFundTransferEntity> {
    const t = await this.findById(id, user);
    if (t.status !== 'DRAFT') throw new BadRequestException(`当前状态 ${t.status}，只有草稿可提交审批`);
    t.status = 'PENDING_APPROVAL';
    (t as any).updatedBy = user?.username ?? null;
    return this.repo.save(t);
  }

  // ── 审批通过 ──────────────────────────────────────────────────────────────

  async approve(id: string, dto: ApproveFundTransferDto, user: any): Promise<FinFundTransferEntity> {
    const t = await this.findById(id, user);
    if (t.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`当前状态 ${t.status}，不在待审批`);
    }
    t.status = 'APPROVED';
    if (dto.remark) t.remark = dto.remark;
    (t as any).updatedBy = user?.username ?? null;
    return this.repo.save(t);
  }

  // ── 取消 ─────────────────────────────────────────────────────────────────

  async cancel(id: string, dto: CancelFundTransferDto, user: any): Promise<FinFundTransferEntity> {
    const t = await this.findById(id, user);
    if (['EXECUTED', 'CANCELLED'].includes(t.status)) {
      throw new BadRequestException(`当前状态 ${t.status}，无法取消`);
    }
    t.status = 'CANCELLED';
    if (dto.remark) t.remark = dto.remark;
    (t as any).updatedBy = user?.username ?? null;
    return this.repo.save(t);
  }

  // ── 执行转账（APPROVED → EXECUTED，全事务 SERIALIZABLE） ─────────────────

  async execute(id: string, user: any): Promise<FinFundTransferEntity> {
    const transfer = await this.findById(id, user);
    if (transfer.status !== 'APPROVED') {
      throw new BadRequestException(`当前状态 ${transfer.status}，只有 APPROVED 可执行`);
    }

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction('SERIALIZABLE');

    try {
      // 1. FOR UPDATE 锁住两个账户
      const [fromRows, toRows] = await Promise.all([
        qr.query(`SELECT id, account_code, account_name, company_code, company_name,
                         currency_code, current_balance, status
                  FROM fin_cash_accounts WHERE id = $1 FOR UPDATE`, [transfer.fromAccountId]),
        qr.query(`SELECT id, account_code, account_name, company_code, company_name,
                         currency_code, current_balance, status
                  FROM fin_cash_accounts WHERE id = $1 FOR UPDATE`, [transfer.toAccountId]),
      ]);

      const from = fromRows[0];
      const to   = toRows[0];

      if (!from) throw new NotFoundException('转出账户不存在');
      if (!to)   throw new NotFoundException('转入账户不存在');
      if (from.status !== 'ACTIVE') throw new BadRequestException(`转出账户状态 ${from.status}`);
      if (to.status !== 'ACTIVE')   throw new BadRequestException(`转入账户状态 ${to.status}`);

      const amount = finiteCashNumber(transfer.amountOriginal, 'transfer amount');
      const fromBalance = finiteCashNumber(from.current_balance, 'current_balance');
      finiteCashNumber(to.current_balance, 'current_balance');
      if (fromBalance < amount) {
        throw new BadRequestException(
          `转出账户余额不足：当前 ${from.current_balance}，需要 ${amount}`,
        );
      }

      // 2. 更新转出账户余额
      const newFromBalance = await this.cashAccSvc.applyBalance(
        qr, transfer.fromAccountId, -amount, user?.username ?? null,
      );

      // 3. 更新转入账户余额
      const newToBalance = await this.cashAccSvc.applyBalance(
        qr, transfer.toAccountId, amount, user?.username ?? null,
      );

      // 4. 写出向流水
      const outTxn = await this.cashTxnSvc.writeTransaction({
        qr,
        accountId: from.id,
        accountCode: from.account_code,
        accountName: from.account_name,
        companyCode: from.company_code,
        companyName: from.company_name,
        direction: 'OUT',
        sourceType: 'TRANSFER',
        sourceId: transfer.id,
        sourceNo: transfer.transferNo,
        currencyCode: from.currency_code,
        amount,
        balanceAfter: newFromBalance,
        remark: transfer.remark,
        createdBy: user?.username ?? null,
      });

      // 5. 写入向流水
      const inTxn = await this.cashTxnSvc.writeTransaction({
        qr,
        accountId: to.id,
        accountCode: to.account_code,
        accountName: to.account_name,
        companyCode: to.company_code,
        companyName: to.company_name,
        direction: 'IN',
        sourceType: 'TRANSFER',
        sourceId: transfer.id,
        sourceNo: transfer.transferNo,
        currencyCode: to.currency_code,
        amount,
        balanceAfter: newToBalance,
        remark: transfer.remark,
        createdBy: user?.username ?? null,
      });

      // 6. 更新转账单状态
      await qr.query(
        `UPDATE fin_fund_transfers
         SET status = 'EXECUTED',
             out_txn_id = $1,
             in_txn_id  = $2,
             updated_by = $3,
             updated_at = now()
         WHERE id = $4`,
        [outTxn.id, inTxn.id, user?.username ?? null, transfer.id],
      );

      await qr.commitTransaction();

      return this.repo.findOne({ where: { id } }) as Promise<FinFundTransferEntity>;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── 待处理统计 ────────────────────────────────────────────────────────────

  async getPendingCount(companyCodes: string[] | null): Promise<number> {
    let where = `status IN ('DRAFT','PENDING_APPROVAL','APPROVED')`;
    const params: any[] = [];
    if (companyCodes) {
      where += ` AND company_code = ANY($1)`;
      params.push(companyCodes);
    }
    const row = await this.ds.query(
      `SELECT COUNT(*) cnt FROM fin_fund_transfers WHERE ${where}`,
      params,
    );
    return Number(row[0]?.cnt ?? 0);
  }

  private snakeToCamel(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map(r => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        o[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
      }
      return o;
    });
  }
}
