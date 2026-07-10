import {
  Injectable, Logger, NotFoundException,
  ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import { ClsService }       from 'nestjs-cls';
import {
  CreateArReceiptDto,
  ConfirmArReceiptDto,
  CancelArReceiptDto,
  QueryArReceiptDto,
  ArReceiptAllocationDto,
} from '../dto/ar-receipt.dto';
import { ArInvoicesService }     from './ar-invoices.service';
import { CashAccountsService }   from './cash-accounts.service';
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
    return {
      userId:       String(u?.userId ?? u?.id ?? '0'),
      companyCodes: (u?.companyCodes ?? []) as string[],
      scopeAll:     !!(u?.scopeAll),
    };
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
    if (user.scopeAll || user.companyCodes.length === 0) return [];
    params.push(user.companyCodes);
    return [`r.company_code = ANY($${params.length}::text[])`];
  }

  /** assertOwnership for receipt */
  private async assertReceiptOwnership(receiptId: string): Promise<any> {
    const rows = await this.ds.query(
      `SELECT id, receipt_no, company_code, status, amount_original, currency_code,
              exchange_rate, received_account_code, customer_name
       FROM fin_ar_receipts WHERE id = $1`,
      [receiptId],
    );
    if (!rows.length) throw new NotFoundException(`AR Receipt #${receiptId} 不存在`);
    const rec  = rows[0];
    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length > 0 &&
        !user.companyCodes.includes(rec.company_code)) {
      throw new ForbiddenException(`无权访问公司 ${rec.company_code} 的 AR Receipt`);
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
    const receiptNo = await this.genReceiptNo();
    const exRate    = dto.exchangeRate ?? 1;
    const amtBase   = dto.amountBase ?? Math.round(dto.amountOriginal * exRate * 100) / 100;

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
       )`,
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
      `SELECT * FROM fin_ar_receipts WHERE receipt_no = $1`, [receiptNo],
    );
    this.logger.log(`[AR] 创建收款草稿: ${receiptNo}`);
    // bigint → number：node-postgres 将 bigint 序列化为字符串，显式转换确保 JSON 输出为数字
    return { ...newRec[0], id: Number(newRec[0].id) };
  }

  // ── 4. 确认收款（核销分摊，全事务）──────────────────────────────────────

  async confirm(receiptId: string, dto: ConfirmArReceiptDto) {
    const rec = await this.assertReceiptOwnership(receiptId);

    if (rec.status !== 'DRAFT') {
      throw new BadRequestException(`收款单状态 ${rec.status} 不允许确认`);
    }
    // 允许未指定 AR 的普通收款先确认入账；有分摊时仍逐笔核销应收。
    // 资金账户必须来自 DTO 的账户 ID 或创建草稿时保存的账户编码。
    const allocations = dto.allocations ?? [];

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
          `SELECT id, ar_no, balance_amount_original, currency_code, company_code
           FROM fin_ar_invoices WHERE id = $1 FOR UPDATE`,
          [alloc.arInvoiceId],
        );
        if (!arRows.length) {
          throw new BadRequestException(`AR Invoice #${alloc.arInvoiceId} 不存在`);
        }
        const ar = arRows[0];

        // DataScope 验证
        const userCodes = user.companyCodes;
        if (!user.scopeAll && userCodes.length > 0 && !userCodes.includes(ar.company_code)) {
          throw new ForbiddenException(`无权核销公司 ${ar.company_code} 的 AR Invoice`);
        }

        if (Number(alloc.allocatedAmountOriginal) > Number(ar.balance_amount_original) + 0.005) {
          throw new BadRequestException(
            `AR ${ar.ar_no} 余额 ${ar.balance_amount_original}，` +
            `本次分摊 ${alloc.allocatedAmountOriginal} 超额`,
          );
        }
      }

      // b. 收款单 → CONFIRMED
      await qr.query(
        `UPDATE fin_ar_receipts
         SET status = 'CONFIRMED', updated_by = $1, updated_at = now()
         WHERE id = $2`,
        [user.userId, receiptId],
      );

      // c. 写分摊记录 + 更新 AR 余额/状态
      for (const alloc of allocations) {
        const exRate = Number(rec.exchange_rate ?? 1);
        const allocBase = Math.round(Number(alloc.allocatedAmountOriginal) * exRate * 100) / 100;

        // 插入分摊记录
        await qr.query(
          `INSERT INTO fin_ar_receipt_allocations
             (receipt_id, receipt_no, ar_invoice_id, ar_no,
              allocated_amount_original, allocated_amount_base, currency_code)
           SELECT $1, $2, $3, ar_no, $4, $5, currency_code
           FROM fin_ar_invoices WHERE id = $3`,
          [receiptId, rec.receipt_no, alloc.arInvoiceId,
           alloc.allocatedAmountOriginal, allocBase],
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
          [alloc.allocatedAmountOriginal, allocBase, alloc.arInvoiceId],
        );

        // 重算 AR 状态（在同一事务内）
        const updatedAr = await qr.query(
          `SELECT amount_original, received_amount_original, status FROM fin_ar_invoices WHERE id = $1`,
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
            } else if (balance <= 0.005) {
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
        if (acc.status !== 'ACTIVE') {
          throw new BadRequestException(`资金账户状态 ${acc.status}，不允许入账`);
        }

        const amount = Number(rec.amount_original);
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
    await this.ds.query(
      `UPDATE fin_ar_receipts
       SET status = 'CANCELLED',
           remark = COALESCE(remark, '') || $1,
           updated_by = $2, updated_at = now()
       WHERE id = $3`,
      [
        dto.reason ? ` [取消原因: ${dto.reason}]` : '',
        user.userId, receiptId,
      ],
    );

    this.logger.log(`[AR] 取消收款草稿 #${receiptId} (${rec.receipt_no})`);
    return { id: receiptId, receiptNo: rec.receipt_no, status: 'CANCELLED' };
  }
}
