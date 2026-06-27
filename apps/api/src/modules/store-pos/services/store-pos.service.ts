/**
 * Phoenix ERP V3 — Store POS Service
 * Sales V2 Phase 9: 直营店收银作业台
 *
 * 核心业务流：
 *   createSale() → completeCashSale() / completeCreditSale() / completeMixedSale()
 *
 * 联动：
 *   - Finance Cash Runtime：现金/混付部分 → fin_cash_transactions
 *   - Finance AR Runtime：赊销/混付欠款 → fin_ar_invoices
 *   - Egg Inventory Runtime：FIFO 扣减 inv_batches + inv_ledger（FIFO_OUT）
 *
 * 安全：
 *   - 日结后不可修改（shift 已 CLOSED）
 *   - 作废必须记录操作日志
 *   - 收款操作写 OperationLog（由 OperationLogInterceptor 覆盖）
 */
import {
  Injectable, NotFoundException, BadRequestException,
  ConflictException, Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';

export interface SaleItemDto {
  productCode:    string;
  productName:    string;
  gradeCode?:     string;
  packagingSpec?: string;
  qty:            number;
  unitPrice:      number;
  /** Phase H5: SKU 编码（可选，传入后写入 sal_store_sale_items.sku_code，FIFO 使用 PATH A） */
  skuCode?:       string;
}

export interface CreateSaleDto {
  storeCode:      string;
  storeName:      string;
  companyCode:    string;
  companyName?:   string;
  customerCode?:  string;
  customerName?:  string;
  customerId?:    number;
  saleType:       'CASH' | 'CREDIT' | 'MIXED';
  paymentMethod?: string;
  discountAmount?: number;
  items:          SaleItemDto[];
}

export interface CompleteCashSaleDto {
  cashAccountId:   number;
  paidAmount?:     number;   // 默认全额
  paymentMethod?:  string;
}

export interface CompleteMixedSaleDto {
  cashAccountId:  number;
  paidAmount:     number;
  paymentMethod?: string;
  customerCode?:  string;
  customerName?:  string;
}

@Injectable()
export class StorePosService {
  private readonly logger = new Logger(StorePosService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  // ── 工具 ───────────────────────────────────────────────────────────────────

  private get currentUser() {
    try { return this.cls.get('user') as any ?? {}; } catch { return {}; }
  }

  private async genSaleNo(): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [r] = await this.ds.query(`SELECT nextval('seq_store_sale_no') AS n`);
    return `POS-${dateStr}-${String(r.n).padStart(5, '0')}`;
  }

  private async getSale(id: number) {
    const [sale] = await this.ds.query<any[]>(
      `SELECT s.*, array_agg(
         json_build_object(
           'id', i.id,'product_code',i.product_code,'product_name',i.product_name,
           'grade_code',i.grade_code,'packaging_spec',i.packaging_spec,
           'qty',i.qty,'unit_price',i.unit_price,'amount',i.amount,'batch_no',i.batch_no
         ) ORDER BY i.sort_order
       ) AS items
       FROM sal_store_sales s
       LEFT JOIN sal_store_sale_items i ON i.sale_id = s.id
       WHERE s.id = $1
       GROUP BY s.id`,
      [id],
    );
    if (!sale) throw new NotFoundException(`销售单 ${id} 不存在`);
    return sale;
  }

  // ── 1. 创建销售单 ──────────────────────────────────────────────────────────

  async createSale(dto: CreateSaleDto) {
    const user    = this.currentUser;
    const saleNo  = await this.genSaleNo();
    const discount = dto.discountAmount ?? 0;

    // 计算金额
    const subtotal = dto.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const total    = Math.max(0, subtotal - discount);

    // 事务：插入主表 + 明细行
    return this.ds.transaction(async mgr => {
      const [saleRow] = await mgr.query(
        `INSERT INTO sal_store_sales
          (sale_no, store_code, store_name, company_code, company_name,
           customer_code, customer_name, customer_id,
           sale_type, payment_method,
           subtotal, discount_amount, total_amount, paid_amount, receivable_amount,
           payment_status, status,
           created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,$13,'UNPAID','OPEN',$14,$15)
         RETURNING id, sale_no`,
        [
          saleNo,
          dto.storeCode,
          dto.storeName,
          dto.companyCode,
          dto.companyName ?? null,
          dto.customerCode ?? null,
          dto.customerName ?? '散客',
          dto.customerId ?? null,
          dto.saleType,
          dto.paymentMethod ?? 'CASH',
          subtotal,
          discount,
          total,
          user?.userId ?? user?.id ?? null,
          user?.name ?? user?.username ?? null,
        ],
      );

      const saleId = saleRow.id;

      // 插入明细行
      for (let idx = 0; idx < dto.items.length; idx++) {
        const item = dto.items[idx];
        const amount = Math.round(item.qty * item.unitPrice * 100) / 100;
        await mgr.query(
          `INSERT INTO sal_store_sale_items
            (sale_id, product_code, product_name, grade_code, packaging_spec,
             qty, unit_price, amount, sort_order, sku_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [saleId, item.productCode, item.productName,
           item.gradeCode ?? null, item.packagingSpec ?? null,
           item.qty, item.unitPrice, amount, (idx + 1) * 10,
           item.skuCode ?? null],  // Phase H5
        );
      }

      return { id: saleId, saleNo, totalAmount: total };
    });
  }

  // ── 2. 现金收款（完整收款）────────────────────────────────────────────────

  async completeCashSale(id: number, dto: CompleteCashSaleDto) {
    const sale = await this.getSale(id);
    this.guardStatus(sale, 'OPEN');

    const paidAmount = dto.paidAmount ?? Number(sale.total_amount);
    if (paidAmount < Number(sale.total_amount)) {
      throw new BadRequestException('现金收款金额不足，请使用"部分收款"');
    }

    await this.ds.transaction(async mgr => {
      // A. FIFO 扣减库存
      const allocs = await this.fifoDeductItems(sale, mgr);

      // B. 写 fin_cash_transactions
      await this.writeCashTransaction(mgr, {
        accountId:    dto.cashAccountId,
        companyCode:  sale.company_code,
        amount:       Number(sale.total_amount),
        sourceType:   'STORE_SALE',
        sourceId:     sale.id,
        sourceNo:     sale.sale_no,
        remark:       `门店收银 ${sale.sale_no}（${sale.store_name}）`,
      });

      // C. 更新销售单（FIFO 写回 batch_no）
      await mgr.query(
        `UPDATE sal_store_sales
         SET status = 'COMPLETED', payment_status = 'PAID',
             paid_amount = $2, receivable_amount = 0,
             cash_account_id = $3,
             completed_at = NOW()
         WHERE id = $1`,
        [id, paidAmount, dto.cashAccountId],
      );

      // D. 写回批次号到明细行
      await this.writeBatchNoBack(mgr, sale.id, allocs);
    });

    return this.getSale(id);
  }

  // ── 3. 赊销（不收现金，生成 AR）──────────────────────────────────────────

  async completeCreditSale(id: number) {
    const sale = await this.getSale(id);
    this.guardStatus(sale, 'OPEN');
    if (!sale.customer_code && !sale.customer_name) {
      throw new BadRequestException('赊销必须填写客户信息');
    }

    await this.ds.transaction(async mgr => {
      // A. FIFO 扣减库存
      const allocs = await this.fifoDeductItems(sale, mgr);

      // B. 生成 AR 发票
      const arId = await this.createArInvoice(mgr, {
        companyCode:  sale.company_code,
        customerCode: sale.customer_code,
        customerName: sale.customer_name ?? '散客',
        amount:       Number(sale.total_amount),
        sourceId:     sale.id,
        sourceNo:     sale.sale_no,
      });

      // C. 更新销售单
      await mgr.query(
        `UPDATE sal_store_sales
         SET status = 'COMPLETED', payment_status = 'UNPAID',
             paid_amount = 0, receivable_amount = $2,
             ar_invoice_id = $3, completed_at = NOW()
         WHERE id = $1`,
        [id, sale.total_amount, arId],
      );

      await this.writeBatchNoBack(mgr, sale.id, allocs);
    });

    return this.getSale(id);
  }

  // ── 4. 部分收款（现金 + AR）──────────────────────────────────────────────

  async completeMixedSale(id: number, dto: CompleteMixedSaleDto) {
    const sale = await this.getSale(id);
    this.guardStatus(sale, 'OPEN');

    const total       = Number(sale.total_amount);
    const paid        = dto.paidAmount;
    const receivable  = Math.round((total - paid) * 100) / 100;

    if (paid <= 0) throw new BadRequestException('实收金额必须大于 0');
    if (paid >= total) throw new BadRequestException('实收等于或超过总金额，请使用现金收款');

    const custName = dto.customerName ?? sale.customer_name ?? '散客';

    await this.ds.transaction(async mgr => {
      // A. FIFO 扣减
      const allocs = await this.fifoDeductItems(sale, mgr);

      // B. 实收部分写 Cash
      await this.writeCashTransaction(mgr, {
        accountId:   dto.cashAccountId,
        companyCode: sale.company_code,
        amount:      paid,
        sourceType:  'STORE_SALE',
        sourceId:    sale.id,
        sourceNo:    sale.sale_no,
        remark:      `门店部分收款 ${sale.sale_no} 实收=${paid}`,
      });

      // C. 未收部分生成 AR
      const arId = await this.createArInvoice(mgr, {
        companyCode:  sale.company_code,
        customerCode: dto.customerCode ?? sale.customer_code,
        customerName: custName,
        amount:       receivable,
        sourceId:     sale.id,
        sourceNo:     sale.sale_no,
      });

      // D. 更新销售单
      await mgr.query(
        `UPDATE sal_store_sales
         SET status = 'COMPLETED', payment_status = 'PARTIAL',
             paid_amount = $2, receivable_amount = $3,
             cash_account_id = $4, ar_invoice_id = $5,
             completed_at = NOW()
         WHERE id = $1`,
        [id, paid, receivable, dto.cashAccountId, arId],
      );

      await this.writeBatchNoBack(mgr, sale.id, allocs);
    });

    return this.getSale(id);
  }

  // ── 5. 作废销售单 ─────────────────────────────────────────────────────────

  async voidSale(id: number, reason: string) {
    const sale = await this.getSale(id);
    if (sale.status === 'VOID') throw new BadRequestException('已作废，不可重复操作');
    if (sale.status === 'COMPLETED') {
      throw new BadRequestException('已完成的销售单不可直接作废，请走退货流程');
    }

    const user = this.currentUser;
    await this.ds.query(
      `UPDATE sal_store_sales
       SET status = 'VOID', void_reason = $2, completed_at = NOW()
       WHERE id = $1`,
      [id, reason ?? '手动作废'],
    );

    this.logger.warn(
      `[StorePOS] 作废 ${sale.sale_no} by ${user?.username ?? '?'} reason=${reason}`,
    );
    return { ok: true, saleNo: sale.sale_no };
  }

  // ── 6. 查询 ──────────────────────────────────────────────────────────────

  async list(params: {
    storeCode?:     string;
    companyCode?:   string;
    status?:        string;
    saleType?:      string;
    paymentStatus?: string;
    dateFrom?:      string;
    dateTo?:        string;
    page?:          number;
    limit?:         number;
  }) {
    const page   = Math.max(1, params.page  ?? 1);
    const limit  = Math.min(200, params.limit ?? 50);
    const offset = (page - 1) * limit;

    const conds: string[] = ['1=1'];
    const vals:  any[]    = [];
    let idx = 1;

    if (params.storeCode)     { conds.push(`store_code = $${idx++}`);      vals.push(params.storeCode);     }
    if (params.companyCode)   { conds.push(`company_code = $${idx++}`);   vals.push(params.companyCode);   }
    if (params.status)        { conds.push(`status = $${idx++}`);         vals.push(params.status);        }
    if (params.saleType)      { conds.push(`sale_type = $${idx++}`);      vals.push(params.saleType);      }
    if (params.paymentStatus) { conds.push(`payment_status = $${idx++}`); vals.push(params.paymentStatus); }
    if (params.dateFrom)      { conds.push(`created_at >= $${idx++}`);    vals.push(params.dateFrom);      }
    if (params.dateTo)        { conds.push(`created_at <= $${idx++}`);    vals.push(params.dateTo);        }

    const where = conds.join(' AND ');
    const [rows, countRow] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT id, sale_no, store_code, customer_name, sale_type,
                payment_method, total_amount, paid_amount, receivable_amount,
                payment_status, status, created_by_name, created_at, completed_at
         FROM sal_store_sales WHERE ${where}
         ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...vals, limit, offset],
      ),
      this.ds.query<any[]>(
        `SELECT COUNT(*) AS total FROM sal_store_sales WHERE ${where}`,
        vals,
      ),
    ]);

    return { items: rows, total: Number(countRow[0]?.total ?? 0), page, limit };
  }

  async getDetail(id: number) {
    return this.getSale(id);
  }

  /** 今日门店经营摘要 */
  async getDailySummary(storeCode: string) {
    const rows = await this.ds.query<any[]>(
      `SELECT
         COUNT(*) FILTER (WHERE status='COMPLETED')           AS sale_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status='COMPLETED'),0) AS total_sales,
         COALESCE(SUM(paid_amount)  FILTER (WHERE status='COMPLETED'),0) AS cash_collected,
         COALESCE(SUM(receivable_amount) FILTER (WHERE status='COMPLETED'),0) AS receivable,
         COALESCE(SUM(total_amount) FILTER (WHERE sale_type='CASH' AND status='COMPLETED'),0) AS cash_sales,
         COALESCE(SUM(total_amount) FILTER (WHERE sale_type='CREDIT' AND status='COMPLETED'),0) AS credit_sales,
         COALESCE(SUM(total_amount) FILTER (WHERE sale_type='MIXED' AND status='COMPLETED'),0) AS mixed_sales
       FROM sal_store_sales
       WHERE store_code = $1
         AND created_at >= CURRENT_DATE
         AND created_at < CURRENT_DATE + INTERVAL '1 day'`,
      [storeCode],
    );
    return rows[0];
  }

  /** 可用商品列表（从价格本获取，供收银台选择）
   *  Phase H5: 新增 sku_code 字段，前端可按 SKU 选商品
   */
  async getProducts(storeCode: string, companyCode: string) {
    // 从 sal_price_items 获取有效的价格本商品
    const rows = await this.ds.query<any[]>(
      `SELECT pi.product_code,
              -- POS-P0-4 修:sal_price_items 无 product_name 列(原 SELECT pi.product_name → 42703 → 商品接口恒 400)。
              -- 改 JOIN 取真品名:SKU 名优先,回退产品主数据名,再回退编码。
              COALESCE(ps.sku_name, mp.product_name, pi.product_code) AS product_name,
              pi.grade_code, pi.packaging_spec,
              pi.unit_price, pi.currency_code,
              pi.sku_code,          -- Phase H5: SKU 编码
              pi.grade_code_std,    -- Phase H5: 标准等级
              pi.spec_code          -- Phase H5: 标准规格
       FROM sal_price_items pi
       INNER JOIN sal_price_books pb ON pb.id = pi.price_book_id
       LEFT JOIN mst_products mp ON mp.product_code = pi.product_code
       LEFT JOIN product_skus ps ON ps.sku_code = pi.sku_code
       WHERE pb.status = 'ACTIVE'
         AND pb.company_code = $1
         -- POS-P0-4 修:列名是 effective_from/effective_to(原误写 valid_from/valid_to → 生产 42703 → 商品接口 400)
         AND (pb.effective_from IS NULL OR pb.effective_from <= CURRENT_DATE)
         AND (pb.effective_to IS NULL OR pb.effective_to >= CURRENT_DATE)
         AND pi.unit_price > 0
       ORDER BY pi.sku_code NULLS LAST, pi.product_code, pi.grade_code`,
      [companyCode],
    );
    // 去重（SKU 路径：同 sku_code 取最新价格；旧路径：同 product+grade）
    const seen = new Set<string>();
    return rows.filter(r => {
      const key = r.sku_code ? `sku:${r.sku_code}` : `${r.product_code}|${r.grade_code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ── 私有：FIFO 扣减 ───────────────────────────────────────────────────────

  private async fifoDeductItems(
    sale: any,
    mgr: any,
  ): Promise<Array<{ itemId: number; batchNo: string }>> {
    const items: any[] = Array.isArray(sale.items)
      ? sale.items
      : await mgr.query(`SELECT * FROM sal_store_sale_items WHERE sale_id = $1`, [sale.id]);

    const allocs: Array<{ itemId: number; batchNo: string }> = [];

    for (const item of items) {
      if (!item || !item.product_code) continue;
      const qty = Number(item.qty);
      if (qty <= 0) continue;

      try {
        // Phase H5: PATH A（sku_code）优先，PATH B（product+grade）回退
        const useSkuPath = !!item.sku_code;
        const lockKey = useSkuPath
          ? `fifo:${sale.company_code}:sku:${item.sku_code}`
          : `fifo:${sale.company_code}:${item.product_code}`;

        // Advisory Lock 防并发超卖
        await mgr.query(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          [lockKey],
        );

        // FIFO 批次查询
        let batches: any[];
        if (useSkuPath) {
          // PATH A: 按 sku_code 精确匹配
          batches = await mgr.query(
            `SELECT batch_no, qty_available, expire_date
             FROM inv_batches
             WHERE sku_code = $1
               AND company_code = $2
               AND status = 'AVAILABLE'
               AND qty_available > 0
               AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
               AND legacy_source IS NULL
             ORDER BY expire_date ASC NULLS LAST, created_at ASC
             FOR UPDATE`,
            [item.sku_code, sale.company_code],
          );
        } else {
          // PATH B: 旧 product+grade 匹配
          batches = await mgr.query(
            `SELECT batch_no, qty_available, expire_date
             FROM inv_batches
             WHERE product_code = $1
               AND company_code = $2
               AND status = 'AVAILABLE'
               AND qty_available > 0
               AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
               AND legacy_source IS NULL
               ${item.grade_code ? `AND quality_grade = '${item.grade_code}'` : ''}
             ORDER BY expire_date ASC NULLS LAST, created_at ASC
             FOR UPDATE`,
            [item.product_code, sale.company_code],
          );
        }

        let remaining = qty;
        let firstBatch = '';

        for (const batch of batches) {
          if (remaining <= 0) break;
          const canTake = Math.min(remaining, Number(batch.qty_available));
          remaining -= canTake;
          if (!firstBatch) firstBatch = batch.batch_no;

          // 扣减
          await mgr.query(
            `UPDATE inv_batches SET qty_available = qty_available - $1, updated_at=NOW() WHERE batch_no=$2`,
            [canTake, batch.batch_no],
          );

          // 写 inv_ledger FIFO_OUT（Phase H5: 传递 sku_code）
          await mgr.query(
            `INSERT INTO inv_ledger
               (batch_no, change_type, qty_change, operator, store_code, ref_no, note, sku_code, created_at)
             VALUES ($1,'FIFO_OUT',$2,$3,$4,$5,$6,$7,NOW())`,
            [
              batch.batch_no,
              -canTake,
              this.currentUser?.username ?? 'pos',
              sale.store_code,
              sale.sale_no,
              `门店收银 FIFO 出库 ${sale.sale_no} qty=${canTake}`,
              item.sku_code ?? null,  // Phase H5
            ],
          );
        }

        if (remaining > 0) {
          // 库存不足时，记录警告但不阻断（门店允许负库存场景，记录欠账）
          this.logger.warn(
            `[StorePOS] 库存不足 ${useSkuPath ? 'sku=' + item.sku_code : 'product=' + item.product_code} 缺 ${remaining}，允许继续`,
          );
        }

        if (firstBatch) {
          allocs.push({ itemId: item.id, batchNo: firstBatch });
        }
      } catch (err) {
        this.logger.warn(`[StorePOS] FIFO deduct warn: ${(err as any)?.message}`);
      }
    }

    return allocs;
  }

  private async writeBatchNoBack(mgr: any, saleId: number, allocs: Array<{ itemId: number; batchNo: string }>) {
    for (const a of allocs) {
      await mgr.query(
        `UPDATE sal_store_sale_items SET batch_no = $1 WHERE id = $2 AND sale_id = $3`,
        [a.batchNo, a.itemId, saleId],
      );
    }
  }

  // ── 私有：Cash Transaction ────────────────────────────────────────────────

  private async writeCashTransaction(mgr: any, params: {
    accountId:   number;
    companyCode: string;
    amount:      number;
    sourceType:  string;
    sourceId:    number;
    sourceNo:    string;
    remark:      string;
  }) {
    // 获取账户信息
    const [acct] = await mgr.query(
      `SELECT id, account_code, account_name, current_balance
       FROM fin_cash_accounts WHERE id = $1`,
      [params.accountId],
    );
    if (!acct) {
      this.logger.warn(`[StorePOS] cash_account ${params.accountId} 不存在，跳过 cash write`);
      return;
    }

    const newBalance = Number(acct.current_balance) + params.amount;
    const dateStr    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [seq]      = await mgr.query(`SELECT nextval('seq_store_sale_no') AS n`);
    const txnNo      = `CASH-POS-${dateStr}-${String(seq.n).padStart(6, '0')}`;

    // 更新账户余额
    await mgr.query(
      `UPDATE fin_cash_accounts SET current_balance = $2, updated_at=NOW() WHERE id=$1`,
      [params.accountId, newBalance],
    );

    // 写流水
    await mgr.query(
      `INSERT INTO fin_cash_transactions
        (txn_no, account_id, account_code, account_name, company_code,
         direction, source_type, source_id, source_no,
         currency_code, amount, balance_after, remark, created_by)
       VALUES ($1,$2,$3,$4,$5,'IN',$6,$7,$8,'CNY',$9,$10,$11,$12)`,
      [
        txnNo,
        acct.id,
        acct.account_code,
        acct.account_name,
        params.companyCode,
        params.sourceType,
        params.sourceId,
        params.sourceNo,
        params.amount,
        newBalance,
        params.remark,
        this.currentUser?.username ?? 'pos',
      ],
    );
  }

  // ── 私有：AR Invoice ──────────────────────────────────────────────────────

  private async createArInvoice(mgr: any, params: {
    companyCode:   string;
    customerCode?: string | null;
    customerName:  string;
    amount:        number;
    sourceId:      number;
    sourceNo:      string;
  }): Promise<number> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [seq]   = await mgr.query(`SELECT nextval('seq_store_sale_no') AS n`);
    const arNo    = `AR-POS-${dateStr}-${String(seq.n).padStart(6, '0')}`;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);  // 默认 30 天账期

    const [row] = await mgr.query(
      `INSERT INTO fin_ar_invoices
        (ar_no, source_type, source_id, source_no,
         company_code, customer_code, customer_name,
         currency_code,
         amount_original, amount_base, base_currency,
         balance_amount_original, balance_amount_base,
         due_date, status, collection_status, created_by)
       VALUES ($1,'STORE_SALE',$2,$3,$4,$5,$6,'CNY',$7,$7,'CNY',$7,$7,$8,'OPEN','UNRECEIVED',$9)
       RETURNING id`,
      [
        arNo,
        params.sourceId,
        params.sourceNo,
        params.companyCode,
        params.customerCode ?? null,
        params.customerName,
        params.amount,
        dueDate.toISOString().slice(0, 10),
        this.currentUser?.username ?? 'pos',
      ],
    );
    return Number(row.id);
  }

  private guardStatus(sale: any, expected: string) {
    if (sale.status !== expected) {
      throw new BadRequestException(
        `销售单 ${sale.sale_no} 当前状态 ${sale.status}，无法执行此操作`,
      );
    }
  }
}
