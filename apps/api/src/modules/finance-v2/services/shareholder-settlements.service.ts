import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';

import { FinShareholderSettlementEntity } from '../entities/fin-shareholder-settlement.entity';
import { FinShareholderContributionEntity } from '../entities/fin-shareholder-contribution.entity';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import { CashAccountsService } from './cash-accounts.service';
import { CashTransactionsService } from './cash-transactions.service';
import { ShareholderContributionsService } from './shareholder-contributions.service';
import {
  CreateShareholderSettlementDto,
  QueryShareholderSettlementDto,
  SubmitShareholderSettlementDto,
  ApproveShareholderSettlementDto,
  CancelShareholderSettlementDto,
} from '../dto/shareholder.dto';

@Injectable()
export class ShareholderSettlementsService {
  constructor(
    @InjectRepository(FinShareholderSettlementEntity)
    private readonly repo: Repository<FinShareholderSettlementEntity>,
    @InjectRepository(FinShareholderContributionEntity)
    private readonly contribRepo: Repository<FinShareholderContributionEntity>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly cashAccSvc: CashAccountsService,
    private readonly cashTxnSvc: CashTransactionsService,
    private readonly contribSvc: ShareholderContributionsService,
  ) {}

  // ── 内部辅助 ─────────────────────────────────────────────────────────────

  private currentUser(): any {
    return this.cls.get('user') as any;
  }

  private username(): string | null {
    const u = this.currentUser();
    return u?.username ?? u?.userId ?? null;
  }

  private assertOwnership(companyCode: string, user: any) {
    if (user?.dataScope?.scopeAll) return;
    const codes: string[] = user?.dataScope?.companyCodes ?? [];
    if (!codes.includes(companyCode)) {
      throw new ForbiddenException(`无权访问公司 ${companyCode} 的还款记录`);
    }
  }

  private userCompanyCodes(user: any): string[] | null {
    if (user?.dataScope?.scopeAll) return null;
    return user?.dataScope?.companyCodes ?? [];
  }

  // ── 编号生成 ─────────────────────────────────────────────────────────────

  private async genSettlementNo(qr: import('typeorm').QueryRunner): Promise<string> {
    const now = new Date();
    const prefix = `SHS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    await qr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
    const row = await qr.query(
      `SELECT MAX(settlement_no) AS max FROM fin_shareholder_settlements WHERE settlement_no LIKE $1`,
      [`${prefix}%`],
    );
    let seq = 1;
    const max: string | null = row[0]?.max ?? null;
    if (max) {
      const last = parseInt(max.slice(prefix.length), 10);
      if (!isNaN(last)) seq = last + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  // ── 列表 ─────────────────────────────────────────────────────────────────

  async list(dto: QueryShareholderSettlementDto, user: any) {
    const page     = dto.page     ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const offset   = (page - 1) * pageSize;

    const companyCodes = this.userCompanyCodes(user);

    let sql = `
      SELECT id, settlement_no, contribution_id, contribution_no,
             shareholder_id, shareholder_code, shareholder_name,
             company_code, company_name, project_code, project_name,
             settlement_type,
             currency_code, amount_original, exchange_rate, amount_base, base_currency,
             cash_account_id, cash_account_code, out_txn_id,
             status, wf_instance_id,
             remark, created_by, updated_by, created_at, updated_at
      FROM fin_shareholder_settlements WHERE 1=1
    `;
    const params: unknown[] = [];
    let idx = 1;

    if (companyCodes) {
      sql += ` AND company_code = ANY($${idx++})`;
      params.push(companyCodes);
    }
    if (dto.companyCode) {
      sql += ` AND company_code = $${idx++}`;
      params.push(dto.companyCode);
    }
    if (dto.contributionId) {
      sql += ` AND contribution_id = $${idx++}`;
      params.push(dto.contributionId);
    }
    if (dto.shareholderCode) {
      sql += ` AND shareholder_code = $${idx++}`;
      params.push(dto.shareholderCode);
    }
    if (dto.status) {
      sql += ` AND status = $${idx++}`;
      params.push(dto.status);
    }
    if (dto.settlementType) {
      sql += ` AND settlement_type = $${idx++}`;
      params.push(dto.settlementType);
    }

    const countSql = sql.replace(
      /SELECT[\s\S]+?FROM/,
      'SELECT COUNT(*) AS total FROM',
    );
    const [countRow, items] = await Promise.all([
      this.ds.query(countSql, params),
      this.ds.query(`${sql} ORDER BY id DESC LIMIT $${idx++} OFFSET $${idx++}`, [
        ...params, pageSize, offset,
      ]),
    ]);

    return { items, total: Number(countRow[0]?.total ?? 0), page, pageSize };
  }

  // ── 单条详情 ─────────────────────────────────────────────────────────────

  async findById(id: string, user: any): Promise<FinShareholderSettlementEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`还款记录 ID=${id} 不存在`);
    this.assertOwnership(row.companyCode, user);
    return row;
  }

  // ── 创建 ─────────────────────────────────────────────────────────────────

  async create(dto: CreateShareholderSettlementDto, user: any): Promise<FinShareholderSettlementEntity> {
    // 验证 contribution 存在且处于可还款状态
    const contrib = await this.contribRepo.findOne({ where: { id: dto.contributionId } });
    if (!contrib) throw new NotFoundException(`股东出资 ID=${dto.contributionId} 不存在`);
    this.assertOwnership(contrib.companyCode, user);
    if (!['CONFIRMED', 'PARTIALLY_SETTLED'].includes(contrib.status)) {
      throw new ConflictException(`出资记录状态 ${contrib.status} 不允许创建还款`);
    }

    // RETURN 类型必须有现金账户
    if (dto.settlementType === 'RETURN' && !dto.cashAccountId) {
      throw new BadRequestException('还款类型 RETURN 必须指定现金账户');
    }

    return this.ds.transaction(async mgr => {
      const qr = mgr.queryRunner!;
      const settlementNo = await this.genSettlementNo(qr);
      const rate    = Number(dto.exchangeRate ?? 1);
      const amtOrig = Number(dto.amountOriginal);
      const amtBase = dto.amountBase != null ? Number(dto.amountBase) : amtOrig * rate;

      // 查找现金账户 code
      let cashAccountCode: string | null = null;
      if (dto.cashAccountId) {
        const accRow = await qr.query(
          `SELECT account_code FROM fin_cash_accounts WHERE id = $1`,
          [dto.cashAccountId],
        );
        cashAccountCode = accRow[0]?.account_code ?? null;
      }

      await qr.query(
        `INSERT INTO fin_shareholder_settlements
           (settlement_no, contribution_id, contribution_no,
            shareholder_id, shareholder_code, shareholder_name,
            company_code, company_name, project_code, project_name,
            settlement_type,
            currency_code, amount_original, exchange_rate, amount_base, base_currency,
            cash_account_id, cash_account_code,
            status, remark, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          settlementNo,
          dto.contributionId,
          contrib.contributionNo,
          contrib.shareholderId ?? null,
          contrib.shareholderCode ?? null,
          contrib.shareholderName,
          contrib.companyCode,
          contrib.companyName ?? null,
          contrib.projectCode ?? null,
          contrib.projectName ?? null,
          dto.settlementType,
          dto.currencyCode,
          amtOrig, rate, amtBase, 'CNY',
          dto.cashAccountId ?? null,
          cashAccountCode,
          'DRAFT',
          dto.remark ?? null,
          this.username(),
        ],
      );

      const created = await mgr.findOne(FinShareholderSettlementEntity, {
        where: { settlementNo },
      });
      return created!;
    });
  }

  // ── 提交审批 ─────────────────────────────────────────────────────────────

  async submit(id: string, dto: SubmitShareholderSettlementDto, user: any): Promise<FinShareholderSettlementEntity> {
    return this.ds.transaction(async mgr => {
      const qr = mgr.queryRunner!;
      const row = await mgr.findOne(FinShareholderSettlementEntity, { where: { id } });
      if (!row) throw new NotFoundException(`还款记录 ID=${id} 不存在`);
      this.assertOwnership(row.companyCode, user);
      if (row.status !== 'DRAFT') {
        throw new ConflictException(`只有草稿状态才可提交（当前：${row.status}）`);
      }

      await qr.query(
        `UPDATE fin_shareholder_settlements
         SET status = 'PENDING_APPROVAL', updated_by = $1, updated_at = now()
         WHERE id = $2`,
        [this.username(), id],
      );

      try {
        await this.approvalEngine.startApproval({
          moduleCode:   'MENU_FIN2_SHAREHOLDER',
          bizType:      'SHAREHOLDER_SETTLEMENT',
          bizId:        id,
          bizNo:        row.settlementNo,
          amount:       Number(row.amountBase ?? row.amountOriginal ?? 0),
          currencyCode: row.currencyCode,
          companyCode:  row.companyCode,
          companyName:  row.companyName ?? undefined,
          projectCode:  row.projectCode ?? undefined,
          projectName:  row.projectName ?? undefined,
          subject:      `${row.shareholderName} · ${row.settlementType} · ${row.amountOriginal}`,
        }, mgr);
      } catch {
        // 无审批规则时自动 APPROVED
        await qr.query(
          `UPDATE fin_shareholder_settlements
           SET status = 'APPROVED', updated_by = $1, updated_at = now()
           WHERE id = $2`,
          [this.username(), id],
        );
      }

      const updated = await mgr.findOne(FinShareholderSettlementEntity, { where: { id } });
      return updated!;
    });
  }

  // ── 直接审批通过 ─────────────────────────────────────────────────────────

  async approveDirect(id: string, dto: ApproveShareholderSettlementDto, user: any): Promise<FinShareholderSettlementEntity> {
    return this.ds.transaction(async mgr => {
      const row = await mgr.findOne(FinShareholderSettlementEntity, { where: { id } });
      if (!row) throw new NotFoundException(`还款记录 ID=${id} 不存在`);
      this.assertOwnership(row.companyCode, user);
      if (row.status !== 'PENDING_APPROVAL') {
        throw new ConflictException(`只有 PENDING_APPROVAL 状态才可直接审批（当前：${row.status}）`);
      }

      await mgr.queryRunner!.query(
        `UPDATE fin_shareholder_settlements
         SET status = 'APPROVED', remark = COALESCE($1, remark),
             updated_by = $2, updated_at = now()
         WHERE id = $3`,
        [dto.remark ?? null, this.username(), id],
      );

      const updated = await mgr.findOne(FinShareholderSettlementEntity, { where: { id } });
      return updated!;
    });
  }

  // ── 执行还款（SERIALIZABLE） ──────────────────────────────────────────────

  async execute(id: string, user: any): Promise<FinShareholderSettlementEntity> {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction('SERIALIZABLE');

    try {
      // 1. 锁定 settlement
      const settlementRows = await qr.query(
        `SELECT * FROM fin_shareholder_settlements WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!settlementRows.length) throw new NotFoundException(`还款记录 ID=${id} 不存在`);
      const settlement = settlementRows[0];
      this.assertOwnership(settlement.company_code, user);

      // 2. 验证状态
      if (settlement.status !== 'APPROVED') {
        throw new ConflictException(`只有 APPROVED 状态才可执行（当前：${settlement.status}）`);
      }

      // 3. 锁定 contribution
      const contribRows = await qr.query(
        `SELECT * FROM fin_shareholder_contributions WHERE id = $1 FOR UPDATE`,
        [settlement.contribution_id],
      );
      if (!contribRows.length) throw new NotFoundException(`关联出资记录不存在`);
      const contrib = contribRows[0];

      // 4. 验证 contribution 状态
      if (!['CONFIRMED', 'PARTIALLY_SETTLED'].includes(contrib.status)) {
        throw new ConflictException(`出资记录状态 ${contrib.status} 不允许执行还款`);
      }

      // 5. 验证金额
      const amtOrig    = Number(settlement.amount_original);
      const balanceOrig = Number(contrib.balance_amount_original);
      if (amtOrig > balanceOrig) {
        throw new BadRequestException(
          `还款金额 ${amtOrig} 超过剩余余额 ${balanceOrig}`,
        );
      }

      let outTxnId: string | null = null;

      // 6. RETURN：走现金账户
      if (settlement.settlement_type === 'RETURN') {
        const cashAccountId = settlement.cash_account_id;
        if (!cashAccountId) {
          throw new BadRequestException('RETURN 类型必须绑定现金账户');
        }

        // 锁定现金账户
        const accRows = await qr.query(
          `SELECT * FROM fin_cash_accounts WHERE id = $1 FOR UPDATE`,
          [cashAccountId],
        );
        if (!accRows.length) throw new NotFoundException(`现金账户 ID=${cashAccountId} 不存在`);
        const acc = accRows[0];

        if (acc.status !== 'ACTIVE') {
          throw new BadRequestException(`账户状态 ${acc.status}，不允许收付款`);
        }
        if (Number(acc.current_balance) < amtOrig) {
          throw new BadRequestException(
            `账户余额不足：当前 ${acc.current_balance}，需要 ${amtOrig}`,
          );
        }

        // 扣减账户余额
        const newBalance = await this.cashAccSvc.applyBalance(qr, String(cashAccountId), -amtOrig, this.username());

        // 写 OUT 流水
        const txn = await this.cashTxnSvc.writeTransaction({
          qr,
          accountId:    String(cashAccountId),
          accountCode:  acc.account_code,
          accountName:  acc.account_name,
          companyCode:  acc.company_code,
          companyName:  acc.company_name ?? null,
          direction:    'OUT',
          sourceType:   'SHAREHOLDER',
          sourceId:     String(settlement.id),
          sourceNo:     settlement.settlement_no,
          currencyCode: settlement.currency_code,
          amount:       amtOrig,
          balanceAfter: newBalance,
          remark:       settlement.remark ?? null,
          createdBy:    this.username(),
        });
        outTxnId = txn.id;

        // 更新 settlement.out_txn_id
        await qr.query(
          `UPDATE fin_shareholder_settlements SET out_txn_id = $1, updated_at = now() WHERE id = $2`,
          [outTxnId, id],
        );
      } else if (settlement.settlement_type === 'WRITE_OFF') {
        // WRITE_OFF 必须有 remark
        if (!settlement.remark) {
          throw new BadRequestException('核销类型必须填写说明（remark）');
        }
      }
      // OFFSET / TRANSFER：不走现金账户

      // 7. 更新 contribution 已还/余额
      const amtBase          = Number(settlement.amount_base);
      const newSettledOrig   = Number(contrib.settled_amount_original) + amtOrig;
      const newSettledBase   = Number(contrib.settled_amount_base) + amtBase;
      const newBalanceOrig   = Number(contrib.amount_original) - newSettledOrig;
      const newBalanceBase   = Number(contrib.amount_base) - newSettledBase;

      await qr.query(
        `UPDATE fin_shareholder_contributions
         SET settled_amount_original = $1, settled_amount_base = $2,
             balance_amount_original = $3, balance_amount_base = $4,
             updated_at = now()
         WHERE id = $5`,
        [newSettledOrig, newSettledBase, newBalanceOrig, newBalanceBase, contrib.id],
      );

      // 8. 重算 contribution status
      await this.contribSvc.recalcSettlementStatus(String(contrib.id), qr);

      // 9. settlement → SETTLED
      await qr.query(
        `UPDATE fin_shareholder_settlements
         SET status = 'SETTLED', updated_by = $1, updated_at = now()
         WHERE id = $2`,
        [this.username(), id],
      );

      // 10. 提交事务
      await qr.commitTransaction();

      const updated = await this.repo.findOne({ where: { id } });
      return updated!;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── 取消 ─────────────────────────────────────────────────────────────────

  async cancel(id: string, dto: CancelShareholderSettlementDto, user: any): Promise<void> {
    return this.ds.transaction(async mgr => {
      const row = await mgr.findOne(FinShareholderSettlementEntity, { where: { id } });
      if (!row) throw new NotFoundException(`还款记录 ID=${id} 不存在`);
      this.assertOwnership(row.companyCode, user);
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(row.status)) {
        throw new ConflictException(`当前状态 ${row.status} 不允许取消`);
      }

      await mgr.queryRunner!.query(
        `UPDATE fin_shareholder_settlements
         SET status = 'CANCELLED',
             remark = COALESCE($1, remark),
             updated_by = $2, updated_at = now()
         WHERE id = $3`,
        [dto.reason ?? null, this.username(), id],
      );
    });
  }
}
