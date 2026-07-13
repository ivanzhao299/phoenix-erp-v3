import {
  Injectable, Logger, NotFoundException,
  ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import { ClsService }       from 'nestjs-cls';
import { DataScopeContext } from '../../org/services/data-scope.service';
import {
  CreateApInvoiceDto,
  UpdateApInvoiceDto,
  QueryApInvoiceDto,
  CancelApInvoiceDto,
  PayApInvoiceDto,
} from '../dto/ap-invoice.dto';
import { CashAccountsService } from './cash-accounts.service';
import { CashTransactionsService } from './cash-transactions.service';

const AP_STATUS_LABELS: Record<string, string> = {
  OPEN: '未付款',
  PARTIALLY_PAID: '部分付款',
  PAID: '已付清',
  DISPUTED: '争议中',
  CANCELLED: '已取消',
};

const AP_PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: '未付款',
  PARTIAL: '部分付款',
  PAID: '已付清',
};

/**
 * ApInvoicesService — Finance V2 Phase 1 AP Runtime
 *
 * 正式 AP Runtime，基于 fin_ap_invoices。
 * 不依赖 prc2_ap_ledger（import-from-prc2 除外）。
 *
 * DataScope：所有列表接口严格按当前用户 companyCodes 过滤。
 * assertOwnership：详情/写操作验证 company_code 在 DataScope 范围内。
 */
@Injectable()
export class ApInvoicesService {
  private readonly logger = new Logger(ApInvoicesService.name);

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly cashAccSvc?: CashAccountsService,
    private readonly cashTxnSvc?: CashTransactionsService,
  ) {}

  // ── 内部工具 ──────────────────────────────────────────────────────────────

  private withStatusLabels<T extends Record<string, any>>(invoice: T): T & {
    status_label?: string;
    payment_status_label?: string;
  } {
    return {
      ...invoice,
      status_label: AP_STATUS_LABELS[String(invoice.status)] ?? invoice.status,
      payment_status_label: AP_PAYMENT_STATUS_LABELS[String(invoice.payment_status)] ?? invoice.payment_status,
    };
  }

  private isUndefinedTableError(err: unknown): boolean {
    return !!err && typeof err === 'object' && (err as { code?: string }).code === '42P01';
  }

  private currentUser() {
    const u = this.cls.get('user') as any;
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    return {
	      userId:       String(u?.userId ?? u?.id ?? '0'),
	      roles:        (u?.roles ?? (u?.role ? [u.role] : [])) as string[],
	      permissions:  (u?.permissions ?? []) as string[],
	      companyCodes: (scope?.allowedCompanyCodes ?? u?.companyCodes ?? []) as string[],
	      projectCodes: (scope?.allowedProjectCodes ?? u?.projectCodes ?? []) as string[],
	      scopeLevel:   scope?.scopeLevel ?? u?.scopeLevel ?? 'SELF',
	      scopeAll:     scope ? !!scope.isGlobal : !!(u?.scopeAll),
	    };
	  }

  /** 生成 AP 编号 AP-YYYYMM-XXXXX */
  private async genApNo(): Promise<string> {
    const ym    = new Date().toISOString().slice(0, 7).replace('-', '');
    const prefix = `AP-${ym}-`;
    const row   = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM fin_ap_invoices WHERE ap_no LIKE $1`,
      [`${prefix}%`],
    );
    const seq = String(Number(row[0]?.cnt ?? 0) + 1).padStart(5, '0');
    return `${prefix}${seq}`;
  }

  /** 生成分配编号 */
  private async genAllocNo(): Promise<string> {
    const ym   = new Date().toISOString().slice(0, 7).replace('-', '');
    const pre  = `APA-${ym}-`;
    const row  = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM fin_ap_payment_allocations WHERE alloc_no LIKE $1`,
      [`${pre}%`],
    );
    const seq = String(Number(row[0]?.cnt ?? 0) + 1).padStart(5, '0');
    return `${pre}${seq}`;
  }

  /** 生成分配编号（事务内） */
  private async genAllocNoIn(qr: import('typeorm').QueryRunner): Promise<string> {
    const ym   = new Date().toISOString().slice(0, 7).replace('-', '');
    const pre  = `APA-${ym}-`;
    const row  = await qr.query(
      `SELECT COUNT(*) AS cnt FROM fin_ap_payment_allocations WHERE alloc_no LIKE $1`,
      [`${pre}%`],
    );
    const seq = String(Number(row[0]?.cnt ?? 0) + 1).padStart(5, '0');
    return `${pre}${seq}`;
  }

  /** 生成旧 AP payment 编号（兼容历史表） */
  private async genLegacyPaymentNoIn(qr: import('typeorm').QueryRunner): Promise<string> {
    const ym   = new Date().toISOString().slice(0, 7).replace('-', '');
    const pre  = `PAY-${ym}-`;
    const row  = await qr.query(
      `SELECT COUNT(*) AS cnt FROM fin_ap_payments WHERE payment_no LIKE $1`,
      [`${pre}%`],
    );
    const seq = String(Number(row[0]?.cnt ?? 0) + 1).padStart(5, '0');
    return `${pre}${seq}`;
  }

  /** DataScope WHERE 子句 */
  private scopeWhere(alias: string, params: any[]): string {
    const user = this.currentUser();
    if (user.scopeAll) return '';
    if (user.companyCodes.length === 0) return 'AND 1=0';
    params.push(user.companyCodes);
    return `AND ${alias}.company_code = ANY($${params.length}::text[])`;
  }

  /** 写入归属校验：create/import 等入口必须落在当前 DataScope 内。 */
  private assertWritableOwnership(companyCode?: string | null, projectCode?: string | null): void {
    const user = this.currentUser();
    if (user.scopeAll) return;
    if (!companyCode) throw new ForbiddenException('无权写入 AP Invoice（缺少公司归属）');
    if (!user.companyCodes.length) throw new ForbiddenException('无权写入 AP Invoice（数据范围未配置）');
    if (!user.companyCodes.includes(companyCode)) {
      throw new ForbiddenException(`无权写入公司 ${companyCode} 的 AP Invoice`);
    }
    if (user.scopeLevel === 'PROJECT' && user.projectCodes.length > 0) {
      if (!projectCode) throw new ForbiddenException('无权写入 AP Invoice（缺少项目归属）');
      if (!user.projectCodes.includes(projectCode)) {
        throw new ForbiddenException(`无权写入项目 ${projectCode} 的 AP Invoice`);
      }
    }
  }

  /** assertOwnership：确认 invoice 的 company_code 在当前用户 DataScope 内 */
  private async assertOwnership(invoiceId: string): Promise<any> {
    const rows = await this.ds.query(
      `SELECT id, ap_no, source_type, source_id, source_no,
              company_code, company_name, project_code, project_name,
              supplier_id, supplier_code, supplier_name,
              invoice_no, invoice_date, due_date,
              amount_original, paid_amount_original, balance_amount_original,
              currency_code, exchange_rate, amount_base, base_currency,
              paid_amount_base, balance_amount_base,
              status, payment_status, tax_amount, tax_rate,
              wf_instance_id, remark, created_by, updated_by, created_at, updated_at
       FROM fin_ap_invoices WHERE id = $1`,
      [invoiceId],
    );
    if (!rows.length) throw new NotFoundException(`AP Invoice #${invoiceId} 不存在`);
    const inv  = rows[0];
    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length === 0) {
      throw new ForbiddenException('无权访问 AP Invoice（数据范围未配置）');
    }
    if (!user.scopeAll && user.companyCodes.length > 0 &&
        !user.companyCodes.includes(inv.company_code)) {
      throw new ForbiddenException(`无权访问公司 ${inv.company_code} 的 AP Invoice`);
    }
    return inv;
  }

  private async loadPaymentAllocations(invoiceId: string): Promise<any[]> {
    try {
      return await this.ds.query(
        `SELECT id, alloc_no, amount_original, currency_code,
                payment_date, payment_method, reference_no, remark, created_at
         FROM fin_ap_payment_allocations WHERE invoice_id = $1 ORDER BY payment_date DESC`,
        [invoiceId],
      );
    } catch (err) {
      if (!this.isUndefinedTableError(err)) throw err;
      this.logger.warn('[AP] fin_ap_payment_allocations missing; falling back to legacy fin_ap_payments for invoice detail');
    }

    try {
      return await this.ds.query(
        `SELECT id, payment_no AS alloc_no, amount AS amount_original, currency_code,
                payment_date, payment_method, reference_no, note AS remark, created_at
         FROM fin_ap_payments WHERE invoice_id = $1 ORDER BY payment_date DESC`,
        [invoiceId],
      );
    } catch (err) {
      if (!this.isUndefinedTableError(err)) throw err;
      this.logger.warn('[AP] no AP payment history table is available; returning invoice detail without allocations');
      return [];
    }
  }

  // ── 1. 列表 ───────────────────────────────────────────────────────────────

  async list(q: QueryApInvoiceDto) {
    const page     = Math.max(1, q.page     ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const offset   = (page - 1) * pageSize;
    const params: any[] = [];

    const conditions: string[] = ['1=1'];

    // DataScope
    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length > 0) {
      params.push(user.companyCodes);
      conditions.push(`i.company_code = ANY($${params.length}::text[])`);
    } else if (!user.scopeAll) {
      conditions.push('1=0');
    }

    if (q.companyCode)   { params.push(q.companyCode);   conditions.push(`i.company_code   = $${params.length}`); }
    if (q.projectCode)   { params.push(q.projectCode);   conditions.push(`i.project_code   = $${params.length}`); }
    if (q.supplierCode)  { params.push(q.supplierCode);  conditions.push(`i.supplier_code  = $${params.length}`); }
    if (q.status)        { params.push(q.status);        conditions.push(`i.status          = $${params.length}`); }
    if (q.paymentStatus) { params.push(q.paymentStatus); conditions.push(`i.payment_status  = $${params.length}`); }
    if (q.currencyCode)  { params.push(q.currencyCode);  conditions.push(`i.currency_code  = $${params.length}`); }
    if (q.sourceType)    { params.push(q.sourceType);    conditions.push(`i.source_type    = $${params.length}`); }
    if (q.dateFrom)      { params.push(q.dateFrom);      conditions.push(`i.invoice_date   >= $${params.length}`); }
    if (q.dateTo)        { params.push(q.dateTo);        conditions.push(`i.invoice_date   <= $${params.length}`); }
    if (q.keyword) {
      params.push(`%${q.keyword}%`);
      conditions.push(`(i.ap_no ILIKE $${params.length} OR i.supplier_name ILIKE $${params.length} OR i.invoice_no ILIKE $${params.length})`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countParams = [...params];
    params.push(pageSize, offset);

    const [rows, countRow] = await Promise.all([
      this.ds.query(
        `SELECT i.id, i.ap_no, i.source_type, i.source_no,
                i.company_code, i.company_name, i.project_code, i.project_name,
                i.supplier_code, i.supplier_name, i.invoice_no,
                i.invoice_date, i.due_date,
                i.currency_code, i.amount_original, i.exchange_rate,
                i.amount_base, i.base_currency,
                i.paid_amount_original, i.balance_amount_original,
                i.status, i.payment_status, i.remark, i.created_at,
                CASE
                  WHEN i.due_date IS NULL THEN 'NOT_DUE'
                  WHEN i.due_date >= CURRENT_DATE THEN 'NOT_DUE'
                  WHEN i.due_date >= CURRENT_DATE - 30 THEN '0_30'
                  WHEN i.due_date >= CURRENT_DATE - 60 THEN '31_60'
                  WHEN i.due_date >= CURRENT_DATE - 90 THEN '61_90'
                  ELSE '90_PLUS'
                END AS aging_bucket
         FROM fin_ap_invoices i
         ${where}
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      this.ds.query(
        `SELECT COUNT(*)::int AS cnt FROM fin_ap_invoices i ${where}`,
        countParams,
      ),
    ]);

    return {
      items: rows.map((row: Record<string, any>) => this.withStatusLabels(row)),
      total: Number(countRow[0]?.cnt ?? 0),
      page,
      pageSize,
    };
  }

  // ── 2. 详情 ───────────────────────────────────────────────────────────────

  async findById(id: string) {
    const inv = await this.assertOwnership(id);
    const allocs = await this.loadPaymentAllocations(id);
    return { ...this.withStatusLabels(inv), allocations: allocs };
  }

  // ── 3. 手工创建 AP ────────────────────────────────────────────────────────

  async createManual(dto: CreateApInvoiceDto) {
    const user  = this.currentUser();
    this.assertWritableOwnership(dto.companyCode, dto.projectCode);
    const apNo  = await this.genApNo();
    const exRate = dto.exchangeRate ?? 1;
    const amtBase = dto.amountBase ?? Math.round(dto.amountOriginal * exRate * 100) / 100;

    await this.ds.query(
      `INSERT INTO fin_ap_invoices (
         ap_no, source_type,
         company_code, company_name, project_code, project_name,
         supplier_id, supplier_code, supplier_name,
         invoice_no, invoice_date, due_date,
         currency_code, amount_original, exchange_rate, amount_base, base_currency,
         paid_amount_original, paid_amount_base,
         balance_amount_original, balance_amount_base,
         status, payment_status, tax_amount, tax_rate, remark,
         created_by, updated_by
       ) VALUES (
         $1,'MANUAL',
         $2,$3,$4,$5,
         $6,$7,$8,
         $9,$10,$11,
         $12,$13,$14,$15,$16,
         0,0, $13,$15,
         'OPEN','UNPAID', $17,$18,$19,
         $20,$20
       )`,
      [
        apNo,
        dto.companyCode, dto.companyName ?? null, dto.projectCode ?? null, dto.projectName ?? null,
        dto.supplierId ?? null, dto.supplierCode ?? null, dto.supplierName,
        dto.invoiceNo ?? null, dto.invoiceDate ?? null, dto.dueDate ?? null,
        dto.currencyCode, dto.amountOriginal, exRate, amtBase, dto.baseCurrency ?? 'CNY',
        dto.taxAmount ?? null, dto.taxRate ?? null, dto.remark ?? null,
        user.userId,
      ],
    );

    const row = await this.ds.query(
      `SELECT * FROM fin_ap_invoices WHERE ap_no = $1`, [apNo],
    );
    this.logger.log(`[AP] 手工创建 AP Invoice: ${apNo} company=${dto.companyCode}`);
    // bigint → number：node-postgres 将 bigint 序列化为字符串，显式转换确保 JSON 输出为数字
    return this.withStatusLabels({ ...row[0], id: Number(row[0].id) });
  }

  // ── 4. 从 PO / prc2_ap_ledger 创建 ───────────────────────────────────────

  async createFromPo(opts: {
    companyCode:  string; companyName?: string;
    projectCode?: string; projectName?: string;
    supplierId?:  string; supplierCode?: string; supplierName: string;
    invoiceDate?: string; dueDate?: string;
    currencyCode: string; amountOriginal: number;
    exchangeRate?: number; amountBase?: number;
    paidAmountOriginal?: number;
    sourceId?:    string; sourceNo?: string;
    remark?:      string; createdBy?: string;
  }) {
    const user   = this.currentUser();
    this.assertWritableOwnership(opts.companyCode, opts.projectCode);
    const apNo   = await this.genApNo();
    const exRate = opts.exchangeRate ?? 1;
    const amtBase = opts.amountBase ?? Math.round(opts.amountOriginal * exRate * 100) / 100;
    const paid   = opts.paidAmountOriginal ?? 0;
    const balance = opts.amountOriginal - paid;
    const paidBase = Math.round(paid * exRate * 100) / 100;
    const balBase  = Math.round(balance * exRate * 100) / 100;
    const pStatus = paid <= 0 ? 'UNPAID' : (balance <= 0 ? 'PAID' : 'PARTIAL');
    const status  = paid <= 0 ? 'OPEN'   : (balance <= 0 ? 'PAID' : 'PARTIALLY_PAID');

    await this.ds.query(
      `INSERT INTO fin_ap_invoices (
         ap_no, source_type, source_id, source_no,
         company_code, company_name, project_code, project_name,
         supplier_id, supplier_code, supplier_name,
         invoice_date, due_date,
         currency_code, amount_original, exchange_rate, amount_base, base_currency,
         paid_amount_original, paid_amount_base,
         balance_amount_original, balance_amount_base,
         status, payment_status, remark, created_by, updated_by
       ) VALUES (
         $1,'PO',$2,$3,
         $4,$5,$6,$7,
         $8,$9,$10,
         $11,$12,
         $13,$14,$15,$16,'CNY',
         $17,$18,$19,$20,
         $21,$22,$23,$24,$24
       )`,
      [
        apNo, opts.sourceId ?? null, opts.sourceNo ?? null,
        opts.companyCode, opts.companyName ?? null, opts.projectCode ?? null, opts.projectName ?? null,
        opts.supplierId ?? null, opts.supplierCode ?? null, opts.supplierName,
        opts.invoiceDate ?? null, opts.dueDate ?? null,
        opts.currencyCode, opts.amountOriginal, exRate, amtBase,
        paid, paidBase, balance, balBase,
        status, pStatus,
        opts.remark ?? null, opts.createdBy ?? user.userId,
      ],
    );

    const row = await this.ds.query(
      `SELECT * FROM fin_ap_invoices WHERE ap_no = $1`, [apNo],
    );
    return this.withStatusLabels(row[0]);
  }

  // ── 5. 更新（仅 OPEN/PARTIALLY_PAID 可编辑）─────────────────────────────

  async update(id: string, dto: UpdateApInvoiceDto) {
    const inv  = await this.assertOwnership(id);
    if (!['OPEN', 'PARTIALLY_PAID'].includes(inv.status)) {
      throw new BadRequestException(`状态 ${inv.status} 不允许修改`);
    }

    const user = this.currentUser();
    const sets: string[] = [];
    const params: any[]  = [];

    const push = (col: string, val: any) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (dto.invoiceNo    !== undefined) push('invoice_no',   dto.invoiceNo);
    if (dto.invoiceDate  !== undefined) push('invoice_date', dto.invoiceDate);
    if (dto.dueDate      !== undefined) push('due_date',     dto.dueDate);
    if (dto.supplierName !== undefined) push('supplier_name',dto.supplierName);
    if (dto.projectCode  !== undefined) push('project_code', dto.projectCode);
    if (dto.projectName  !== undefined) push('project_name', dto.projectName);
    if (dto.remark       !== undefined) push('remark',       dto.remark);
    if (dto.taxAmount    !== undefined) push('tax_amount',   dto.taxAmount);
    if (dto.taxRate      !== undefined) push('tax_rate',     dto.taxRate);

    if (dto.amountOriginal !== undefined || dto.exchangeRate !== undefined) {
      const newAmt = dto.amountOriginal ?? Number(inv.amount_original);
      const newRate = dto.exchangeRate  ?? Number(inv.exchange_rate);
      const newBase = Math.round(newAmt * newRate * 100) / 100;
      const newBalance = newAmt - Number(inv.paid_amount_original);
      if (newBalance < 0) throw new BadRequestException('修改后金额不能小于已付款金额');
      push('amount_original', newAmt);
      push('exchange_rate',   newRate);
      push('amount_base',     newBase);
      push('balance_amount_original', newBalance);
      push('balance_amount_base', Math.round(newBalance * newRate * 100) / 100);
    }

    if (!sets.length) return inv;

    params.push(user.userId);  sets.push(`updated_by = $${params.length}`);
    params.push(id);
    await this.ds.query(
      `UPDATE fin_ap_invoices SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
      params,
    );

    return this.findById(id);
  }

  // ── 6. 取消（未付款可取消）───────────────────────────────────────────────

  async cancel(id: string, dto: CancelApInvoiceDto) {
    const inv = await this.assertOwnership(id);

    if (inv.status === 'PAID') {
      throw new BadRequestException('已付清的 AP Invoice 不能取消');
    }
    if (inv.status === 'CANCELLED') {
      throw new BadRequestException('AP Invoice 已取消');
    }
    if (Number(inv.paid_amount_original) > 0) {
      throw new BadRequestException('已有付款记录，不能直接取消，请先处理付款核销');
    }

    const user = this.currentUser();
    await this.ds.query(
      `UPDATE fin_ap_invoices
       SET status = 'CANCELLED', payment_status = 'UNPAID',
           remark = COALESCE(remark, '') || $1,
           updated_by = $2, updated_at = now()
       WHERE id = $3`,
      [
        dto.reason ? ` [取消原因: ${dto.reason}]` : '',
        user.userId, id,
      ],
    );

    this.logger.log(`[AP] 取消 AP Invoice #${id} (${inv.ap_no}) by user ${user.userId}`);
    return {
      id,
      apNo: inv.ap_no,
      status: 'CANCELLED',
      status_label: AP_STATUS_LABELS.CANCELLED,
      payment_status: 'UNPAID',
      payment_status_label: AP_PAYMENT_STATUS_LABELS.UNPAID,
    };
  }

  // ── 6.5 付款核销（扣资金账户 + 写 AP_PAYMENT 流水）──────────────────────

  async payInvoice(id: string, dto: PayApInvoiceDto) {
    if (!this.cashAccSvc || !this.cashTxnSvc) {
      throw new BadRequestException('AP 付款运行时未就绪');
    }

    const user = this.currentUser();
    const amount = Number(dto.amountOriginal);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('付款金额必须大于 0');
    }

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction('SERIALIZABLE');

    try {
      const invRows = await qr.query(
        `SELECT id, ap_no, company_code, company_name, supplier_code, supplier_name,
                currency_code, exchange_rate, amount_original,
                paid_amount_original, paid_amount_base,
                balance_amount_original, balance_amount_base,
                status, payment_status
         FROM fin_ap_invoices
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      if (!invRows.length) throw new NotFoundException(`AP Invoice #${id} 不存在`);
      const inv = invRows[0];

      if (!user.scopeAll && user.companyCodes.length === 0) {
        throw new ForbiddenException('无权付款 AP Invoice（数据范围未配置）');
      }
      if (!user.scopeAll && !user.companyCodes.includes(inv.company_code)) {
        throw new ForbiddenException(`无权付款公司 ${inv.company_code} 的 AP Invoice`);
      }
      if (!['OPEN', 'PARTIALLY_PAID'].includes(inv.status)) {
        throw new BadRequestException(`状态 ${inv.status} 不允许付款`);
      }

      const balance = Number(inv.balance_amount_original);
      if (amount > balance + 0.005) {
        throw new BadRequestException(
          `AP ${inv.ap_no} 余额 ${balance}，本次付款 ${amount} 超额`,
        );
      }

      const accRows = await qr.query(
        `SELECT id, account_code, account_name, company_code, company_name,
                currency_code, current_balance, status
         FROM fin_cash_accounts
         WHERE id = $1
         FOR UPDATE`,
        [dto.cashAccountId],
      );
      if (!accRows.length) throw new NotFoundException(`资金账户 ${dto.cashAccountId} 不存在`);
      const acc = accRows[0];
      if (acc.status !== 'ACTIVE') {
        throw new BadRequestException(`资金账户状态 ${acc.status}，不允许付款`);
      }
      if (acc.company_code !== inv.company_code) {
        throw new ForbiddenException(`资金账户 ${acc.account_code} 不属于 AP 公司 ${inv.company_code}`);
      }
      if (acc.currency_code !== inv.currency_code) {
        throw new BadRequestException(`资金账户币种 ${acc.currency_code} 与 AP 币种 ${inv.currency_code} 不一致`);
      }
      if (Number(acc.current_balance) < amount) {
        throw new BadRequestException(
          `账户余额不足：当前 ${acc.current_balance} ${acc.currency_code}，本次付款 ${amount}`,
        );
      }

      const exRate = dto.exchangeRate ?? Number(inv.exchange_rate ?? 1);
      const amountBase = dto.amountBase ?? Math.round(amount * exRate * 100) / 100;
      const baseCurrency = dto.baseCurrency ?? 'CNY';

      let paymentRow: any;
      try {
        const allocNo = await this.genAllocNoIn(qr);
        [paymentRow] = await qr.query(
          `INSERT INTO fin_ap_payment_allocations (
             alloc_no, invoice_id, company_code, company_name,
             currency_code, amount_original, exchange_rate, amount_base, base_currency,
             payment_date, payment_method, bank_account, reference_no,
             cash_account_id, remark, created_by, updated_by
           ) VALUES (
             $1,$2,$3,$4,
             $5,$6,$7,$8,$9,
             $10,$11,$12,$13,
             $14,$15,$16,$16
           )
           RETURNING id, alloc_no`,
          [
            allocNo, id, inv.company_code, inv.company_name ?? null,
            inv.currency_code, amount, exRate, amountBase, baseCurrency,
            dto.paymentDate, dto.paymentMethod ?? null, acc.account_code, dto.referenceNo ?? null,
            acc.id, dto.remark ?? null, user.userId,
          ],
        );
      } catch (err) {
        if (!this.isUndefinedTableError(err)) throw err;
        this.logger.warn('[AP] fin_ap_payment_allocations missing; writing legacy fin_ap_payments record');
        const paymentNo = await this.genLegacyPaymentNoIn(qr);
        [paymentRow] = await qr.query(
          `INSERT INTO fin_ap_payments (
             payment_no, invoice_id, company_code, supplier_code,
             payment_date, amount, currency_code, exchange_rate,
             payment_method, bank_account, reference_no, note,
             cash_account_id, created_by, updated_by
           ) VALUES (
             $1,$2,$3,$4,
             $5,$6,$7,$8,
             $9,$10,$11,$12,
             $13,$14,$14
           )
           RETURNING id, payment_no AS alloc_no`,
          [
            paymentNo, id, inv.company_code, inv.supplier_code ?? '',
            dto.paymentDate, amount, inv.currency_code, exRate,
            dto.paymentMethod ?? null, acc.account_code, dto.referenceNo ?? null, dto.remark ?? null,
            acc.id, user.userId,
          ],
        );
      }

      const newPaid = Number(inv.paid_amount_original) + amount;
      const newPaidBase = Number(inv.paid_amount_base ?? 0) + amountBase;
      const newBalance = Math.max(0, Number(inv.amount_original) - newPaid);
      const newBalanceBase = Math.max(0, Number(inv.balance_amount_base ?? 0) - amountBase);
      const newPaymentStatus = newBalance <= 0.005 ? 'PAID' : 'PARTIAL';
      const newStatus = newBalance <= 0.005 ? 'PAID' : 'PARTIALLY_PAID';

      await qr.query(
        `UPDATE fin_ap_invoices
         SET paid_amount_original = $1,
             paid_amount_base = $2,
             balance_amount_original = $3,
             balance_amount_base = $4,
             status = $5,
             payment_status = $6,
             updated_by = $7,
             updated_at = now()
         WHERE id = $8`,
        [
          newPaid,
          newPaidBase,
          newBalance,
          newBalanceBase,
          newStatus,
          newPaymentStatus,
          user.userId,
          id,
        ],
      );

      const newAccountBalance = await this.cashAccSvc.applyBalance(qr, String(acc.id), -amount, user.userId);
      await this.cashTxnSvc.writeTransaction({
        qr,
        accountId: acc.id,
        accountCode: acc.account_code,
        accountName: acc.account_name,
        companyCode: acc.company_code,
        companyName: acc.company_name,
        direction: 'OUT',
        sourceType: 'AP_PAYMENT',
        sourceId: paymentRow.id,
        sourceNo: paymentRow.alloc_no,
        currencyCode: acc.currency_code,
        amount,
        balanceAfter: newAccountBalance,
        remark: dto.remark ?? `AP 付款核销 ${inv.ap_no}`,
        createdBy: user.userId,
      });

      await qr.commitTransaction();
      this.logger.log(`[AP] 付款核销 AP Invoice #${id} (${inv.ap_no}) amount=${amount} by user ${user.userId}`);
      return this.findById(id);
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(`[AP] payInvoice 事务回滚: ${(err as Error).message}`);
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── 7. 重算付款状态 ───────────────────────────────────────────────────────

  async recalcPaymentStatus(id: string) {
    const rows = await this.ds.query(
      `SELECT amount_original, paid_amount_original, status FROM fin_ap_invoices WHERE id = $1`, [id],
    );
    if (!rows.length) throw new NotFoundException(`AP Invoice #${id} 不存在`);
    const inv     = rows[0];
    const amount  = Number(inv.amount_original);
    const paid    = Number(inv.paid_amount_original);
    const balance = Math.max(0, amount - paid);

    let newStatus        = inv.status;
    let newPaymentStatus = 'UNPAID';

    if (['CANCELLED', 'DISPUTED'].includes(inv.status)) {
      return; // 不重算
    }

    if (paid <= 0) {
      newPaymentStatus = 'UNPAID';
      newStatus        = 'OPEN';
    } else if (balance <= 0.005) {   // 浮点容差 0.005
      newPaymentStatus = 'PAID';
      newStatus        = 'PAID';
    } else {
      newPaymentStatus = 'PARTIAL';
      newStatus        = 'PARTIALLY_PAID';
    }

    await this.ds.query(
      `UPDATE fin_ap_invoices
       SET status = $1, payment_status = $2,
           balance_amount_original = $3,
           updated_at = now()
       WHERE id = $4`,
      [newStatus, newPaymentStatus, balance, id],
    );
  }

  // ── 8. AP Aging（基于 fin_ap_invoices）──────────────────────────────────

  async getAging(companyCode?: string) {
    const user   = this.currentUser();
    const params: any[] = [];
    const conds: string[] = [`status NOT IN ('PAID','CANCELLED')`];

    if (!user.scopeAll && user.companyCodes.length > 0) {
      params.push(user.companyCodes);
      conds.push(`company_code = ANY($${params.length}::text[])`);
    } else if (!user.scopeAll) {
      conds.push('1=0');
    }
    if (companyCode) {
      params.push(companyCode);
      conds.push(`company_code = $${params.length}`);
    }

    const where = `WHERE ${conds.join(' AND ')}`;

    const rows = await this.ds.query(
      `SELECT
         supplier_code,
         supplier_name,
         currency_code,
         SUM(balance_amount_original) FILTER (WHERE due_date IS NULL OR due_date >= CURRENT_DATE)          AS not_due,
         SUM(balance_amount_original) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30) AS bucket_0_30,
         SUM(balance_amount_original) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60) AS bucket_31_60,
         SUM(balance_amount_original) FILTER (WHERE due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90) AS bucket_61_90,
         SUM(balance_amount_original) FILTER (WHERE due_date < CURRENT_DATE - 90)                           AS bucket_90_plus,
         SUM(balance_amount_original)                                                                        AS total_balance,
         COUNT(*)                                                                                            AS invoice_count
       FROM fin_ap_invoices
       ${where}
       GROUP BY supplier_code, supplier_name, currency_code
       ORDER BY total_balance DESC NULLS LAST`,
      params,
    );

    const totals = rows.reduce(
      (acc: any, r: any) => {
        acc.not_due       += Number(r.not_due       ?? 0);
        acc.bucket_0_30   += Number(r.bucket_0_30   ?? 0);
        acc.bucket_31_60  += Number(r.bucket_31_60  ?? 0);
        acc.bucket_61_90  += Number(r.bucket_61_90  ?? 0);
        acc.bucket_90_plus+= Number(r.bucket_90_plus?? 0);
        acc.total_balance += Number(r.total_balance ?? 0);
        return acc;
      },
      { not_due:0, bucket_0_30:0, bucket_31_60:0, bucket_61_90:0, bucket_90_plus:0, total_balance:0 },
    );

    return {
      source:  'fin_ap_invoices',
      buckets: { NOT_DUE: totals.not_due, '0_30': totals.bucket_0_30, '31_60': totals.bucket_31_60, '61_90': totals.bucket_61_90, '90_PLUS': totals.bucket_90_plus },
      totalBalance: totals.total_balance,
      bySupplier: rows,
      asOf: new Date().toISOString(),
    };
  }

  // ── 9. AP Summary（基于 fin_ap_invoices）────────────────────────────────

  async getSummary(companyCode?: string) {
    const user   = this.currentUser();
    const params: any[] = [];
    const conds: string[] = ['1=1'];

    if (!user.scopeAll && user.companyCodes.length > 0) {
      params.push(user.companyCodes);
      conds.push(`company_code = ANY($${params.length}::text[])`);
    } else if (!user.scopeAll) {
      conds.push('1=0');
    }
    if (companyCode) {
      params.push(companyCode);
      conds.push(`company_code = $${params.length}`);
    }

    const where = `WHERE ${conds.join(' AND ')}`;

    const [summary, byCurrency, byStatus] = await Promise.all([
      this.ds.query(
        `SELECT
           COUNT(*)::int                                                AS total_invoices,
           COUNT(*) FILTER (WHERE status = 'OPEN')::int                AS open_invoices,
           COUNT(*) FILTER (WHERE status = 'PARTIALLY_PAID')::int      AS partial_invoices,
           COUNT(*) FILTER (WHERE status = 'PAID')::int                AS paid_invoices,
           COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('PAID','CANCELLED'))::int AS overdue_invoices,
           SUM(amount_original)                                         AS total_amount_original,
           SUM(paid_amount_original)                                    AS paid_amount_original,
           SUM(balance_amount_original) FILTER (WHERE status NOT IN ('PAID','CANCELLED')) AS balance_amount_original,
           SUM(balance_amount_original) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('PAID','CANCELLED')) AS overdue_balance
         FROM fin_ap_invoices ${where}`,
        params,
      ),
      this.ds.query(
        `SELECT currency_code,
                SUM(amount_original) AS amount, SUM(balance_amount_original) AS balance,
                COUNT(*) AS count
         FROM fin_ap_invoices ${where}
         GROUP BY currency_code ORDER BY amount DESC NULLS LAST`,
        params,
      ),
      this.ds.query(
        `SELECT status, COUNT(*) AS count, SUM(amount_original) AS amount
         FROM fin_ap_invoices ${where}
         GROUP BY status ORDER BY count DESC`,
        params,
      ),
    ]);

    return {
      source:     'fin_ap_invoices',
      ...summary[0],
      byCurrency,
      byStatus,
      asOf: new Date().toISOString(),
    };
  }

  // ── 10. 从 prc2_ap_ledger 幂等导入 ───────────────────────────────────────

	  async importFromPrc2(companyCode?: string) {
	    const user = this.currentUser();

    // DataScope 过滤
    const params: any[] = [];
    const conds: string[] = ['1=1'];
    if (!user.scopeAll && user.companyCodes.length > 0) {
      params.push(user.companyCodes);
      conds.push(`company_code = ANY($${params.length}::text[])`);
    } else if (!user.scopeAll) {
      conds.push('1=0');
    }
    if (companyCode) {
      if (!user.scopeAll && user.companyCodes.length === 0) {
        throw new ForbiddenException('无权导入 AP Invoice（数据范围未配置）');
      }
      if (!user.scopeAll && !user.companyCodes.includes(companyCode)) {
        throw new ForbiddenException(`无权导入公司 ${companyCode} 的 AP Invoice`);
      }
      params.push(companyCode);
      conds.push(`company_code = $${params.length}`);
    }

    const prc2Rows = await this.ds.query(
      `SELECT * FROM prc2_ap_ledger WHERE ${conds.join(' AND ')} ORDER BY id`,
      params,
    );

    let imported = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const row of prc2Rows) {
      try {
        this.assertWritableOwnership(row.company_code, row.project_code);
        // 幂等检查：同 source_type=PO + source_id 不重复导入
        const exists = await this.ds.query(
          `SELECT id FROM fin_ap_invoices WHERE source_type='PO' AND source_id = $1 LIMIT 1`,
          [row.po_id ?? row.id],
        );
        if (exists.length) { skipped++; continue; }

        // ap_no 冲突检查（用原 ap_no，如存在则跳过）
        if (row.ap_no) {
          const apExists = await this.ds.query(
            `SELECT id FROM fin_ap_invoices WHERE ap_no = $1 LIMIT 1`, [row.ap_no],
          );
          if (apExists.length) { skipped++; continue; }
        }

        const amount  = Number(row.amount_original  ?? 0);
        const paid    = Number(row.paid_amount_original ?? 0);
        const balance = Math.max(0, amount - paid);
        const exRate  = Number(row.exchange_rate ?? 1);
        const pStatus = paid <= 0 ? 'UNPAID' : (balance <= 0.005 ? 'PAID' : 'PARTIAL');
        const status  = paid <= 0 ? 'OPEN'   : (balance <= 0.005 ? 'PAID' : 'PARTIALLY_PAID');

        const apNo = row.ap_no ?? await this.genApNo();

        await this.ds.query(
          `INSERT INTO fin_ap_invoices (
             ap_no, source_type, source_id, source_no,
             company_code, company_name, project_code, project_name,
             supplier_id, supplier_code, supplier_name,
             invoice_date, due_date,
             currency_code, amount_original, exchange_rate, amount_base, base_currency,
             paid_amount_original, paid_amount_base, balance_amount_original, balance_amount_base,
             status, payment_status, remark, created_by, updated_by
           ) VALUES (
             $1,'PO',$2,$3,
             $4,$5,$6,$7,
             $8,$9,$10,
             $11,$12,
             $13,$14,$15,$16,'CNY',
             $17,$18,$19,$20,
             $21,$22,$23,$24,$24
           )`,
          [
            apNo, row.po_id ?? row.id, row.po_no ?? null,
            row.company_code, row.company_name ?? null, row.project_code ?? null, row.project_name ?? null,
            row.supplier_id ?? null, row.supplier_code ?? null, row.supplier_name ?? '未知供应商',
            row.invoice_date ?? null, row.due_date ?? null,
            row.currency_code ?? 'CNY', amount, exRate,
            Number(row.amount_base ?? amount * exRate),
            paid, Math.round(paid * exRate * 100) / 100,
            balance, Math.round(balance * exRate * 100) / 100,
            status, pStatus,
            row.remark ?? null, user.userId,
          ],
        );
        imported++;
      } catch (err: any) {
        failed++;
        errors.push(`prc2 id=${row.id}: ${err.message}`);
        this.logger.warn(`[AP Import] 导入失败 prc2 id=${row.id}: ${err.message}`);
      }
    }

    this.logger.log(`[AP Import] 完成 imported=${imported} skipped=${skipped} failed=${failed}`);
    return {
      source:   'prc2_ap_ledger',
      total:    prc2Rows.length,
      imported,
      skipped,
      failed,
      errors:   errors.slice(0, 20),  // 最多返回 20 条错误
    };
  }
}
