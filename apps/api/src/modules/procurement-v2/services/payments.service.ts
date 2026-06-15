import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { format } from 'date-fns';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';

import { Prc2PaymentEntity }            from '../entities/prc2-payment.entity';
import { Prc2PaymentAllocationEntity }  from '../entities/prc2-payment-allocation.entity';
import { Prc2ApLedgerEntity }           from '../entities/prc2-ap-ledger.entity';
import { Prc2ApprovalEntity }           from '../entities/prc2-approval.entity';
import { Prc2ShareholderFundEntity }    from '../entities/prc2-shareholder-fund.entity';

import { CreatePaymentDto }            from '../dto/create-payment.dto';
import { UpdatePaymentDto }            from '../dto/update-payment.dto';
import { QueryPaymentDto }             from '../dto/query-payment.dto';
import { QueryShareholderFundsDto }    from '../dto/query-shareholder-funds.dto';
import { getMaskLevel, applyMask, applyMaskList, MaskFieldDef } from '../../../common/utils/mask.util';
import { DataScopeHelper } from '../../org/helpers/data-scope.helper';
import { DataScopeContext } from '../../org/services/data-scope.service';
// G85-B 付款→资金账户/财务流水/股东出资（统一经 finance-v2 官方写入口）
import { CashAccountsService } from '../../finance-v2/services/cash-accounts.service';
import { CashTransactionsService } from '../../finance-v2/services/cash-transactions.service';
import { ShareholderContributionsService } from '../../finance-v2/services/shareholder-contributions.service';

// ── 并发安全编号生成 ─────────────────────────────────────────────────────────
async function genNo(mgr: EntityManager, prefix: string, repo: { createQueryBuilder: Function }, alias: string, field: string): Promise<string> {
  await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
  const row = await mgr.createQueryBuilder(repo as never, alias)
    .select(`MAX(${alias}.${field})`, 'max')
    .where(`${alias}.${field} LIKE :p`, { p: `${prefix}%` })
    .getRawOne<{ max: string | null }>();
  let seq = 1;
  if (row?.max) { const last = parseInt(row.max.slice(prefix.length), 10); if (!isNaN(last)) seq = last + 1; }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Prc2PaymentEntity)           private payRepo:   Repository<Prc2PaymentEntity>,
    @InjectRepository(Prc2PaymentAllocationEntity) private allocRepo: Repository<Prc2PaymentAllocationEntity>,
    @InjectRepository(Prc2ApLedgerEntity)          private apRepo:    Repository<Prc2ApLedgerEntity>,
    @InjectRepository(Prc2ApprovalEntity)          private logRepo:   Repository<Prc2ApprovalEntity>,
    @InjectRepository(Prc2ShareholderFundEntity)   private fundRepo:  Repository<Prc2ShareholderFundEntity>,
    @InjectDataSource() private ds: DataSource,
    private cls: ClsService,
    private scopeHelper: DataScopeHelper,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly cashAccounts: CashAccountsService,        // G85-B
    private readonly cashTxns: CashTransactionsService,        // G85-B
    private readonly shareholderContribs: ShareholderContributionsService,  // G85-B
  ) {}

  // ── 内部工具 ──────────────────────────────────────────────────────────────

  private userId(): string {
    const u = this.cls.get('user');
    return String(u?.userId ?? u?.id ?? 0);
  }

  private userName(): string {
    const u = this.cls.get('user');
    return u?.name ?? u?.username ?? 'system';
  }

  private userRoles(): string[] {
    const u = this.cls.get('user');
    return u?.roles ?? (u?.role ? [u.role] : []);
  }

  // 付款单敏感字段定义
  private static readonly PAY_MASK_FIELDS: MaskFieldDef<any>[] = [
    { key: 'payerAccount',  type: 'bank_account' },
    { key: 'payeeAccount',  type: 'bank_account' },
    { key: 'shareholderName', type: 'name' },
  ];

  // 股东资金敏感字段定义
  private static readonly FUND_MASK_FIELDS: MaskFieldDef<any>[] = [
    { key: 'shareholderName', type: 'name' },
    { key: 'bankRef',         type: 'bank_account' },
  ];

  private async generatePayNo(mgr: EntityManager): Promise<string> {
    const prefix = `PAY2-${format(new Date(), 'yyyyMMdd')}-`;
    return genNo(mgr, prefix, Prc2PaymentEntity as never, 'p', 'payNo');
  }

  private async generateFundNo(mgr: EntityManager): Promise<string> {
    const prefix = `SF2-${format(new Date(), 'yyyyMMdd')}-`;
    return genNo(mgr, prefix, Prc2ShareholderFundEntity as never, 'f', 'fundNo');
  }

  private async writeLog(mgr: EntityManager, opts: {
    bizType: string; bizId: string; bizNo: string;
    node: string; action: string; comment?: string;
  }) {
    await mgr.save(Prc2ApprovalEntity, mgr.create(Prc2ApprovalEntity, {
      bizType:      opts.bizType,
      bizId:        opts.bizId,
      bizNo:        opts.bizNo,
      approvalNode: opts.node,
      action:       opts.action,
      approverId:   this.userId(),
      approverName: this.userName(),
      comment:      opts.comment,
    }));
  }

  private sumAllocations(allocs: { allocatedAmountOriginal: number; allocatedAmountBase?: number }[]) {
    return {
      totalOriginal: allocs.reduce((s, a) => s + Number(a.allocatedAmountOriginal), 0),
      totalBase:     allocs.reduce((s, a) => s + Number(a.allocatedAmountBase ?? 0), 0),
    };
  }

  // ── 列表 ──────────────────────────────────────────────────────────────────

  async list(q: QueryPaymentDto) {
    const page     = Math.max(1, parseInt(q.page     ?? '1', 10));
    const pageSize = Math.max(1, parseInt(q.pageSize ?? '20', 10));

    const qb = this.payRepo.createQueryBuilder('p').orderBy('p.id', 'DESC');

    if (q.companyCode)     qb.andWhere('p.companyCode     = :cc',  { cc:  q.companyCode });
    if (q.projectCode)     qb.andWhere('p.projectCode     = :pc',  { pc:  q.projectCode });
    if (q.payerType)       qb.andWhere('p.payerType       = :pt',  { pt:  q.payerType });
    if (q.shareholderId)   qb.andWhere('p.shareholderId   = :si',  { si:  q.shareholderId });
    if (q.status)          qb.andWhere('p.status          = :st',  { st:  q.status });
    if (q.currencyCode)    qb.andWhere('p.currencyCode    = :cur', { cur: q.currencyCode });
    if (q.paymentDateFrom) qb.andWhere('p.paymentDate    >= :df',  { df:  q.paymentDateFrom });
    if (q.paymentDateTo)   qb.andWhere('p.paymentDate    <= :dt',  { dt:  q.paymentDateTo });
    if (q.keyword)         qb.andWhere(
      '(p.payNo ILIKE :kw OR p.payerName ILIKE :kw OR p.remark ILIKE :kw)',
      { kw: `%${q.keyword}%` },
    );

    // ── RBAC-2 数据范围过滤 ──────────────────────────────────────────────────
    this.scopeHelper.applyToQb(qb, { alias: 'p' });
    // ────────────────────────────────────────────────────────────────────────

    const [items, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const maskLevel = getMaskLevel(this.userRoles());
    return { items: applyMaskList(items as any[], PaymentsService.PAY_MASK_FIELDS, maskLevel), total, page, pageSize };
  }

  // ── 详情 ──────────────────────────────────────────────────────────────────

  async findById(id: string) {
    const pay = await this.payRepo.findOne({ where: { id } });
    if (!pay) throw new NotFoundException(`付款单 ID=${id} 不存在`);

    // ── RBAC-2.5 详情归属校验 ────────────────────────────────────────────────
    this.scopeHelper.assertOwnership(
      { companyCode: pay.companyCode, projectCode: pay.projectCode },
      'Payment',
    );
    // ─────────────────────────────────────────────────────────────────────────

    const [allocations, approvals] = await Promise.all([
      this.allocRepo.find({ where: { paymentId: id }, order: { id: 'ASC' } }),
      this.logRepo.find({ where: { bizId: id, bizType: 'PAYMENT' }, order: { id: 'ASC' } }),
    ]);
    const maskLevel = getMaskLevel(this.userRoles());
    const maskedPay = applyMask({ ...pay } as any, PaymentsService.PAY_MASK_FIELDS, maskLevel);
    return { ...maskedPay, allocations, approvals };
  }

  // ── 创建 ──────────────────────────────────────────────────────────────────

  async create(dto: CreatePaymentDto) {
    return this.ds.transaction(async mgr => {
      const payNo = await this.generatePayNo(mgr);
      const { totalOriginal, totalBase } = this.sumAllocations(dto.allocations);

      const pay = mgr.create(Prc2PaymentEntity, {
        payNo,
        paymentDate:          dto.paymentDate,
        companyId:            dto.companyId,
        companyCode:          dto.companyCode,
        companyName:          dto.companyName,
        projectId:            dto.projectId,
        projectCode:          dto.projectCode,
        projectName:          dto.projectName,
        payerType:            dto.payerType,
        payerId:              dto.payerId,
        payerName:            dto.payerName,
        payerAccount:         dto.payerAccount,
        payeeType:            dto.payeeType,
        payeeId:              dto.payeeId,
        payeeName:            dto.payeeName,
        payeeAccount:         dto.payeeAccount,
        currencyCode:         dto.currencyCode,
        amountOriginal:       totalOriginal,
        exchangeRate:         dto.exchangeRate,
        amountBase:           dto.amountBase ?? totalBase,
        baseCurrency:         dto.baseCurrency ?? 'CNY',
        paymentMethod:        dto.paymentMethod,
        fundNature:           dto.fundNature,
        isShareholderPayment: dto.isShareholderPayment ?? false,
        shareholderId:        dto.shareholderId,
        shareholderName:      dto.shareholderName,
        voucherUrl:           dto.voucherUrl,
        remark:               dto.remark,
        status:               'DRAFT',
        createdBy:            this.userId(),
      });

      const saved = await mgr.save(Prc2PaymentEntity, pay);

      await this.saveAllocations(mgr, saved.id, dto.allocations, dto.exchangeRate);

      return saved;
    });
  }

  // ── 编辑（仅 DRAFT） ───────────────────────────────────────────────────────

  async update(id: string, dto: UpdatePaymentDto) {
    return this.ds.transaction(async mgr => {
      const pay = await mgr.findOne(Prc2PaymentEntity, { where: { id } });
      if (!pay) throw new NotFoundException(`付款单 ID=${id} 不存在`);
      if (pay.status !== 'DRAFT') throw new ConflictException('仅 DRAFT 状态可编辑');

      Object.assign(pay, {
        ...(dto.paymentDate          !== undefined && { paymentDate:          dto.paymentDate }),
        ...(dto.companyId            !== undefined && { companyId:            dto.companyId }),
        ...(dto.companyCode          !== undefined && { companyCode:          dto.companyCode }),
        ...(dto.companyName          !== undefined && { companyName:          dto.companyName }),
        ...(dto.projectId            !== undefined && { projectId:            dto.projectId }),
        ...(dto.projectCode          !== undefined && { projectCode:          dto.projectCode }),
        ...(dto.projectName          !== undefined && { projectName:          dto.projectName }),
        ...(dto.payerType            !== undefined && { payerType:            dto.payerType }),
        ...(dto.payerId              !== undefined && { payerId:              dto.payerId }),
        ...(dto.payerName            !== undefined && { payerName:            dto.payerName }),
        ...(dto.payerAccount         !== undefined && { payerAccount:         dto.payerAccount }),
        ...(dto.payeeType            !== undefined && { payeeType:            dto.payeeType }),
        ...(dto.payeeId              !== undefined && { payeeId:              dto.payeeId }),
        ...(dto.payeeName            !== undefined && { payeeName:            dto.payeeName }),
        ...(dto.payeeAccount         !== undefined && { payeeAccount:         dto.payeeAccount }),
        ...(dto.currencyCode         !== undefined && { currencyCode:         dto.currencyCode }),
        ...(dto.exchangeRate         !== undefined && { exchangeRate:         dto.exchangeRate }),
        ...(dto.baseCurrency         !== undefined && { baseCurrency:         dto.baseCurrency }),
        ...(dto.paymentMethod        !== undefined && { paymentMethod:        dto.paymentMethod }),
        ...(dto.fundNature           !== undefined && { fundNature:           dto.fundNature }),
        ...(dto.isShareholderPayment !== undefined && { isShareholderPayment: dto.isShareholderPayment }),
        ...(dto.shareholderId        !== undefined && { shareholderId:        dto.shareholderId }),
        ...(dto.shareholderName      !== undefined && { shareholderName:      dto.shareholderName }),
        ...(dto.voucherUrl           !== undefined && { voucherUrl:           dto.voucherUrl }),
        ...(dto.remark               !== undefined && { remark:               dto.remark }),
      });

      if (dto.allocations) {
        const { totalOriginal, totalBase } = this.sumAllocations(dto.allocations);
        pay.amountOriginal = totalOriginal;
        pay.amountBase     = dto.amountBase ?? totalBase;
        await mgr.delete(Prc2PaymentAllocationEntity, { paymentId: id });
        await this.saveAllocations(mgr, id, dto.allocations, pay.exchangeRate);
      } else if (dto.amountBase !== undefined) {
        pay.amountBase = dto.amountBase;
      }

      return mgr.save(Prc2PaymentEntity, pay);
    });
  }

  // ── 提交审批 ──────────────────────────────────────────────────────────────

  async submit(id: string, dto: { comment?: string }) {
    return this.ds.transaction(async mgr => {
      const pay = await mgr.findOne(Prc2PaymentEntity, { where: { id } });
      if (!pay) throw new NotFoundException(`付款单 ID=${id} 不存在`);
      if (pay.status !== 'DRAFT') throw new ConflictException(`当前状态 ${pay.status} 不允许提交`);

      // ── 启动审批引擎 ────────────────────────────────────────────
      pay.status = 'PENDING_APPROVAL';
      await mgr.save(Prc2PaymentEntity, pay);

      await this.approvalEngine.startApproval({
        moduleCode:   'MENU_PRC2_PAYMENT',
        bizType:      'PAYMENT',
        bizId:        id,
        bizNo:        pay.payNo,
        // G145：?? 不拦 0——若 amountBase 存成 0 会让审批金额显示 0。改用 || 链优先取真实金额
        //   （amountOriginal 由分摊派生、恒为正），避免赵永伟审批时看到金额 0。
        amount:       Number(pay.amountBase) || Number(pay.amountOriginal) || 0,
        currencyCode: pay.currencyCode,
        companyCode:  pay.companyCode,
        companyName:  pay.companyName,
        projectCode:  pay.projectCode,
        subject:      pay.remark ?? pay.payNo,
      }, mgr);
      // ─────────────────────────────────────────────────────────────

      await this.writeLog(mgr, { bizType: 'PAYMENT', bizId: id, bizNo: pay.payNo, node: 'SUBMIT', action: 'SUBMIT', comment: dto.comment });
      return pay;
    });
  }

  // ── 审批通过 ──────────────────────────────────────────────────────────────

  /** @deprecated 请使用 /api/approval/instances/:id/approve 接口 */
  async approve(id: string, dto: { comment?: string }) {
    return this.ds.transaction(async mgr => {
      const pay = await mgr.findOne(Prc2PaymentEntity, { where: { id } });
      if (!pay) throw new NotFoundException(`付款单 ID=${id} 不存在`);
      if (!['SUBMITTED', 'PENDING_APPROVAL'].includes(pay.status)) throw new ConflictException(`当前状态 ${pay.status} 不允许审批`);
      pay.status = 'APPROVED';
      await mgr.save(Prc2PaymentEntity, pay);
      await this.writeLog(mgr, { bizType: 'PAYMENT', bizId: id, bizNo: pay.payNo, node: 'APPROVE', action: 'APPROVE', comment: dto.comment });
      return pay;
    });
  }

  // ── 付款确认（核心：AP 核销 + 股东资金） ──────────────────────────────────

  async pay(id: string, dto: { comment?: string }) {
    return this.ds.transaction(async mgr => {
      const pay = await mgr.findOne(Prc2PaymentEntity, { where: { id } });
      if (!pay) throw new NotFoundException(`付款单 ID=${id} 不存在`);
      if (pay.status === 'PAID') throw new ConflictException('该付款单已执行，不可重复付款');
      if (pay.status !== 'APPROVED') throw new ConflictException(`当前状态 ${pay.status} 不允许执行付款`);

      // ── G85-B 公司付款必经资金账户（主数据校验 + 行锁；股东代付不扣公司账户）──
      const isShareholderPay = pay.isShareholderPayment || pay.payerType === 'SHAREHOLDER';
      let cashAcc: {
        id: string; account_code: string; account_name: string;
        company_code: string; company_name: string | null;
        currency_code: string; current_balance: string; status: string;
      } | null = null;
      if (!isShareholderPay) {
        const accCode = (pay.payerAccount ?? '').trim();
        if (!accCode) {
          throw new BadRequestException('公司付款必须选择付款资金账户（从资金账户主数据中选择）');
        }
        const rows = await mgr.query(
          `SELECT id, account_code, account_name, company_code, company_name,
                  currency_code, current_balance, status
             FROM fin_cash_accounts WHERE account_code = $1 FOR UPDATE`,
          [accCode],
        );
        if (rows.length === 0) {
          throw new BadRequestException(`付款账户「${accCode}」不存在——请从资金账户主数据中选择，禁止手填`);
        }
        cashAcc = rows[0];
        if ((cashAcc!.status ?? 'ACTIVE') !== 'ACTIVE') {
          throw new BadRequestException(`付款账户 ${accCode} 当前状态 ${cashAcc!.status}，不允许付款`);
        }
        if (cashAcc!.company_code !== pay.companyCode) {
          throw new BadRequestException(
            `付款账户属于公司 ${cashAcc!.company_code}，与付款单公司 ${pay.companyCode} 不一致——禁止跨公司扣款`,
          );
        }
        if (cashAcc!.currency_code !== pay.currencyCode) {
          throw new BadRequestException(
            `付款账户币种 ${cashAcc!.currency_code} 与付款币种 ${pay.currencyCode} 不一致`,
          );
        }
        const payAmt = Number(pay.amountOriginal);
        if (Number(cashAcc!.current_balance) < payAmt - 0.005) {
          throw new BadRequestException(
            `付款账户余额不足：当前 ${cashAcc!.current_balance} ${cashAcc!.currency_code}，本次付款 ${payAmt}`,
          );
        }
      }

      const allocs = await mgr.find(Prc2PaymentAllocationEntity, { where: { paymentId: id } });

      // ── 核销每条 AP ────────────────────────────────────────────────────────
      for (const alloc of allocs) {
        if (!alloc.apId) continue;

        const ap = await mgr.findOne(Prc2ApLedgerEntity, { where: { id: alloc.apId } });
        if (!ap) throw new NotFoundException(`AP 台账 ID=${alloc.apId} 不存在`);

        const newPaid    = Number(ap.paidAmountOriginal)  + Number(alloc.allocatedAmountOriginal);
        const newBalance = Number(ap.amountOriginal)      - newPaid;

        if (newBalance < -0.005) {
          throw new BadRequestException(
            `AP ${ap.apNo} 超额付款：应付 ${ap.amountOriginal}，已付 ${ap.paidAmountOriginal}，本次分摊 ${alloc.allocatedAmountOriginal}`,
          );
        }

        const newStatus = newBalance <= 0.005 ? 'PAID' : 'PARTIALLY_PAID';

        await mgr.update(Prc2ApLedgerEntity, { id: alloc.apId }, {
          paidAmountOriginal:  newPaid,
          balanceAmountOriginal: Math.max(0, newBalance),
          status: newStatus,
        });
      }

      // ── 更新付款状态 ────────────────────────────────────────────────────────
      pay.status = 'PAID';
      await mgr.save(Prc2PaymentEntity, pay);

      // ── 写审批日志 ──────────────────────────────────────────────────────────
      await this.writeLog(mgr, { bizType: 'PAYMENT', bizId: id, bizNo: pay.payNo, node: 'PAY', action: 'PAY', comment: dto.comment });

      // ── G85-B 公司付款：扣资金账户 + 写财务流水（同事务，官方写入口）──────────
      if (cashAcc) {
        const qr = mgr.queryRunner!;
        const payAmt = Number(pay.amountOriginal);
        const newBalance = await this.cashAccounts.applyBalance(qr, cashAcc.id, -payAmt, this.userId());
        await this.cashTxns.writeTransaction({
          qr,
          accountId:    cashAcc.id,
          accountCode:  cashAcc.account_code,
          accountName:  cashAcc.account_name,
          companyCode:  cashAcc.company_code,
          companyName:  cashAcc.company_name,
          direction:    'OUT',
          sourceType:   'AP_PAYMENT',
          sourceId:     pay.id,
          sourceNo:     pay.payNo,
          currencyCode: pay.currencyCode,
          amount:       payAmt,
          balanceAfter: newBalance,
          remark:       `采购付款 ${pay.payNo}（供应商 ${pay.payeeName ?? ''}）`,
          createdBy:    this.userId(),
        });
      }

      // ── 股东资金：若股东代付则记录资金池 ─────────────────────────────────────
      if (pay.isShareholderPayment || pay.payerType === 'SHAREHOLDER') {
        const fundNo = await this.generateFundNo(mgr);

        // 如有多条 allocation，每条写一条 fund 记录（关联各自 PO）
        if (allocs.length > 0) {
          for (const alloc of allocs) {
            const fn2 = await this.generateFundNo(mgr);
            await mgr.insert(Prc2ShareholderFundEntity, {
              fundNo:           fn2,
              shareholderId:    pay.shareholderId ?? pay.payerId,
              shareholderName:  pay.shareholderName ?? pay.payerName,
              companyId:        alloc.companyId   ?? pay.companyId,
              companyCode:      alloc.companyCode ?? pay.companyCode,
              companyName:      alloc.companyName ?? pay.companyName,
              projectId:        alloc.projectId   ?? pay.projectId,
              projectCode:      alloc.projectCode ?? pay.projectCode,
              projectName:      alloc.projectName ?? pay.projectName,
              sourceType:       'PAYMENT',
              fundNature:       pay.fundNature ?? 'ADVANCE',
              currencyCode:     pay.currencyCode,
              exchangeRate:     pay.exchangeRate,
              amountOriginal:   Number(alloc.allocatedAmountOriginal),
              amountBase:       Number(alloc.allocatedAmountBase ?? 0),
              baseCurrency:     pay.baseCurrency,
              relatedPaymentId: pay.id,
              relatedPoId:      alloc.poId,
              relatedPoNo:      alloc.poNo,
              occurredDate:     pay.paymentDate,
              status:           'CONFIRMED',
              remark:           pay.remark,
              createdBy:        this.userId(),
            });
          }
        } else {
          // 无 allocation 但仍是股东付款 → 写整体一条
          await mgr.insert(Prc2ShareholderFundEntity, {
            fundNo,
            shareholderId:   pay.shareholderId ?? pay.payerId,
            shareholderName: pay.shareholderName ?? pay.payerName,
            companyId:       pay.companyId,
            companyCode:     pay.companyCode,
            companyName:     pay.companyName,
            projectId:       pay.projectId,
            projectCode:     pay.projectCode,
            projectName:     pay.projectName,
            sourceType:      'PAYMENT',
            fundNature:      pay.fundNature ?? 'ADVANCE',
            currencyCode:    pay.currencyCode,
            exchangeRate:    pay.exchangeRate,
            amountOriginal:  Number(pay.amountOriginal),
            amountBase:      Number(pay.amountBase),
            baseCurrency:    pay.baseCurrency,
            relatedPaymentId: pay.id,
            occurredDate:    pay.paymentDate,
            status:          'CONFIRMED',
            remark:          pay.remark,
            createdBy:       this.userId(),
          });
        }

        // ── G85-B 股东代付 → 财务侧股东出资台账（CONFIRMED，幂等；同事务）────
        //    付款单已走采购审批链，不再重复走出资审批。
        await this.shareholderContribs.createFromPayment(mgr.queryRunner!, {
          paymentId:       pay.id,
          payNo:           pay.payNo,
          shareholderId:   pay.shareholderId ?? pay.payerId ?? null,
          shareholderName: pay.shareholderName ?? pay.payerName ?? '未知股东',
          companyCode:     pay.companyCode,
          companyName:     pay.companyName,
          projectCode:     pay.projectCode,
          projectName:     pay.projectName,
          fundNature:      pay.fundNature ?? 'ADVANCE',
          currencyCode:    pay.currencyCode,
          amountOriginal:  Number(pay.amountOriginal),
          exchangeRate:    Number(pay.exchangeRate ?? 1),
          amountBase:      Number(pay.amountBase ?? 0) || undefined,
          baseCurrency:    pay.baseCurrency,
          remark:          `采购股东代付 ${pay.payNo}`,
          createdBy:       this.userId(),
        });
      }

      return pay;
    });
  }

  // ── 取消 ──────────────────────────────────────────────────────────────────

  async cancel(id: string, dto: { comment?: string }) {
    return this.ds.transaction(async mgr => {
      const pay = await mgr.findOne(Prc2PaymentEntity, { where: { id } });
      if (!pay) throw new NotFoundException(`付款单 ID=${id} 不存在`);
      // G144：仅"已执行付款(PAID)"不可取消；DRAFT/SUBMITTED/PENDING_APPROVAL/APPROVED（未实际出款）均可取消
      //   —— 已审批但未付款的单据，业务上发现错误/改主意时应允许撤销，原仅允许 DRAFT/SUBMITTED 过严。
      if (pay.status === 'PAID') throw new ConflictException('已执行付款不允许取消');
      if (pay.status === 'CANCELLED') throw new ConflictException('该付款单已取消');
      if (!['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED'].includes(pay.status)) {
        throw new ConflictException(`当前状态 ${pay.status} 不允许取消`);
      }
      pay.status = 'CANCELLED';
      await mgr.save(Prc2PaymentEntity, pay);
      await this.writeLog(mgr, { bizType: 'PAYMENT', bizId: id, bizNo: pay.payNo, node: 'CANCEL', action: 'CANCEL', comment: dto.comment });
      return pay;
    });
  }

  // ── 分摊明细 ──────────────────────────────────────────────────────────────

  async getAllocations(id: string) {
    const pay = await this.payRepo.findOne({ where: { id } });
    if (!pay) throw new NotFoundException(`付款单 ID=${id} 不存在`);
    return this.allocRepo.find({ where: { paymentId: id }, order: { id: 'ASC' } });
  }

  // ── 未核销 AP 列表（用于付款时选择） ──────────────────────────────────────

  async listOpenAp(companyCode?: string, supplierCode?: string, projectCode?: string, keyword?: string) {
    const qb = this.apRepo.createQueryBuilder('ap')
      .where('ap.balanceAmountOriginal > 0')
      .andWhere("ap.status IN ('OPEN','PARTIALLY_PAID')")
      .orderBy('ap.dueDate', 'ASC');

    if (companyCode)  qb.andWhere('ap.companyCode  = :cc',  { cc:  companyCode });
    if (supplierCode) qb.andWhere('ap.supplierCode = :sc',  { sc:  supplierCode });
    if (projectCode)  qb.andWhere('ap.projectCode  = :pc',  { pc:  projectCode });
    if (keyword)      qb.andWhere('(ap.apNo ILIKE :kw OR ap.supplierName ILIKE :kw OR ap.poNo ILIKE :kw)', { kw: `%${keyword}%` });

    // ── RBAC-3.1 数据范围过滤 ────────────────────────────────────────────────
    this.scopeHelper.applyToQb(qb, { alias: 'ap' });
    // ────────────────────────────────────────────────────────────────────────

    return qb.getMany();
  }

  // ── 股东资金池查询 ────────────────────────────────────────────────────────

  async listShareholderFunds(q: QueryShareholderFundsDto) {
    const page     = Math.max(1, parseInt(q.page     ?? '1', 10));
    const pageSize = Math.max(1, parseInt(q.pageSize ?? '20', 10));

    const applyFilters = (qb: ReturnType<typeof this.fundRepo.createQueryBuilder>) => {
      if (q.shareholderId) qb.andWhere('f.shareholderId = :si',  { si:  q.shareholderId });
      if (q.companyCode)   qb.andWhere('f.companyCode   = :cc',  { cc:  q.companyCode });
      if (q.projectCode)   qb.andWhere('f.projectCode   = :pc',  { pc:  q.projectCode });
      if (q.fundNature)    qb.andWhere('f.fundNature    = :fn',  { fn:  q.fundNature });
      if (q.currencyCode)  qb.andWhere('f.currencyCode  = :cur', { cur: q.currencyCode });
      if (q.dateFrom)      qb.andWhere('f.occurredDate >= :df',  { df:  q.dateFrom });
      if (q.dateTo)        qb.andWhere('f.occurredDate <= :dt',  { dt:  q.dateTo });
      return qb;
    };

    const fundQb = applyFilters(
      this.fundRepo.createQueryBuilder('f').orderBy('f.id', 'DESC'),
    );

    // ── RBAC-3.1 数据范围过滤 ────────────────────────────────────────────────
    // SELF scope（ROLE_SHAREHOLDER_VIEW）：只能查看自己名下的股东资金
    // 其余 scope：按公司/项目范围过滤
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (scope && !scope.isGlobal && scope.scopeLevel === 'SELF') {
      // 按 shareholderId = 当前用户 id 隔离（避免泄露他人资金记录）
      fundQb.andWhere('f.shareholderId = :selfUserId', { selfUserId: scope.userId });
    } else {
      this.scopeHelper.applyToQb(fundQb, { alias: 'f' });
    }
    // ────────────────────────────────────────────────────────────────────────

    const [items, total] = await fundQb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();

    const summary = await applyFilters(
      this.fundRepo.createQueryBuilder('f'),
    )
      .select('f.fundNature', 'fundNature')
      .addSelect('f.currencyCode', 'currencyCode')
      .addSelect('SUM(f.amountOriginal)', 'totalOriginal')
      .addSelect('SUM(f.amountBase)',     'totalBase')
      .groupBy('f.fundNature, f.currencyCode')
      .getRawMany<{ fundNature: string; currencyCode: string; totalOriginal: string; totalBase: string }>();

    const maskLevel = getMaskLevel(this.userRoles());
    return {
      items: applyMaskList(items as any[], PaymentsService.FUND_MASK_FIELDS, maskLevel),
      total, page, pageSize, summary,
    };
  }

  // ── 私有：保存 allocations ────────────────────────────────────────────────

  private async saveAllocations(
    mgr: EntityManager,
    paymentId: string,
    allocs: CreatePaymentDto['allocations'],
    exchangeRate: number,
  ) {
    const rows = allocs.map(a => mgr.create(Prc2PaymentAllocationEntity, {
      paymentId,
      poId:                    a.poId,
      poNo:                    a.poNo,
      apId:                    a.apId,
      apNo:                    a.apNo,
      companyId:               a.companyId,
      companyCode:             a.companyCode,
      companyName:             a.companyName,
      projectId:               a.projectId,
      projectCode:             a.projectCode,
      projectName:             a.projectName,
      allocatedAmountOriginal: a.allocatedAmountOriginal,
      allocatedAmountBase:     a.allocatedAmountBase ?? (Number(a.allocatedAmountOriginal) * Number(exchangeRate)),
      remark:                  a.remark,
    }));
    await mgr.save(Prc2PaymentAllocationEntity, rows);
  }
}
