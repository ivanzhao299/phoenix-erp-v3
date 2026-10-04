import {
  Injectable, Logger, NotFoundException,
  ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import { ClsService }       from 'nestjs-cls';
import type { DataScopeContext } from '../../org/services/data-scope.service';
import {
  CreateArInvoiceDto,
  UpdateArInvoiceDto,
  QueryArInvoiceDto,
  CancelArInvoiceDto,
} from '../dto/ar-invoice.dto';

/**
 * ArInvoicesService — Finance V2 Phase 2 AR Runtime
 *
 * 正式 AR Runtime，基于 fin_ar_invoices。
 * DataScope：所有列表接口严格按当前用户 companyCodes 过滤。
 * assertOwnership：详情/写操作验证 company_code 在 DataScope 范围内。
 */
@Injectable()
export class ArInvoicesService {
  private readonly logger = new Logger(ArInvoicesService.name);

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  // ── 内部工具 ──────────────────────────────────────────────────────────────

  private currentUser() {
    const u = this.cls.get('user') as any;
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    return {
      userId:       String(u?.userId ?? u?.id ?? '0'),
      roles:        (u?.roles ?? (u?.role ? [u.role] : [])) as string[],
      companyCodes: (scope?.allowedCompanyCodes ?? u?.companyCodes ?? []) as string[],
      projectCodes: (scope?.allowedProjectCodes ?? u?.projectCodes ?? []) as string[],
      scopeLevel:   scope?.scopeLevel ?? u?.scopeLevel ?? 'SELF',
      scopeAll:     scope ? !!scope.isGlobal : !!(u?.scopeAll),
    };
  }

  private assertWritableOwnership(companyCode?: string | null, projectCode?: string | null): void {
    const user = this.currentUser();
    if (user.scopeAll) return;
    if (!companyCode) throw new ForbiddenException('无权写入 AR Invoice（缺少公司归属）');
    if (!user.companyCodes.length) throw new ForbiddenException('无权写入 AR Invoice（数据范围未配置）');
    if (!user.companyCodes.includes(companyCode)) {
      throw new ForbiddenException(`无权写入公司 ${companyCode} 的 AR Invoice`);
    }
    if (user.scopeLevel === 'PROJECT' && user.projectCodes.length > 0) {
      if (!projectCode) throw new ForbiddenException('无权写入 AR Invoice（缺少项目归属）');
      if (!user.projectCodes.includes(projectCode)) {
        throw new ForbiddenException(`无权写入项目 ${projectCode} 的 AR Invoice`);
      }
    }
  }

  /** 生成 AR 编号 AR-YYYYMM-XXXXX */
  async genArNo(): Promise<string> {
    const ym     = new Date().toISOString().slice(0, 7).replace('-', '');
    const prefix = `AR-${ym}-`;
    const row    = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM fin_ar_invoices WHERE ar_no LIKE $1`,
      [`${prefix}%`],
    );
    const seq = String(Number(row[0]?.cnt ?? 0) + 1).padStart(5, '0');
    return `${prefix}${seq}`;
  }

  /** assertOwnership：确认 AR 的 company_code 在当前用户 DataScope 内 */
  async assertOwnership(arId: string): Promise<any> {
    const rows = await this.ds.query(
      `SELECT id, ar_no, company_code, project_code, status, collection_status,
              amount_original, received_amount_original, balance_amount_original,
              currency_code, customer_name
       FROM fin_ar_invoices WHERE id = $1`,
      [arId],
    );
    if (!rows.length) throw new NotFoundException(`AR Invoice #${arId} 不存在`);
    const inv  = rows[0];
    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length === 0) {
      throw new ForbiddenException('无权访问 AR Invoice（数据范围未配置）');
    }
    if (!user.scopeAll && !user.companyCodes.includes(inv.company_code)) {
      throw new ForbiddenException(`无权访问公司 ${inv.company_code} 的 AR Invoice`);
    }
    if (!user.scopeAll && user.scopeLevel === 'PROJECT' && user.projectCodes.length > 0 &&
        !user.projectCodes.includes(inv.project_code)) {
      throw new ForbiddenException(`无权访问项目 ${inv.project_code ?? '(未指定)'} 的 AR Invoice`);
    }
    return inv;
  }

  // ── 1. 列表 ───────────────────────────────────────────────────────────────

  async list(q: QueryArInvoiceDto) {
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
      if (user.scopeLevel === 'PROJECT' && user.projectCodes.length > 0) {
        params.push(user.projectCodes);
        conditions.push(`i.project_code = ANY($${params.length}::text[])`);
      }
    } else if (!user.scopeAll) {
      conditions.push('1=0');
    }

    if (q.companyCode)      { params.push(q.companyCode);      conditions.push(`i.company_code      = $${params.length}`); }
    if (q.projectCode)      { params.push(q.projectCode);      conditions.push(`i.project_code      = $${params.length}`); }
    if (q.customerCode)     { params.push(q.customerCode);     conditions.push(`i.customer_code     = $${params.length}`); }
    if (q.status)           { params.push(q.status);           conditions.push(`i.status            = $${params.length}`); }
    if (q.collectionStatus) { params.push(q.collectionStatus); conditions.push(`i.collection_status = $${params.length}`); }
    if (q.currencyCode)     { params.push(q.currencyCode);     conditions.push(`i.currency_code     = $${params.length}`); }
    if (q.sourceType)       { params.push(q.sourceType);       conditions.push(`i.source_type       = $${params.length}`); }
    if (q.dateFrom)         { params.push(q.dateFrom);         conditions.push(`i.invoice_date      >= $${params.length}`); }
    if (q.dateTo)           { params.push(q.dateTo);           conditions.push(`i.invoice_date      <= $${params.length}`); }
    if (q.keyword) {
      params.push(`%${q.keyword}%`);
      conditions.push(
        `(i.ar_no ILIKE $${params.length} OR i.customer_name ILIKE $${params.length} OR i.invoice_no ILIKE $${params.length})`,
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countParams = [...params];
    params.push(pageSize, offset);

    const [rows, countRow] = await Promise.all([
      this.ds.query(
        `SELECT i.id, i.ar_no, i.source_type, i.source_no,
                i.company_code, i.company_name, i.project_code, i.project_name,
                i.customer_code, i.customer_name, i.invoice_no,
                i.invoice_date, i.due_date,
                i.currency_code, i.amount_original, i.exchange_rate,
                i.amount_base, i.base_currency,
                i.received_amount_original, i.balance_amount_original,
                i.status, i.collection_status, i.remark, i.created_at,
                CASE
                  WHEN i.due_date IS NULL THEN 'NOT_DUE'
                  WHEN i.due_date >= CURRENT_DATE THEN 'NOT_DUE'
                  WHEN i.due_date >= CURRENT_DATE - 30 THEN '0_30'
                  WHEN i.due_date >= CURRENT_DATE - 60 THEN '31_60'
                  WHEN i.due_date >= CURRENT_DATE - 90 THEN '61_90'
                  ELSE '90_PLUS'
                END AS aging_bucket
         FROM fin_ar_invoices i
         ${where}
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      this.ds.query(
        `SELECT COUNT(*)::int AS cnt FROM fin_ar_invoices i ${where}`,
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

  // ── 2. 详情 ───────────────────────────────────────────────────────────────

  async findById(id: string) {
    const inv = await this.assertOwnership(id);
    // 取收款核销记录
    const allocs = await this.ds.query(
      `SELECT a.id, a.receipt_no, a.allocated_amount_original, a.currency_code,
              r.receipt_date, r.receipt_method, r.bank_ref, r.status AS receipt_status,
              a.created_at
       FROM fin_ar_receipt_allocations a
       JOIN fin_ar_receipts r ON r.id = a.receipt_id
       WHERE a.ar_invoice_id = $1
       ORDER BY a.created_at DESC`,
      [id],
    );
    // 完整字段
    const fullRows = await this.ds.query(
      `SELECT * FROM fin_ar_invoices WHERE id = $1`, [id],
    );
    return { ...fullRows[0], allocations: allocs };
  }

  // ── 3. 手工创建 AR ────────────────────────────────────────────────────────

  async createManual(dto: CreateArInvoiceDto) {
    const user   = this.currentUser();
    this.assertWritableOwnership(dto.companyCode, dto.projectCode);
    const arNo   = await this.genArNo();
    const exRate = dto.exchangeRate ?? 1;
    const amtBase = dto.amountBase ?? Math.round(dto.amountOriginal * exRate * 100) / 100;

    await this.ds.query(
      `INSERT INTO fin_ar_invoices (
         ar_no, source_type,
         company_code, company_name, project_code, project_name,
         customer_id, customer_code, customer_name,
         invoice_no, invoice_date, due_date,
         currency_code, amount_original, exchange_rate, amount_base, base_currency,
         received_amount_original, received_amount_base,
         balance_amount_original, balance_amount_base,
         status, collection_status, remark, created_by, updated_by
       ) VALUES (
         $1,'MANUAL',
         $2,$3,$4,$5,
         $6,$7,$8,
         $9,$10,$11,
         $12,$13,$14,$15,$16,
         0,0,$13,$15,
         'OPEN','UNRECEIVED',$17,$18,$18
       )`,
      [
        arNo,
        dto.companyCode, dto.companyName ?? null, dto.projectCode ?? null, dto.projectName ?? null,
        dto.customerId ?? null, dto.customerCode ?? null, dto.customerName,
        dto.invoiceNo ?? null, dto.invoiceDate ?? null, dto.dueDate ?? null,
        dto.currencyCode, dto.amountOriginal, exRate, amtBase, dto.baseCurrency ?? 'CNY',
        dto.remark ?? null, user.userId,
      ],
    );

    const row = await this.ds.query(
      `SELECT * FROM fin_ar_invoices WHERE ar_no = $1`, [arNo],
    );
    this.logger.log(`[AR] 手工创建 AR Invoice: ${arNo} company=${dto.companyCode}`);
    // bigint → number：node-postgres 将 bigint 序列化为字符串，显式转换确保 JSON 输出为数字
    return { ...row[0], id: Number(row[0].id) };
  }

  // ── 4. 更新（仅 OPEN / PARTIALLY_RECEIVED 可编辑）─────────────────────────

  async update(id: string, dto: UpdateArInvoiceDto) {
    const inv  = await this.assertOwnership(id);
    if (!['OPEN', 'PARTIALLY_RECEIVED'].includes(inv.status)) {
      throw new BadRequestException(`状态 ${inv.status} 不允许修改`);
    }

    const user = this.currentUser();
    const sets: string[] = [];
    const params: any[]  = [];

    const push = (col: string, val: any) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (dto.invoiceNo    !== undefined) push('invoice_no',    dto.invoiceNo);
    if (dto.invoiceDate  !== undefined) push('invoice_date',  dto.invoiceDate);
    if (dto.dueDate      !== undefined) push('due_date',      dto.dueDate);
    if (dto.customerName !== undefined) push('customer_name', dto.customerName);
    if (dto.projectCode  !== undefined) push('project_code',  dto.projectCode);
    if (dto.projectName  !== undefined) push('project_name',  dto.projectName);
    if (dto.remark       !== undefined) push('remark',        dto.remark);

    if (dto.amountOriginal !== undefined || dto.exchangeRate !== undefined) {
      const newAmt  = dto.amountOriginal ?? Number(inv.amount_original);
      const newRate = dto.exchangeRate   ?? Number(inv.exchange_rate);
      const newBase = Math.round(newAmt * newRate * 100) / 100;
      const newBalance = newAmt - Number(inv.received_amount_original);
      if (newBalance < 0) throw new BadRequestException('修改后金额不能小于已收款金额');
      push('amount_original',    newAmt);
      push('exchange_rate',      newRate);
      push('amount_base',        newBase);
      push('balance_amount_original', newBalance);
      push('balance_amount_base',     Math.round(newBalance * newRate * 100) / 100);
    }

    if (!sets.length) return inv;

    params.push(user.userId); sets.push(`updated_by = $${params.length}`);
    params.push(id);
    await this.ds.query(
      `UPDATE fin_ar_invoices SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
      params,
    );
    return this.findById(id);
  }

  // ── 5. 取消（未收款可取消）───────────────────────────────────────────────

  async cancel(id: string, dto: CancelArInvoiceDto) {
    const inv = await this.assertOwnership(id);

    if (inv.status === 'RECEIVED') {
      throw new BadRequestException('已收清的 AR Invoice 不能取消');
    }
    if (inv.status === 'CANCELLED') {
      throw new BadRequestException('AR Invoice 已取消');
    }
    if (Number(inv.received_amount_original) > 0) {
      throw new BadRequestException('已有收款记录，不能直接取消，请先处理收款核销');
    }

    const user = this.currentUser();
    await this.ds.query(
      `UPDATE fin_ar_invoices
       SET status = 'CANCELLED', collection_status = 'UNRECEIVED',
           remark = COALESCE(remark, '') || $1,
           updated_by = $2, updated_at = now()
       WHERE id = $3`,
      [
        dto.reason ? ` [取消原因: ${dto.reason}]` : '',
        user.userId, id,
      ],
    );

    this.logger.log(`[AR] 取消 AR Invoice #${id} (${inv.ar_no}) by user ${user.userId}`);
    return { id, arNo: inv.ar_no, status: 'CANCELLED' };
  }

  // ── 6. 重算收款状态 ───────────────────────────────────────────────────────

  async recalcCollectionStatus(id: string) {
    const rows = await this.ds.query(
      `SELECT amount_original, received_amount_original, status FROM fin_ar_invoices WHERE id = $1`,
      [id],
    );
    if (!rows.length) return;
    const inv     = rows[0];
    const amount  = Number(inv.amount_original);
    const received = Number(inv.received_amount_original);
    const balance = Math.max(0, amount - received);

    if (['CANCELLED', 'DISPUTED', 'WRITTEN_OFF'].includes(inv.status)) return;

    let newStatus           = inv.status;
    let newCollectionStatus = 'UNRECEIVED';

    if (received <= 0) {
      newCollectionStatus = 'UNRECEIVED';
      newStatus           = 'OPEN';
    } else if (balance <= 0.005) {
      newCollectionStatus = 'RECEIVED';
      newStatus           = 'RECEIVED';
    } else {
      newCollectionStatus = 'PARTIAL';
      newStatus           = 'PARTIALLY_RECEIVED';
    }

    await this.ds.query(
      `UPDATE fin_ar_invoices
       SET status = $1, collection_status = $2,
           balance_amount_original = $3, updated_at = now()
       WHERE id = $4`,
      [newStatus, newCollectionStatus, balance, id],
    );
  }

  // ── 7. AR Aging ───────────────────────────────────────────────────────────

  async getAging(companyCode?: string) {
    const user   = this.currentUser();
    const params: any[] = [];
    const conds: string[] = [`status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')`];

    if (!user.scopeAll && user.companyCodes.length > 0) {
      params.push(user.companyCodes);
      conds.push(`company_code = ANY($${params.length}::text[])`);
      if (user.scopeLevel === 'PROJECT' && user.projectCodes.length > 0) {
        params.push(user.projectCodes);
        conds.push(`project_code = ANY($${params.length}::text[])`);
      }
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
         customer_code, customer_name, currency_code,
         SUM(balance_amount_original) FILTER (WHERE due_date IS NULL OR due_date >= CURRENT_DATE)                AS not_due,
         SUM(balance_amount_original) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30)   AS bucket_0_30,
         SUM(balance_amount_original) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60) AS bucket_31_60,
         SUM(balance_amount_original) FILTER (WHERE due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90) AS bucket_61_90,
         SUM(balance_amount_original) FILTER (WHERE due_date < CURRENT_DATE - 90)                                 AS bucket_90_plus,
         SUM(balance_amount_original)                                                                              AS total_balance,
         COUNT(*)                                                                                                  AS invoice_count
       FROM fin_ar_invoices ${where}
       GROUP BY customer_code, customer_name, currency_code
       ORDER BY total_balance DESC NULLS LAST`,
      params,
    );

    const totals = rows.reduce(
      (acc: any, r: any) => {
        acc.not_due        += Number(r.not_due        ?? 0);
        acc.bucket_0_30    += Number(r.bucket_0_30    ?? 0);
        acc.bucket_31_60   += Number(r.bucket_31_60   ?? 0);
        acc.bucket_61_90   += Number(r.bucket_61_90   ?? 0);
        acc.bucket_90_plus += Number(r.bucket_90_plus ?? 0);
        acc.total_balance  += Number(r.total_balance  ?? 0);
        return acc;
      },
      { not_due: 0, bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0, total_balance: 0 },
    );

    return {
      source:  'fin_ar_invoices',
      buckets: {
        NOT_DUE:  totals.not_due,
        '0_30':   totals.bucket_0_30,
        '31_60':  totals.bucket_31_60,
        '61_90':  totals.bucket_61_90,
        '90_PLUS':totals.bucket_90_plus,
      },
      totalBalance: totals.total_balance,
      byCustomer:   rows,
      asOf: new Date().toISOString(),
    };
  }

  // ── 8. AR Summary ─────────────────────────────────────────────────────────

  async getSummary(companyCode?: string) {
    const user   = this.currentUser();
    const params: any[] = [];
    const conds: string[] = ['1=1'];

    if (!user.scopeAll && user.companyCodes.length > 0) {
      params.push(user.companyCodes);
      conds.push(`company_code = ANY($${params.length}::text[])`);
      if (user.scopeLevel === 'PROJECT' && user.projectCodes.length > 0) {
        params.push(user.projectCodes);
        conds.push(`project_code = ANY($${params.length}::text[])`);
      }
    } else if (!user.scopeAll) {
      conds.push('1=0');
    }
    if (companyCode) {
      params.push(companyCode);
      conds.push(`company_code = $${params.length}`);
    }

    const where = `WHERE ${conds.join(' AND ')}`;

    const [summary, byCurrency, byStatus, topCustomers] = await Promise.all([
      this.ds.query(
        `SELECT
           COUNT(*)::int                                                            AS total_invoices,
           COUNT(*) FILTER (WHERE status = 'OPEN')::int                            AS open_invoices,
           COUNT(*) FILTER (WHERE status = 'PARTIALLY_RECEIVED')::int              AS partial_invoices,
           COUNT(*) FILTER (WHERE status = 'RECEIVED')::int                        AS received_invoices,
           COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF'))::int AS overdue_invoices,
           SUM(amount_original)                                                     AS total_amount_original,
           SUM(received_amount_original)                                            AS received_amount_original,
           SUM(balance_amount_original) FILTER (WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')) AS balance_amount_original,
           SUM(balance_amount_original) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')) AS overdue_balance
         FROM fin_ar_invoices ${where}`,
        params,
      ),
      this.ds.query(
        `SELECT currency_code,
                SUM(amount_original) AS amount, SUM(balance_amount_original) AS balance,
                COUNT(*) AS count
         FROM fin_ar_invoices ${where}
         GROUP BY currency_code ORDER BY amount DESC NULLS LAST`,
        params,
      ),
      this.ds.query(
        `SELECT status, COUNT(*) AS count, SUM(amount_original) AS amount
         FROM fin_ar_invoices ${where}
         GROUP BY status ORDER BY count DESC`,
        params,
      ),
      this.ds.query(
        `SELECT customer_code, customer_name,
                SUM(balance_amount_original) AS balance, COUNT(*) AS count
         FROM fin_ar_invoices
         WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF')
           ${conds.length > 1 ? 'AND ' + conds.slice(1).map((_c, i) => _c.replace(`$${i+1}`, `$${i+1}`)).join(' AND ') : ''}
         GROUP BY customer_code, customer_name
         ORDER BY balance DESC NULLS LAST
         LIMIT 10`,
        params,
      ),
    ]);

    return {
      source: 'fin_ar_invoices',
      ...summary[0],
      byCurrency,
      byStatus,
      topCustomers,
      asOf: new Date().toISOString(),
    };
  }
}
