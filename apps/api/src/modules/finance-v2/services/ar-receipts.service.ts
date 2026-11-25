import {
  Injectable, Logger, NotFoundException,
  ForbiddenException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import { ClsService }       from 'nestjs-cls';
import type { DataScopeContext } from '../../org/services/data-scope.service';
import {
  CreateArReceiptDto,
  ConfirmArReceiptDto,
  CancelArReceiptDto,
  QueryArReceiptDto,
  ArReceiptAllocationDto,
} from '../dto/ar-receipt.dto';
import { ArInvoicesService }     from './ar-invoices.service';
import { CashAccountsService }   from './cash-accounts.service';
import { flockMoneyCents, flockMoneyNumber, isFlockArNumber } from './flock-ar-receipts';
import { CashTransactionsService } from './cash-transactions.service';

/**
 * ArReceiptsService — Finance V2 Phase 2 AR Runtime
 *
 * 收款记录 + 核销分摊。
 *
 * 核心约束：
 *   - 总分摊金额 ≤ 收款金额
 *   - 每条 AR 分摊 ≤ AR 当前余额
 *   - confirm() 全程事务（QueryRunner）
 *   - CONFIRMED 收款不可取消（Phase 3 再支持冲销）
 *   - balance_amount_original DDL CHECK >= 0 双重兜底
 */
@Injectable()
export class ArReceiptsService {
  private readonly logger = new Logger(ArReceiptsService.name);

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly arInvoicesSvc: ArInvoicesService,
    private readonly cashAccSvc: CashAccountsService,
    private readonly cashTxnSvc: CashTransactionsService,
  ) {}

  // ── 内部工具 ──────────────────────────────────────────────────────────────

  private currentUser() {
    const u = this.cls.get('user') as any;
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    return {
      userId:       String(u?.userId ?? u?.id ?? '0'),
      companyCodes: (scope?.allowedCompanyCodes ?? u?.companyCodes ?? []) as string[],
      projectCodes: (scope?.allowedProjectCodes ?? u?.projectCodes ?? []) as string[],
      scopeLevel:   scope?.scopeLevel ?? u?.scopeLevel ?? 'SELF',
      scopeAll:     scope ? !!scope.isGlobal : !!(u?.scopeAll),
    };
  }

  private assertWritableOwnership(companyCode?: string | null, projectCode?: string | null): void {
    const user = this.currentUser();
    if (user.scopeAll) return;
    if (!companyCode) throw new ForbiddenException('无权写入 AR Receipt（缺少公司归属）');
    if (!user.companyCodes.length) throw new ForbiddenException('无权写入 AR Receipt（数据范围未配置）');
    if (!user.companyCodes.includes(companyCode)) {
      throw new ForbiddenException(`无权写入公司 ${companyCode} 的 AR Receipt`);
    }
    if (user.scopeLevel === 'PROJECT' && user.projectCodes.length > 0) {
      if (!projectCode) throw new ForbiddenException('无权写入 AR Receipt（缺少项目归属）');
      if (!user.projectCodes.includes(projectCode)) {
        throw new ForbiddenException(`无权写入项目 ${projectCode} 的 AR Receipt`);
      }
    }
  }

  /** 生成收款编号 RCP-YYYYMM-XXXXX */
  private async genReceiptNo(): Promise<string> {
    const ym     = new Date().toISOString().slice(0, 7).replace('-', '');
    const prefix = `RCP-${ym}-`;
    const row    = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM fin_ar_receipts WHERE receipt_no LIKE $1`,
      [`${prefix}%`],
    );
    const seq = String(Number(row[0]?.cnt ?? 0) + 1).padStart(5, '0');
    return `${prefix}${seq}`;
  }

  /** DataScope 过滤条件 */
  private scopeConditions(params: any[]): string[] {
    const user = this.currentUser();
    if (user.scopeAll) return [];
    if (user.companyCodes.length === 0) return ['1=0'];
    params.push(user.companyCodes);
    const conds = [`r.company_code = ANY($${params.length}::text[])`];
    if (user.scopeLevel==='PROJECT') conds.push("r.receipt_no NOT LIKE 'FR-%'");
    if (user.scopeLevel === 'PROJECT' && user.projectCodes.length > 0) {
      params.push(user.projectCodes);
      conds.push(`r.project_code = ANY($${params.length}::text[])`);
    }
    return conds;
  }

  /** assertOwnership for receipt */
  private async assertReceiptOwnership(receiptId: string): Promise<any> {
    const rows = await this.ds.query(
      `SELECT id, receipt_no, company_code, project_code, status, amount_original, currency_code,
              exchange_rate, received_account_code, customer_name,customer_code,base_currency,amount_base
       FROM fin_ar_receipts WHERE id = $1`,
      [receiptId],
    );
    if (!rows.length) throw new NotFoundException(`AR Receipt #${receiptId} 不存在`);
    const rec  = rows[0];
    const user = this.currentUser();
    if (!user.scopeAll && user.scopeLevel==='PROJECT' && String(rec.receipt_no).startsWith('FR-')) {
      throw new ForbiddenException('无权访问公司级鸡群收款');
    }
    if (!user.scopeAll && user.companyCodes.length === 0) {
      throw new ForbiddenException('无权访问 AR Receipt（数据范围未配置）');
    }
    if (!user.scopeAll && !user.companyCodes.includes(rec.company_code)) {
      throw new ForbiddenException(`无权访问公司 ${rec.company_code} 的 AR Receipt`);
    }
    if (!user.scopeAll && user.scopeLevel === 'PROJECT' && user.projectCodes.length > 0 &&
        !user.projectCodes.includes(rec.project_code)) {
      throw new ForbiddenException(`无权访问项目 ${rec.project_code ?? '(未指定)'} 的 AR Receipt`);
    }
    return rec;
  }

  // ── 1. 收款列表 ───────────────────────────────────────────────────────────

  async list(q: QueryArReceiptDto) {
    const page     = Math.max(1, q.page     ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const offset   = (page - 1) * pageSize;
    const params: any[] = [];
    const conditions: string[] = ['1=1'];

    // DataScope
    conditions.push(...this.scopeConditions(params));

    if (q.companyCode)  { params.push(q.companyCode);  conditions.push(`r.company_code  = $${params.length}`); }
    if (q.customerCode) { params.push(q.customerCode); conditions.push(`r.customer_code = $${params.length}`); }
    if (q.status)       { params.push(q.status);       conditions.push(`r.status        = $${params.length}`); }
    if (q.dateFrom)     { params.push(q.dateFrom);     conditions.push(`r.receipt_date  >= $${params.length}`); }
    if (q.dateTo)       { params.push(q.dateTo);       conditions.push(`r.receipt_date  <= $${params.length}`); }
    if (q.keyword) {
      params.push(`%${q.keyword}%`);
      conditions.push(
        `(r.receipt_no ILIKE $${params.length} OR r.customer_name ILIKE $${params.length} OR r.bank_ref ILIKE $${params.length})`,
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countParams = [...params];
    params.push(pageSize, offset);

    const [rows, countRow] = await Promise.all([
      this.ds.query(
        `SELECT r.id, r.receipt_no, r.company_code, r.company_name,
                r.customer_code, r.customer_name, r.receipt_date,
                r.currency_code, r.amount_original, r.exchange_rate,
                r.receipt_method, r.bank_ref, r.status, r.remark, r.created_at
         FROM fin_ar_receipts r
         ${where}
         ORDER BY r.receipt_date DESC, r.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      this.ds.query(
        `SELECT COUNT(*)::int AS cnt FROM fin_ar_receipts r ${where}`,
        countParams,
      ),
    ]);

    return {
      items: rows,
      total: Number(countRow[0]?.cnt ?? 0),
      page,
      pageSize,
    };
  }

  // ── 2. 收款详情 ───────────────────────────────────────────────────────────

  async findById(id: string) {
    const rec = await this.assertReceiptOwnership(id);
    const allocs = await this.ds.query(
      `SELECT a.id, a.ar_invoice_id, a.ar_no,
              a.allocated_amount_original, a.currency_code, a.created_at,
              i.customer_name, i.invoice_date, i.status AS ar_status
       FROM fin_ar_receipt_allocations a
       JOIN fin_ar_invoices i ON i.id = a.ar_invoice_id
       WHERE a.receipt_id = $1
       ORDER BY a.created_at`,
      [id],
    );
    const fullRec = await this.ds.query(`SELECT * FROM fin_ar_receipts WHERE id = $1`, [id]);
    return { ...fullRec[0], allocations: allocs };
  }

  // ── 3. 创建收款草稿 ───────────────────────────────────────────────────────

  async create(dto: CreateArReceiptDto) {
    const user      = this.currentUser();
    this.assertWritableOwnership(dto.companyCode, dto.projectCode);
    let dedicated: string | undefined;
    if (dto.flockInvoiceId!==undefined || dto.paymentKey!==undefined) {
      const id=dto.flockInvoiceId ?? '';
      const key=dto.paymentKey ?? '';
      if (!/^[1-9][0-9]{0,18}$/.test(id) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(key)) {
        throw new BadRequestException('交付收款须绑定应收和原支付请求编号');
      }
      if (!user.scopeAll && user.scopeLevel==='PROJECT') throw new ForbiddenException('交付收款须由公司范围财务办理');
      const [invoice]=await this.ds.query('SELECT ar_no,company_code,customer_code,currency_code FROM fin_ar_invoices WHERE id=$1',[id]);
      if (!invoice || !isFlockArNumber(invoice.ar_no) || invoice.company_code!==dto.companyCode
        || invoice.customer_code!==dto.customerCode || invoice.currency_code!==dto.currencyCode) {
        throw new BadRequestException('交付应收和收款身份不一致');
      }
      const amount=flockMoneyCents(dto.amountOriginal);
      if (amount===0n || dto.projectCode?.trim() || !dto.receivedAccountCode?.trim() || dto.baseCurrency!==dto.currencyCode
        || Number(dto.exchangeRate ?? 1)!==1 || (dto.amountBase!==undefined && flockMoneyCents(dto.amountBase)!==amount)
        || !/^\d{4}-\d{2}-\d{2}$/.test(dto.receiptDate)) {
        throw new BadRequestException('交付收款须按原币提交，并指定业务日和资金账户');
      }
      dedicated='FR-' + id + '-' + createHash('sha256').update(key).digest('hex').slice(0,32);
    }
    const receiptNo = dedicated ?? await this.genReceiptNo();
    const exRate    = dto.exchangeRate ?? 1;
    const amtBase   = dedicated ? dto.amountOriginal : dto.amountBase ?? Math.round(dto.amountOriginal * exRate * 100) / 100;

    await this.ds.query(
      `INSERT INTO fin_ar_receipts (
         receipt_no, company_code, company_name, project_code, project_name,
         customer_id, customer_code, customer_name,
         receipt_date, currency_code, amount_original, exchange_rate, amount_base, base_currency,
         receipt_method, received_account_code, bank_ref,
         status, remark, created_by, updated_by
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$7,$8,
         $9,$10,$11,$12,$13,$14,
         $15,$16,$17,
         'DRAFT',$18,$19,$19
       ) ${dedicated ? 'ON CONFLICT (receipt_no) DO NOTHING' : ''}`,
      [
        receiptNo, dto.companyCode, dto.companyName ?? null,
        dto.projectCode ?? null, dto.projectName ?? null,
        dto.customerId ?? null, dto.customerCode ?? null, dto.customerName,
        dto.receiptDate, dto.currencyCode, dto.amountOriginal, exRate, amtBase, dto.baseCurrency ?? 'CNY',
        dto.receiptMethod ?? null, dto.receivedAccountCode ?? null, dto.bankRef ?? null,
        dto.remark ?? null, user.userId,
      ],
    );

    const newRec = await this.ds.query(
      `SELECT *,receipt_date::text AS receipt_date FROM fin_ar_receipts WHERE receipt_no = $1`, [receiptNo],
    );
    if (dedicated) {
      const rec=newRec[0];
      if (!rec || rec.company_code!==dto.companyCode || rec.customer_code!==dto.customerCode
        || rec.currency_code!==dto.currencyCode || rec.base_currency!==dto.baseCurrency
        || flockMoneyCents(rec.amount_original)!==flockMoneyCents(dto.amountOriginal)
        || rec.receipt_date!==dto.receiptDate || rec.received_account_code!==dto.receivedAccountCode
        || (rec.receipt_method ?? null)!==(dto.receiptMethod ?? null) || (rec.bank_ref ?? null)!==(dto.bankRef ?? null)
        || rec.created_by!==user.userId) throw new ConflictException('原收款请求编号已绑定其他内容');
    }
    this.logger.log(`[AR] 创建收款草稿: ${receiptNo}`);
    // bigint → number：node-postgres 将 bigint 序列化为字符串，显式转换确保 JSON 输出为数字
    return { ...newRec[0], id: Number(newRec[0].id) };
  }

  // ── 4. 确认收款（核销分摊，全事务）──────────────────────────────────────

  async confirm(receiptId: string, dto: ConfirmArReceiptDto) {
    const rec = await this.assertReceiptOwnership(receiptId);

    const dedicated = String(rec.receipt_no).startsWith('FR-');
    if (dedicated && dto.receiveAccountId?.trim()) {
      throw new BadRequestException('交付收款确认须使用草稿中的原资金账户');
    }
    if (rec.status==='CONFIRMED' && dedicated) {
      const alloc=dto.allocations?.[0];
      const detail=await this.findById(receiptId);
      if (alloc && dto.allocations.length===1 && detail.allocations.length===1
        && String(rec.receipt_no).startsWith('FR-' + alloc.arInvoiceId + '-')
        && String(detail.allocations[0].ar_invoice_id)===alloc.arInvoiceId
        && flockMoneyCents(detail.allocations[0].allocated_amount_original)===flockMoneyCents(alloc.allocatedAmountOriginal)) return detail;
      throw new ConflictException('收款已确认，重试内容与原核销不同');
    }
    if (rec.status !== 'DRAFT') {
      throw new BadRequestException(`收款单状态 ${rec.status} 不允许确认`);
    }
    // 允许未指定 AR 的普通收款先确认入账；有分摊时仍逐笔核销应收。
    // 资金账户必须来自 DTO 的账户 ID 或创建草稿时保存的账户编码。
    const allocations = dto.allocations ?? [];
    let flockReceipt = false;

    const totalAllocated = allocations.reduce(
      (s, a) => s + Number(a.allocatedAmountOriginal), 0,
    );
    if (totalAllocated > Number(rec.amount_original) + 0.005) {
      throw new BadRequestException(
        `总分摊金额 ${totalAllocated} 超过收款金额 ${rec.amount_original}`,
      );
    }

    const user = this.currentUser();

    // ── 事务开始 ────────────────────────────────────────────────────────────
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction('SERIALIZABLE');

    try {
      // a. 逐条校验 AR 余额（行锁）
      for (const alloc of allocations) {
        const arRows = await qr.query(
          `SELECT id, ar_no, balance_amount_original, currency_code, company_code, project_code,customer_code,base_currency,status
           FROM fin_ar_invoices WHERE id = $1 FOR UPDATE`,
          [alloc.arInvoiceId],
        );
        if (!arRows.length) {
          throw new BadRequestException(`AR Invoice #${alloc.arInvoiceId} 不存在`);
        }
        const ar = arRows[0];

        if (isFlockArNumber(ar.ar_no)) {
          flockReceipt = true;
          if (!String(rec.receipt_no).startsWith('FR-' + alloc.arInvoiceId + '-')) {
            throw new BadRequestException('请从鸡群交付应收发起原单收款');
          }
          if ((!user.scopeAll && user.scopeLevel==='PROJECT') || ar.company_code!==rec.company_code
            || !rec.customer_code || ar.customer_code!==rec.customer_code || ar.currency_code!==rec.currency_code
            || ar.base_currency!==rec.currency_code || rec.base_currency!==rec.currency_code || rec.project_code || ar.project_code
            || !['OPEN','OVERDUE','PARTIALLY_RECEIVED'].includes(ar.status)) {
            throw new BadRequestException('交付应收的公司、客户、原币或应收状态与收款不一致');
          }
          const amount = flockMoneyCents(rec.amount_original);
          if (allocations.length!==1 || amount===0n || flockMoneyCents(alloc.allocatedAmountOriginal)!==amount
            || amount>flockMoneyCents(ar.balance_amount_original) || flockMoneyCents(rec.amount_base)!==amount
            || Number(rec.exchange_rate)!==1 || !rec.received_account_code?.trim()) {
            throw new BadRequestException('每笔鸡群收款须有同币种入账账户，并全额分摊至一张交付应收');
          }
        }

        // DataScope 验证
        const userCodes = user.companyCodes;
        if (!user.scopeAll && userCodes.length === 0) {
          throw new ForbiddenException('无权核销 AR Invoice（数据范围未配置）');
        }
        if (!user.scopeAll && !userCodes.includes(ar.company_code)) {
          throw new ForbiddenException(`无权核销公司 ${ar.company_code} 的 AR Invoice`);
        }
        if (!user.scopeAll && user.scopeLevel === 'PROJECT' && user.projectCodes.length > 0) {
          if (ar.project_code && !user.projectCodes.includes(ar.project_code)) {
            throw new ForbiddenException(`无权核销项目 ${ar.project_code} 的 AR Invoice`);
          }
        }

        if (Number(alloc.allocatedAmountOriginal) > Number(ar.balance_amount_original) + 0.005) {
          throw new BadRequestException(
            `AR ${ar.ar_no} 余额 ${ar.balance_amount_original}，` +
            `本次分摊 ${alloc.allocatedAmountOriginal} 超额`,
          );
        }
      }

      if (dedicated && !flockReceipt) throw new BadRequestException('交付收款只能核销指定应收');
      // b. 收款单 → CONFIRMED
      const confirmed = await qr.query(`WITH changed AS (
        UPDATE fin_ar_receipts SET status='CONFIRMED',updated_by=$1,updated_at=now()
        WHERE id=$2 AND status='DRAFT' RETURNING id
      ) SELECT id FROM changed`,[user.userId,receiptId]);
      if (confirmed.length!==1) throw new ConflictException('收款单状态已变化，请重新读取');

      // c. 写分摊记录 + 更新 AR 余额/状态
      for (const alloc of allocations) {
        const exRate = Number(rec.exchange_rate ?? 1);
        const allocOriginal = flockReceipt ? rec.amount_original : alloc.allocatedAmountOriginal;
        const allocBase = flockReceipt ? rec.amount_original : Math.round(Number(allocOriginal) * exRate * 100) / 100;

        // 插入分摊记录
        await qr.query(
          `INSERT INTO fin_ar_receipt_allocations
             (receipt_id, receipt_no, ar_invoice_id, ar_no,
              allocated_amount_original, allocated_amount_base, currency_code)
           SELECT $1, $2, $3, ar_no, $4, $5, currency_code
           FROM fin_ar_invoices WHERE id = $3`,
          [receiptId, rec.receipt_no, alloc.arInvoiceId,
           allocOriginal, allocBase],
        );

        // 更新 AR received + balance
        await qr.query(
          `UPDATE fin_ar_invoices
           SET received_amount_original = received_amount_original + $1,
               received_amount_base     = received_amount_base     + $2,
               balance_amount_original  = GREATEST(0, balance_amount_original - $1),
               balance_amount_base      = GREATEST(0, balance_amount_base     - $2),
               updated_at = now()
           WHERE id = $3`,
          [allocOriginal, allocBase, alloc.arInvoiceId],
        );

        // 重算 AR 状态（在同一事务内）
        const updatedAr = await qr.query(
          `SELECT amount_original, received_amount_original, balance_amount_original, status FROM fin_ar_invoices WHERE id = $1`,
          [alloc.arInvoiceId],
        );
        if (updatedAr.length) {
          const ar      = updatedAr[0];
          const amount  = Number(ar.amount_original);
          const received= Number(ar.received_amount_original);
          const balance = Math.max(0, amount - received);
          let newStatus = ar.status;
          let newColStatus = 'UNRECEIVED';
          if (!['CANCELLED','DISPUTED','WRITTEN_OFF'].includes(ar.status)) {
            if (received <= 0) {
              newStatus = 'OPEN'; newColStatus = 'UNRECEIVED';
            } else if (flockReceipt ? flockMoneyCents(ar.balance_amount_original) === 0n : balance <= 0.005) {
              newStatus = 'RECEIVED'; newColStatus = 'RECEIVED';
            } else {
              newStatus = 'PARTIALLY_RECEIVED'; newColStatus = 'PARTIAL';
            }
          }
          await qr.query(
            `UPDATE fin_ar_invoices SET status=$1, collection_status=$2, updated_at=now() WHERE id=$3`,
            [newStatus, newColStatus, alloc.arInvoiceId],
          );
        }
      }

      // d. 优先使用确认请求的账户 ID；否则使用草稿保存的账户编码。
      const receiveAccountId = dto.receiveAccountId?.trim();
      const receivedAccountCode = String(rec.received_account_code || '').trim();
      if (receiveAccountId || receivedAccountCode) {
        const accountLookup = receiveAccountId
          ? { clause: 'id = $1', value: receiveAccountId, label: receiveAccountId }
          : { clause: 'account_code = $1', value: receivedAccountCode, label: receivedAccountCode };
        const accRows = await qr.query(
          `SELECT id, account_code, account_name, company_code, company_name,
                  currency_code, current_balance, status
           FROM fin_cash_accounts WHERE ${accountLookup.clause} FOR UPDATE`,
          [accountLookup.value],
        );
        if (!accRows.length) throw new NotFoundException(`资金账户 ${accountLookup.label} 不存在`);
        const acc = accRows[0];
        if (acc.company_code !== rec.company_code) {
          throw new ForbiddenException(`资金账户 ${acc.account_code} 不属于收款公司 ${rec.company_code}`);
        }
        if (flockReceipt && acc.currency_code!==rec.currency_code) throw new BadRequestException('资金账户必须与鸡群收款同币种');
        if (acc.status !== 'ACTIVE') {
          throw new BadRequestException(`资金账户状态 ${acc.status}，不允许入账`);
        }

        const amount = flockReceipt ? flockMoneyNumber(flockMoneyCents(rec.amount_original)) : Number(rec.amount_original);
        if (flockReceipt) flockMoneyNumber(flockMoneyCents(acc.current_balance)+flockMoneyCents(rec.amount_original));
        const newBalance = await this.cashAccSvc.applyBalance(
          qr, String(acc.id), amount, user.userId,
        );
        await this.cashTxnSvc.writeTransaction({
          qr,
          accountId: acc.id,
          accountCode: acc.account_code,
          accountName: acc.account_name,
          companyCode: acc.company_code,
          companyName: acc.company_name,
          direction: 'IN',
          sourceType: 'AR_RECEIPT',
          sourceId: receiptId,
          sourceNo: rec.receipt_no,
          currencyCode: acc.currency_code,
          amount,
          balanceAfter: newBalance,
          remark: `AR 收款核销 ${rec.receipt_no}`,
          createdBy: user.userId,
        });
      }

      await qr.commitTransaction();
      this.logger.log(`[AR] 确认收款 #${receiptId} (${rec.receipt_no}) 核销 ${allocations.length} 条 AR`);
      return this.findById(receiptId);

    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(`[AR] confirm 事务回滚: ${(err as Error).message}`);
      throw err;
    } finally {
      await qr.release();
    }
  }

  async reverseFlockReceipt(receiptId: string, inputReason?: string) {
    const reason = inputReason?.trim();
    if (!reason || reason.length>500) throw new BadRequestException('请填写 1 至 500 字的冲销依据');
    const scoped = await this.assertReceiptOwnership(receiptId);
    const user = this.currentUser();
    if (!user.scopeAll && user.scopeLevel==='PROJECT') throw new ForbiddenException('须由公司范围财务冲销交付收款');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [rec] = await qr.query(`SELECT * FROM fin_ar_receipts WHERE id=$1 AND company_code=$2 FOR UPDATE`,
        [receiptId,scoped.company_code]);
      if (!rec || !['CONFIRMED','CANCELLED'].includes(rec.status) || rec.project_code) {
        throw new ConflictException('收款单未确认或不属于受控鸡群收款');
      }
      const allocations = await qr.query(`SELECT a.*,i.status AS invoice_status,i.ar_no AS invoice_no,
        i.company_code,i.customer_code,i.currency_code AS invoice_currency,i.received_amount_original,i.received_amount_base,
        i.amount_original,i.amount_base,i.base_currency
        FROM fin_ar_receipt_allocations a JOIN fin_ar_invoices i ON i.id=a.ar_invoice_id
        WHERE a.receipt_id=$1 ORDER BY i.id FOR UPDATE OF i`,[receiptId]);
      const ar = allocations[0];
      const amount = flockMoneyCents(rec.amount_original);
      if (allocations.length!==1 || !ar || !isFlockArNumber(ar.invoice_no) || ar.ar_no!==ar.invoice_no
        || ar.receipt_no!==rec.receipt_no || !rec.customer_code || ar.customer_code!==rec.customer_code
        || ar.company_code!==rec.company_code || ar.currency_code!==rec.currency_code || ar.invoice_currency!==rec.currency_code
        || ar.base_currency!==rec.currency_code || amount===0n || flockMoneyCents(ar.allocated_amount_original)!==amount
        || flockMoneyCents(ar.allocated_amount_base)!==amount) {
        throw new ConflictException('只允许冲销全额核销到一张鸡群交付应收的同币种收款');
      }

      const ledger = await qr.query(`SELECT account_id,direction,amount,company_code,currency_code,source_no
        FROM fin_cash_transactions WHERE source_type='AR_RECEIPT' AND source_id=$1 ORDER BY id`,[receiptId]) as Array<{account_id:string;direction:string;amount:string;company_code:string;currency_code:string;source_no:string}>;
      const original = ledger.find(row => row.direction==='IN');
      const matchesReceipt = (row: typeof original) => row && row.company_code===rec.company_code
        && row.currency_code===rec.currency_code && row.source_no===rec.receipt_no && flockMoneyCents(row.amount)===amount;
      const reversal = ledger.find(row => row.direction==='OUT');
      if (rec.status==='CANCELLED' && ledger.length===2 && matchesReceipt(original)
        && matchesReceipt(reversal) && reversal?.account_id===original?.account_id) {
        await qr.commitTransaction();
        return {id:receiptId,status:'CANCELLED',reversed:true};
      }
      if (rec.status!=='CONFIRMED' || ledger.length!==1 || !matchesReceipt(original)
        || ['DISPUTED','CANCELLED','WRITTEN_OFF'].includes(ar.invoice_status)
        || flockMoneyCents(ar.received_amount_original)<amount || flockMoneyCents(ar.received_amount_base)<amount) {
        throw new ConflictException('原收款流水或应收状态不完整，须先核对');
      }
      const [account] = await qr.query(`SELECT * FROM fin_cash_accounts WHERE id=$1 FOR UPDATE`,[original?.account_id]);
      if (!account || account.status!=='ACTIVE' || account.company_code!==rec.company_code || account.currency_code!==rec.currency_code
        || flockMoneyCents(account.current_balance)<amount) throw new ConflictException('原账户余额不足、停用或归属已变');

      const numericAmount = flockMoneyNumber(amount);
      flockMoneyNumber(flockMoneyCents(account.current_balance)-amount);
      const balanceAfter = await this.cashAccSvc.applyBalance(qr,String(account.id),-numericAmount,user.userId);
      await this.cashTxnSvc.writeTransaction({qr,accountId:account.id,accountCode:account.account_code,accountName:account.account_name,
        companyCode:account.company_code,companyName:account.company_name,direction:'OUT',sourceType:'AR_RECEIPT',
        sourceId:receiptId,sourceNo:rec.receipt_no,currencyCode:account.currency_code,amount:numericAmount,balanceAfter,
        remark:'鸡群收款冲销：' + reason,createdBy:user.userId});
      await qr.query(`UPDATE fin_ar_invoices
        SET received_amount_original=received_amount_original-$2::numeric,received_amount_base=received_amount_base-$2::numeric,
          balance_amount_original=amount_original-received_amount_original+$2::numeric,
          balance_amount_base=amount_base-received_amount_base+$2::numeric,
          status=CASE WHEN received_amount_original=$2::numeric THEN 'OPEN' ELSE 'PARTIALLY_RECEIVED' END,
          collection_status=CASE WHEN received_amount_original=$2::numeric THEN 'UNRECEIVED' ELSE 'PARTIAL' END,updated_by=$3,updated_at=now()
        WHERE id=$1`,[ar.ar_invoice_id,rec.amount_original,user.userId]);
      await qr.query(`UPDATE fin_ar_receipts SET status='CANCELLED',remark=COALESCE(remark,'')||$2,updated_by=$3,updated_at=now()
        WHERE id=$1`,[receiptId,' [冲销依据：' + reason + ']',user.userId]);
      await qr.commitTransaction();
      return {id:receiptId,status:'CANCELLED',reversed:true};
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  // ── 5. 取消收款（仅 DRAFT 可取消）────────────────────────────────────────

  async cancel(receiptId: string, dto: CancelArReceiptDto) {
    const rec = await this.assertReceiptOwnership(receiptId);

    if (rec.status === 'CONFIRMED') {
      throw new BadRequestException('已确认的收款单不能取消（请联系财务主管处理冲销）');
    }
    if (rec.status === 'CANCELLED') {
      throw new BadRequestException('收款单已取消');
    }

    const user = this.currentUser();
    const changed = await this.ds.query(
      `WITH changed AS (UPDATE fin_ar_receipts
       SET status = 'CANCELLED',
           remark = COALESCE(remark, '') || $1,
           updated_by = $2, updated_at = now()
       WHERE id = $3 AND status='DRAFT' RETURNING id) SELECT id FROM changed`,
      [
        dto.reason ? ` [取消原因: ${dto.reason}]` : '',
        user.userId, receiptId,
      ],
    );

    if (changed.length!==1) throw new ConflictException('收款单状态已变化，请重新读取');
    this.logger.log(`[AR] 取消收款草稿 #${receiptId} (${rec.receipt_no})`);
    return { id: receiptId, receiptNo: rec.receipt_no, status: 'CANCELLED' };
  }
}
