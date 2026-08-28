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
import { hasPerm } from '../../../auth/permissions.util';
import { StoreScopePolicy, StoreWarehousePurpose } from './store-scope-policy.service';

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
  /** POS-P0-6:可选币种覆盖;不传则按公司价格本解析 */
  currencyCode?:  string;
  items:          SaleItemDto[];
}

export interface CompleteCashSaleDto {
  cashAccountId:   number;
  paidAmount?:     number;   // 默认全额
  paymentMethod?:  string;
  idempotencyKey:  string;
}

export interface CompleteMixedSaleDto {
  cashAccountId:  number;
  paidAmount:     number;
  paymentMethod?: string;
  customerCode?:  string;
  customerName?:  string;
  idempotencyKey: string;
}

@Injectable()
export class StorePosService {
  private readonly logger = new Logger(StorePosService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly storeScope: StoreScopePolicy,
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

  /**
   * POS-P0-6:解析销售单币种 —— 唯一权威来源是公司 ACTIVE 价格本的币种。
   * 价格本单一币种(常态)→ definite=true,该币种权威;
   * 0 或多币种(异常)→ definite=false,回退 'CNY' 并告警,允许 DTO 兜底。
   * 销售单据所有金额腿(现金/AR)都以此币种为准,杜绝同单币种漂移。
   */
  private async resolveSaleCurrency(
    companyCode: string,
  ): Promise<{ currency: string; definite: boolean }> {
    const rows = await this.ds.query<Array<{ currency_code: string }>>(
      `SELECT DISTINCT pi.currency_code
         FROM sal_price_items pi
         INNER JOIN sal_price_books pb ON pb.id = pi.price_book_id
        WHERE pb.company_code = $1
          AND pb.status = 'ACTIVE'
          AND (pb.effective_from IS NULL OR pb.effective_from <= CURRENT_DATE)
          AND (pb.effective_to   IS NULL OR pb.effective_to   >= CURRENT_DATE)
          AND pi.currency_code IS NOT NULL`,
      [companyCode],
    );
    if (rows.length === 1) return { currency: rows[0].currency_code, definite: true };
    if (rows.length > 1) {
      this.logger.warn(
        `[StorePOS] 公司 ${companyCode} ACTIVE 价格本存在多币种(${rows.map(r => r.currency_code).join('/')}),销售币种回退 CNY`,
      );
    }
    return { currency: 'CNY', definite: false };
  }

  /**
   * POS-P1 改价:校验购物车手改单价是否在价带内(沿用 sales-engine.validatePrice 语义)。
   * 价带来源=公司 ACTIVE 价格本(与 getProducts 同源,取并集,避免多价格本误判)。
   * - 低于 floor_price → 需店长授权(MENU_STORE_POS:A);无授权则拦截。
   * - 高于 ceiling_price → 放行(卖高不拦,与 sales-engine 一致)。
   * - 不在价带表(理论不应出现,商品都来自 getProducts)→ 跳过,不误拦。
   */
  private async validateCartPrices(
    companyCode: string,
    items: SaleItemDto[],
  ): Promise<void> {
    const bands = await this.ds.query<Array<{
      product_code:   string;
      grade_code:     string | null;
      packaging_spec: string | null;
      sku_code:       string | null;
      floor_price:    number | null;
    }>>(
      `SELECT pi.product_code, pi.grade_code, pi.packaging_spec, pi.sku_code, pi.floor_price
         FROM sal_price_items pi
         INNER JOIN sal_price_books pb ON pb.id = pi.price_book_id
        WHERE pb.company_code = $1
          AND pb.status = 'ACTIVE'
          AND pi.status = 'ACTIVE'
          AND (pb.effective_from IS NULL OR pb.effective_from <= CURRENT_DATE)
          AND (pb.effective_to   IS NULL OR pb.effective_to   >= CURRENT_DATE)
          AND pi.floor_price IS NOT NULL`,
      [companyCode],
    );
    if (!bands.length) return;

    // 同 product+grade 可有多 packaging_spec 价(LOOSE/30_PCS_TRAY...),按完整身份匹配,否则取错行价带 → 误拦/漏拦。
    // 身份键:sku_code 优先,否则 product|grade|spec;grade/spec 为 NULL 表"不限"(通配行),查找时逐级回退到通配。
    // 同公司可有多 ACTIVE 价格本(priority),同身份重复时取最严(MAX)floor —— 确定性 + 安全方向(宁可触发店长授权,绝不漏拦)。
    const skuKey  = (sku?: string | null) => sku ? `sku:${sku}` : null;
    const fullKey = (p?: string | null, g?: string | null, s?: string | null) =>
      `${p ?? ''}|${g ?? ''}|${s ?? ''}`;
    const floorOf = new Map<string, number>();
    const setMax = (key: string, f: number) => {
      const cur = floorOf.get(key);
      if (cur == null || f > cur) floorOf.set(key, f);
    };
    for (const b of bands) {
      const f = Number(b.floor_price);
      const sk = skuKey(b.sku_code);
      if (sk) setMax(sk, f);
      // 按该价带行自身的(grade,spec)粒度登记(可能含 NULL 通配)
      setMax(fullKey(b.product_code, b.grade_code, b.packaging_spec), f);
    }

    const resolveFloor = (it: SaleItemDto): number | undefined => {
      // 由最具体到通配逐级回退,mirror sales-engine 的 product:grade ?? product 语义(并加 spec 精度)
      const candidates = [
        skuKey(it.skuCode),
        fullKey(it.productCode, it.gradeCode, it.packagingSpec),
        fullKey(it.productCode, it.gradeCode, null),
        fullKey(it.productCode, null, it.packagingSpec),
        fullKey(it.productCode, null, null),
      ].filter((k): k is string => !!k);
      for (const k of candidates) {
        if (floorOf.has(k)) return floorOf.get(k);
      }
      return undefined;
    };

    const violations: string[] = [];
    for (const it of items) {
      const floor = resolveFloor(it);
      if (floor != null && Number(it.unitPrice) < floor) {
        violations.push(`${it.productName}(${it.unitPrice} < 最低价 ${floor})`);
      }
    }
    if (!violations.length) return;

    const user = this.currentUser;
    const canOverride =
      (user?.permissions?.includes('*') ?? false) ||
      hasPerm(user?.permissions, 'MENU_STORE_POS', 'A');
    if (canOverride) {
      this.logger.warn(
        `[StorePOS] 低于最低价改价已由 ${user?.username ?? '?'} 授权放行: ${violations.join('; ')}`,
      );
      return;
    }
    throw new BadRequestException(
      `以下商品改价低于最低价,需店长授权(MENU_STORE_POS:A):${violations.join('; ')}`,
    );
  }

  private async getSale(id: number, purpose: StoreWarehousePurpose = 'SALES') {
    const { context } = await this.storeScope.assertSaleScoped(id, purpose);
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
       WHERE s.id = $1 AND s.store_code = $2 AND s.company_code = $3
       GROUP BY s.id`,
      [id, context.storeCode, context.companyCode],
    );
    if (!sale) throw new NotFoundException(`销售单 ${id} 不存在`);
    return sale;
  }

  // ── 1. 创建销售单 ──────────────────────────────────────────────────────────

  async createSale(dto: CreateSaleDto) {
    const context = await this.storeScope.resolve(dto.storeCode, 'SALES');
    if (dto.companyCode && dto.companyCode !== context.companyCode) {
      throw new BadRequestException('门店与公司不匹配');
    }
    dto = { ...dto, storeCode: context.storeCode, storeName: context.storeName, companyCode: context.companyCode };
    const user    = this.currentUser;
    const saleNo  = await this.genSaleNo();
    const discount = dto.discountAmount ?? 0;

    // 计算金额
    const subtotal = dto.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const total    = Math.max(0, subtotal - discount);

    // POS-P1 改价:手改单价低于最低价 → 需店长授权(MENU_STORE_POS:A),否则拦截
    await this.validateCartPrices(dto.companyCode, dto.items);

    // POS-P0-6:销售单币种以公司价格本为权威,所有金额腿统一以此币种为准。
    // 客户端可传 currencyCode 作提示,但价格本可判定时(definite)以价格本为准,
    // 传入若与之冲突则拒绝 —— 防伪造币种绕过资金账户币种校验(账实漂移)。
    const { currency: derivedCurrency, definite } = await this.resolveSaleCurrency(dto.companyCode);
    if (dto.currencyCode && definite && dto.currencyCode !== derivedCurrency) {
      throw new BadRequestException(
        `销售币种 ${dto.currencyCode} 与公司 ${dto.companyCode} 价格本币种 ${derivedCurrency} 不一致`,
      );
    }
    const currencyCode = definite ? derivedCurrency : (dto.currencyCode ?? derivedCurrency);

    // 事务：插入主表 + 明细行
    return this.ds.transaction(async mgr => {
      const [saleRow] = await mgr.query(
        `INSERT INTO sal_store_sales
          (sale_no, store_code, store_name, company_code, company_name,
           customer_code, customer_name, customer_id,
           sale_type, payment_method, currency_code,
           subtotal, discount_amount, total_amount, paid_amount, receivable_amount,
           payment_status, status,
           created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,$14,'UNPAID','OPEN',$15,$16)
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
          currencyCode,
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

  private async lockSaleForPayment(
    mgr: any,
    id: number,
    idempotencyKey: string,
    warehouseCodes: string[],
  ): Promise<any> {
    const key = idempotencyKey?.trim();
    if (!key || key.length > 128) {
      throw new BadRequestException('支付请求必须提供 1-128 字符的 idempotencyKey');
    }
    if (!warehouseCodes.length) {
      throw new BadRequestException('请先配置门店仓绑定');
    }

    // 同 key 请求先串行，再查唯一结果；数据库 partial unique index 是最终硬门。
    await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`store-pos-payment:${key}`]);
    const [replay] = await mgr.query(
      `SELECT * FROM sal_store_sales WHERE idempotency_key=$1 FOR UPDATE`,
      [key],
    );
    if (replay) {
      if (Number(replay.id) !== id) throw new ConflictException('idempotencyKey 已用于其他销售单');
      return { ...replay, idempotentReplay: true, warehouseCodes };
    }

    const [sale] = await mgr.query(
      `SELECT * FROM sal_store_sales WHERE id=$1 FOR UPDATE`,
      [id],
    );
    if (!sale) throw new NotFoundException(`销售单 ${id} 不存在`);
    this.guardStatus(sale, 'OPEN');

    const items = await mgr.query(
      `SELECT * FROM sal_store_sale_items WHERE sale_id=$1 ORDER BY sort_order,id FOR UPDATE`,
      [id],
    );
    if (!items.length) throw new BadRequestException('销售单没有可结算明细');

    const [shift] = await mgr.query(
      `SELECT * FROM sal_store_shift_closings
        WHERE store_code=$1 AND company_code=$2 AND status='OPEN'
        ORDER BY opened_at DESC LIMIT 1 FOR UPDATE`,
      [sale.store_code, sale.company_code],
    );
    if (!shift) throw new BadRequestException(`门店 ${sale.store_code} 当前无开放班次，请先开班`);

    return { ...sale, items, shift_id: shift.id, warehouseCodes, idempotentReplay: false };
  }

  // ── 2. 现金收款（完整收款）────────────────────────────────────────────────

  async completeCashSale(id: number, dto: CompleteCashSaleDto) {
    const { context } = await this.storeScope.assertSaleScoped(id, 'SALES');
    await this.ds.transaction(async mgr => {
      const sale = await this.lockSaleForPayment(mgr, id, dto.idempotencyKey, context.warehouseCodes);
      if (sale.idempotentReplay) return;
      const paidAmount = dto.paidAmount ?? Number(sale.total_amount);
      if (paidAmount < Number(sale.total_amount)) {
        throw new BadRequestException('现金收款金额不足，请使用"部分收款"');
      }
      // A. FIFO 扣减库存
      const allocs = await this.fifoDeductItems(sale, mgr);

      // B. 写 fin_cash_transactions（币种统一取销售单币种）
      await this.writeCashTransaction(mgr, {
        accountId:    dto.cashAccountId,
        companyCode:  sale.company_code,
        currencyCode: sale.currency_code ?? 'CNY',
        amount:       Number(sale.total_amount),
        sourceType:   'STORE_SALE',
        sourceId:     sale.id,
        sourceNo:     sale.sale_no,
        remark:       `门店收银 ${sale.sale_no}（${sale.store_name}）`,
      });

      // C. 更新销售单（FIFO 写回 batch_no）
      const updated = await mgr.query(
        `WITH changed AS (
         UPDATE sal_store_sales
         SET status = 'COMPLETED', payment_status = 'PAID',
             paid_amount = $2, receivable_amount = 0,
             cash_account_id = $3,
             completed_at = NOW(), idempotency_key=$4, warehouse_code=$5,
             shift_closing_id=$6
         WHERE id = $1 AND status='OPEN'
         RETURNING id
         ) SELECT id FROM changed`,
        [id, paidAmount, dto.cashAccountId, dto.idempotencyKey, sale.warehouseCodes[0], sale.shift_id],
      );
      if (updated.length !== 1) throw new ConflictException('销售单状态已变化，请刷新后重试');

      // D. 写回批次号到明细行
      await this.writeBatchNoBack(mgr, sale.id, allocs);
    });

    return this.getSale(id);
  }

  // ── 3. 赊销（不收现金，生成 AR）──────────────────────────────────────────

  async completeCreditSale(id: number, dto: { idempotencyKey: string }) {
    const { context } = await this.storeScope.assertSaleScoped(id, 'SALES');
    await this.ds.transaction(async mgr => {
      const sale = await this.lockSaleForPayment(mgr, id, dto.idempotencyKey, context.warehouseCodes);
      if (sale.idempotentReplay) return;
      if (!sale.customer_code && !sale.customer_name) {
        throw new BadRequestException('赊销必须填写客户信息');
      }
      // A. FIFO 扣减库存
      const allocs = await this.fifoDeductItems(sale, mgr);

      // B. 生成 AR 发票（币种统一取销售单币种）
      const arId = await this.createArInvoice(mgr, {
        companyCode:  sale.company_code,
        currencyCode: sale.currency_code ?? 'CNY',
        customerCode: sale.customer_code,
        customerName: sale.customer_name ?? '散客',
        amount:       Number(sale.total_amount),
        sourceId:     sale.id,
        sourceNo:     sale.sale_no,
      });

      // C. 更新销售单
      const updated = await mgr.query(
        `WITH changed AS (
         UPDATE sal_store_sales
         SET status = 'COMPLETED', payment_status = 'UNPAID',
             paid_amount = 0, receivable_amount = $2,
             ar_invoice_id = $3, completed_at = NOW(), idempotency_key=$4,
             warehouse_code=$5, shift_closing_id=$6
         WHERE id = $1 AND status='OPEN' RETURNING id
         ) SELECT id FROM changed`,
        [id, sale.total_amount, arId, dto.idempotencyKey, sale.warehouseCodes[0], sale.shift_id],
      );
      if (updated.length !== 1) throw new ConflictException('销售单状态已变化，请刷新后重试');

      await this.writeBatchNoBack(mgr, sale.id, allocs);
    });

    return this.getSale(id);
  }

  // ── 4. 部分收款（现金 + AR）──────────────────────────────────────────────

  async completeMixedSale(id: number, dto: CompleteMixedSaleDto) {
    const { context } = await this.storeScope.assertSaleScoped(id, 'SALES');
    await this.ds.transaction(async mgr => {
      const sale = await this.lockSaleForPayment(mgr, id, dto.idempotencyKey, context.warehouseCodes);
      if (sale.idempotentReplay) return;
      const total = Number(sale.total_amount);
      const paid = dto.paidAmount;
      const receivable = Math.round((total - paid) * 100) / 100;
      if (paid <= 0) throw new BadRequestException('实收金额必须大于 0');
      if (paid >= total) throw new BadRequestException('实收等于或超过总金额，请使用现金收款');
      const custName = dto.customerName ?? sale.customer_name ?? '散客';
      // A. FIFO 扣减
      const allocs = await this.fifoDeductItems(sale, mgr);

      // B. 实收部分写 Cash（与 AR 腿同币种=销售单币种,杜绝同单漂移）
      await this.writeCashTransaction(mgr, {
        accountId:   dto.cashAccountId,
        companyCode: sale.company_code,
        currencyCode: sale.currency_code ?? 'CNY',
        amount:      paid,
        sourceType:  'STORE_SALE',
        sourceId:    sale.id,
        sourceNo:    sale.sale_no,
        remark:      `门店部分收款 ${sale.sale_no} 实收=${paid}`,
      });

      // C. 未收部分生成 AR（同币种）
      const arId = await this.createArInvoice(mgr, {
        companyCode:  sale.company_code,
        currencyCode: sale.currency_code ?? 'CNY',
        customerCode: dto.customerCode ?? sale.customer_code,
        customerName: custName,
        amount:       receivable,
        sourceId:     sale.id,
        sourceNo:     sale.sale_no,
      });

      // D. 更新销售单
      const updated = await mgr.query(
        `WITH changed AS (
         UPDATE sal_store_sales
         SET status = 'COMPLETED', payment_status = 'PARTIAL',
             paid_amount = $2, receivable_amount = $3,
             cash_account_id = $4, ar_invoice_id = $5,
             completed_at = NOW(), idempotency_key=$6, warehouse_code=$7,
             shift_closing_id=$8
         WHERE id = $1 AND status='OPEN' RETURNING id
         ) SELECT id FROM changed`,
        [id, paid, receivable, dto.cashAccountId, arId, dto.idempotencyKey, sale.warehouseCodes[0], sale.shift_id],
      );
      if (updated.length !== 1) throw new ConflictException('销售单状态已变化，请刷新后重试');

      await this.writeBatchNoBack(mgr, sale.id, allocs);
    });

    return this.getSale(id);
  }

  // ── 5. 作废销售单 ─────────────────────────────────────────────────────────

  async voidSale(id: number, reason: string) {
    const sale = await this.getSale(id);
    if (sale.status === 'VOID') throw new BadRequestException('已作废，不可重复操作');
    if (sale.status === 'RETURNED') throw new BadRequestException('已退货，不可作废');
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

  // ── 5.5 退货 / 冲红（整单冲红）────────────────────────────────────────────
  /**
   * 已完成单整单退货:库存反向入 QUARANTINE 退货批(待 QC 复检),资金按收款方式红冲
   *   —— 现金腿 fin_cash_transactions OUT 退款 + 账户余额回减;赊销腿负额 fin_ar_invoices 红字。
   * 状态 COMPLETED → RETURNED(日结/汇总按 status='COMPLETED' 统计,退货后自动排除,净额正确)。
   * 仅 COMPLETED 可退(未完成单走作废);RETURNED 不可重复退。
   */
  async returnSale(id: number, reason: string) {
    const { sale, context } = await this.storeScope.assertSaleScoped(id, 'RETURNS');
    if (sale.status === 'RETURNED') throw new BadRequestException('已退货，不可重复操作');
    if (sale.status !== 'COMPLETED') {
      throw new BadRequestException(`仅已完成的销售单可退货（当前状态 ${sale.status}）；未完成单请用作废`);
    }

    const currency = sale.currency_code ?? 'CNY';
    const user     = this.currentUser;
    const rsn      = reason?.trim() || '整单退货';

    await this.ds.transaction(async mgr => {
      // 行锁 + 事务内复检:杜绝并发双退(TOCTOU)双退款/双红冲/双入库
      const [locked] = await mgr.query(
        `SELECT * FROM sal_store_sales WHERE id = $1 FOR UPDATE`, [id],
      );
      if (!locked || locked.status !== 'COMPLETED') {
        throw new BadRequestException(
          locked?.status === 'RETURNED'
            ? '已退货，不可重复操作'
            : `仅已完成的销售单可退货（当前状态 ${locked?.status ?? '不存在'}）`,
        );
      }

      const allocations = await mgr.query(
        `SELECT a.*,i.product_code,i.sku_code,i.grade_code,i.packaging_spec
           FROM store_sale_allocations a
           JOIN sal_store_sale_items i ON i.id=a.sale_item_id
          WHERE a.sale_id=$1 ORDER BY a.id FOR UPDATE`,
        [id],
      );
      if (!allocations.length) {
        throw new ConflictException('历史销售单缺少批次 allocation，请创建人工退货异常单');
      }
      await this.reverseInventory(mgr, sale, allocations, context.warehouseCodes);

      // B. 现金腿红冲(已收现金 → OUT 退款)
      const paid = Number(sale.paid_amount) || 0;
      if (paid > 0) {
        if (!sale.cash_account_id) {
          throw new BadRequestException('该单有现金收款但缺收款账户,无法退款');
        }
        await this.writeCashRefund(mgr, {
          accountId:    Number(sale.cash_account_id),
          companyCode:  sale.company_code,
          currencyCode: currency,
          amount:       paid,
          sourceId:     sale.id,
          sourceNo:     sale.sale_no,
          remark:       `门店退货退款 ${sale.sale_no}（${rsn}）`,
        });
      }

      // C. 赊销腿红冲(应收 → 负额 AR 红字)
      const receivable = Number(sale.receivable_amount) || 0;
      if (receivable > 0) {
        await this.writeArCreditNote(mgr, {
          companyCode:  sale.company_code,
          currencyCode: currency,
          customerCode: sale.customer_code,
          customerName: sale.customer_name ?? '散客',
          amount:       receivable,
          sourceId:     sale.id,
          sourceNo:     sale.sale_no,
        });
      }

      // 已关班原单只追加 adjustment，不修改历史班次。
      if (locked.shift_closing_id) {
        const [closedShift] = await mgr.query(
          `SELECT id,status FROM sal_store_shift_closings WHERE id=$1 FOR UPDATE`,
          [locked.shift_closing_id],
        );
        if (closedShift?.status === 'CLOSED') {
          await mgr.query(
            `INSERT INTO store_sale_adjustments
               (sale_id,shift_closing_id,adjustment_type,reason,created_by)
             VALUES ($1,$2,'CLOSED_SHIFT_RETURN',$3,$4)
             ON CONFLICT (sale_id,adjustment_type) DO NOTHING`,
            [id, closedShift.id, rsn, user?.username ?? 'pos'],
          );
        }
      }

      const updated = await mgr.query(
        `WITH changed AS (
         UPDATE sal_store_sales
         SET status = 'RETURNED', returned_at = NOW(), return_reason = $2
         WHERE id = $1 AND status='COMPLETED' RETURNING id
         ) SELECT id FROM changed`,
        [id, rsn],
      );
      if (updated.length !== 1) throw new ConflictException('销售单状态已变化，退货已回滚');
    });

    this.logger.warn(
      `[StorePOS] 退货 ${sale.sale_no} by ${user?.username ?? '?'} reason=${rsn} (现金退 ${sale.paid_amount} / AR 冲 ${sale.receivable_amount})`,
    );
    return this.getSale(id, 'RETURNS');
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
    const context = await this.storeScope.resolve(params.storeCode, 'SALES');
    params.storeCode = context.storeCode;
    if (params.companyCode && params.companyCode !== context.companyCode) throw new BadRequestException('门店与公司不匹配');
    params.companyCode = context.companyCode;
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
    const context = await this.storeScope.resolve(storeCode, 'SALES');
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
      [context.storeCode],
    );
    return rows[0];
  }

  /** 可用商品列表（从价格本获取，供收银台选择）
   *  Phase H5: 新增 sku_code 字段，前端可按 SKU 选商品
   */
  async getProducts(storeCode: string, companyCode: string) {
    const context = await this.storeScope.resolve(storeCode, 'SALES');
    if (companyCode && companyCode !== context.companyCode) throw new BadRequestException('门店与公司不匹配');
    // 从 sal_price_items 获取有效的价格本商品
    const rows = await this.ds.query<any[]>(
      `SELECT pi.product_code,
              -- POS-P0-4 修:sal_price_items 无 product_name 列(原 SELECT pi.product_name → 42703 → 商品接口恒 400)。
              -- 改 JOIN 取真品名:SKU 名优先,回退产品主数据名,再回退编码。
              COALESCE(ps.sku_name, mp.product_name, pi.product_code) AS product_name,
              pi.grade_code, pi.packaging_spec,
              pi.unit_price, pi.currency_code,
              pi.floor_price, pi.ceiling_price,   -- POS-P1 改价:价带,前端提示 + 后端兜底校验
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
      [context.companyCode],
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
  ): Promise<Array<{ itemId: number; batchNo: string; warehouseCode: string; qty: number }>> {
    const items: any[] = Array.isArray(sale.items)
      ? sale.items
      : await mgr.query(`SELECT * FROM sal_store_sale_items WHERE sale_id = $1`, [sale.id]);

    const allocs: Array<{ itemId: number; batchNo: string; warehouseCode: string; qty: number }> = [];

    for (const item of items) {
      if (!item || !item.product_code) continue;
      const qty = Number(item.qty);
      if (qty <= 0) continue;

      // Phase H5: PATH A（sku_code）优先，PATH B（product+grade）回退。
      const useSkuPath = !!item.sku_code;
      const lockKey = useSkuPath
        ? `fifo:${sale.company_code}:${sale.warehouseCodes.join(',')}:sku:${item.sku_code}`
        : `fifo:${sale.company_code}:${sale.warehouseCodes.join(',')}:${item.product_code}`;

        // Advisory Lock 防并发超卖
      await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [lockKey]);

        // FIFO 批次查询
      let batches: any[];
      if (useSkuPath) {
          // PATH A: 按 sku_code 精确匹配
          batches = await mgr.query(
            `SELECT batch_no, warehouse_code, qty_available, expire_date
             FROM inv_batches
             WHERE sku_code = $1
               AND company_code = $2
               AND warehouse_code = ANY($3::varchar[])
               AND status = 'AVAILABLE'
               AND qty_available > 0
               AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
               AND legacy_source IS NULL
             ORDER BY expire_date ASC NULLS LAST, created_at ASC, batch_no ASC
             FOR UPDATE`,
            [item.sku_code, sale.company_code, sale.warehouseCodes],
          );
      } else {
          // PATH B: 旧 product+grade 匹配
          // 安全:grade_code 用绑定参数($3),严禁字符串插值(SQL 注入)
          batches = await mgr.query(
            `SELECT batch_no, warehouse_code, qty_available, expire_date
             FROM inv_batches
             WHERE product_code = $1
               AND company_code = $2
               AND warehouse_code = ANY($3::varchar[])
               AND status = 'AVAILABLE'
               AND qty_available > 0
               AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
               AND legacy_source IS NULL
               ${item.grade_code ? `AND quality_grade = $4` : ''}
             ORDER BY expire_date ASC NULLS LAST, created_at ASC, batch_no ASC
             FOR UPDATE`,
            item.grade_code
              ? [item.product_code, sale.company_code, sale.warehouseCodes, item.grade_code]
              : [item.product_code, sale.company_code, sale.warehouseCodes],
          );
      }

      let remaining = qty;

      for (const batch of batches) {
          if (remaining <= 0) break;
          const canTake = Math.min(remaining, Number(batch.qty_available));
          remaining -= canTake;
          const changed = await mgr.query(
            `WITH changed AS (
               UPDATE inv_batches SET qty_available = qty_available - $1, updated_at=NOW()
                WHERE batch_no=$2 AND warehouse_code=$3 AND qty_available >= $1
                RETURNING batch_no
             ) SELECT batch_no FROM changed`,
            [canTake, batch.batch_no, batch.warehouse_code],
          );
          if (changed.length !== 1) throw new ConflictException(`批次 ${batch.batch_no} 可用量已变化`);

          await mgr.query(
            `INSERT INTO store_sale_allocations
               (sale_id,sale_item_id,batch_no,warehouse_code,allocated_qty)
             VALUES ($1,$2,$3,$4,$5)`,
            [sale.id, item.id, batch.batch_no, batch.warehouse_code, canTake],
          );
          allocs.push({ itemId: item.id, batchNo: batch.batch_no, warehouseCode: batch.warehouse_code, qty: canTake });

          // 写 inv_ledger FIFO_OUT（Phase H5: 传递 sku_code）
          await mgr.query(
            `INSERT INTO inv_ledger
               (batch_no, change_type, qty_change, operator, store_code, ref_no, note, sku_code, company_code, warehouse_code, created_at)
             VALUES ($1,'FIFO_OUT',$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
            [
              batch.batch_no,
              -canTake,
              this.currentUser?.username ?? 'pos',
              sale.store_code,
              sale.sale_no,
              `门店收银 FIFO 出库 ${sale.sale_no} qty=${canTake}`,
              item.sku_code ?? null,
              sale.company_code,
              batch.warehouse_code,
            ],
          );
      }

      if (remaining > 0) {
        throw new ConflictException(
          `门店仓库存不足：${useSkuPath ? 'sku=' + item.sku_code : 'product=' + item.product_code} 缺 ${remaining}`,
        );
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
    accountId:    number;
    companyCode:  string;
    currencyCode: string;
    amount:       number;
    sourceType:   string;
    sourceId:     number;
    sourceNo:     string;
    remark:       string;
  }) {
    // L1:FOR UPDATE 锁账户行,杜绝并发现金写的余额 read-modify-write 丢更新
    const [acct] = await mgr.query(
      `SELECT id, account_code, account_name, current_balance, currency_code
       FROM fin_cash_accounts WHERE id = $1 FOR UPDATE`,
      [params.accountId],
    );
    if (!acct) {
      throw new BadRequestException(`资金账户 ${params.accountId} 不存在，成交已回滚`);
    }

    // POS-P0-6:资金账户币种必须与销售单币种一致,否则流水/余额会跨币种混记(账实漂移)
    const acctCurrency = acct.currency_code ?? 'CNY';
    if (acctCurrency !== params.currencyCode) {
      throw new BadRequestException(
        `资金账户「${acct.account_name}」币种为 ${acctCurrency}，与销售单币种 ${params.currencyCode} 不一致，请选择 ${params.currencyCode} 账户收款`,
      );
    }

    const dateStr    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [seq]      = await mgr.query(`SELECT nextval('seq_store_sale_no') AS n`);
    const txnNo      = `CASH-POS-${dateStr}-${String(seq.n).padStart(6, '0')}`;

    // L1:原子增量 + RETURNING 取准 balance_after(不再 read-then-write)
    const [upd] = await mgr.query(
      `UPDATE fin_cash_accounts SET current_balance = current_balance + $2, updated_at=NOW()
       WHERE id=$1 RETURNING current_balance`,
      [params.accountId, params.amount],
    );
    const newBalance = Number(upd.current_balance);

    // 写流水（币种取销售单币种,已校验=账户币种）
    await mgr.query(
      `INSERT INTO fin_cash_transactions
        (txn_no, account_id, account_code, account_name, company_code,
         direction, source_type, source_id, source_no,
         currency_code, amount, balance_after, remark, created_by)
       VALUES ($1,$2,$3,$4,$5,'IN',$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        txnNo,
        acct.id,
        acct.account_code,
        acct.account_name,
        params.companyCode,
        params.sourceType,
        params.sourceId,
        params.sourceNo,
        params.currencyCode,
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
    currencyCode:  string;
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

    // POS-P0-6:AR 币种取销售单币种(原硬编码 CNY);amount_base/base_currency 暂与原币同值,
    //   待财务建立 FX 折算后再补本位币换算(当前 POS 不做跨币折算)
    const [row] = await mgr.query(
      `INSERT INTO fin_ar_invoices
        (ar_no, source_type, source_id, source_no,
         company_code, customer_code, customer_name,
         currency_code,
         amount_original, amount_base, base_currency,
         balance_amount_original, balance_amount_base,
         due_date, status, collection_status, created_by)
       VALUES ($1,'STORE_SALE',$2,$3,$4,$5,$6,$7,$8,$8,$7,$8,$8,$9,'OPEN','UNRECEIVED',$10)
       RETURNING id`,
      [
        arNo,
        params.sourceId,
        params.sourceNo,
        params.companyCode,
        params.customerCode ?? null,
        params.customerName,
        params.currencyCode,
        params.amount,
        dueDate.toISOString().slice(0, 10),
        this.currentUser?.username ?? 'pos',
      ],
    );
    return Number(row.id);
  }

  // ── 私有：退货反向（库存 / 现金 / AR）──────────────────────────────────────

  /** 严格按原 allocation 反向，并要求 RETURNS 仓存在隔离库位。 */
  private async reverseInventory(mgr: any, sale: any, allocations: any[], warehouseCodes: string[]) {
    const [quarantine] = await mgr.query(
      `SELECT l.warehouse_code,l.location_code,l.zone_code
         FROM wms_locations l
         LEFT JOIN wms_zones z ON z.zone_code=l.zone_code
        WHERE l.warehouse_code=ANY($1::varchar[]) AND l.status='ACTIVE'
          AND (upper(COALESCE(l.zone_code,'')) LIKE '%QUARANTINE%'
               OR upper(COALESCE(z.zone_name,'')) LIKE '%QUARANTINE%'
               OR z.zone_name LIKE '%隔离%')
        ORDER BY array_position($1::varchar[],l.warehouse_code),l.location_code
        LIMIT 1 FOR UPDATE OF l`,
      [warehouseCodes],
    );
    if (!quarantine) throw new ConflictException('退货仓缺少 ACTIVE QUARANTINE zone/location，退货已回滚');

    for (const allocation of allocations) {
      const qty = Number(allocation.allocated_qty) - Number(allocation.returned_qty);
      if (qty <= 0) throw new ConflictException(`allocation ${allocation.id} 已无可退数量`);
      const batchNo = `RET-${sale.sale_no}-${allocation.id}`;
      await mgr.query(
        `INSERT INTO inv_batches
           (batch_no, product_code, company_code, qty, qty_available, quality_grade,
            packaging_spec, source_type, source_no, status, sku_code, warehouse_code, location_code, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$4,$5,$6,'STORE_RETURN',$7,'QUARANTINE',$8,$9,$10,NOW(),NOW())
         ON CONFLICT (batch_no) DO UPDATE SET
           qty           = inv_batches.qty + EXCLUDED.qty,
           qty_available = inv_batches.qty_available + EXCLUDED.qty_available,
           updated_at    = NOW()`,
        [batchNo, allocation.product_code, sale.company_code, qty,
         allocation.grade_code ?? null, allocation.packaging_spec ?? null, sale.sale_no,
         allocation.sku_code ?? null, quarantine.warehouse_code, quarantine.location_code],
      );
      await mgr.query(
        `INSERT INTO inv_ledger
           (batch_no, change_type, qty_change, operator, store_code, ref_no, note, company_code, sku_code, warehouse_code, location_code, created_at)
         VALUES ($1,'SALE_RETURN',$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
        [batchNo, qty, this.currentUser?.username ?? 'pos', sale.store_code, sale.sale_no,
         `按 allocation ${allocation.id} 退货入隔离批 ${sale.sale_no} qty=${qty}`, sale.company_code,
         allocation.sku_code ?? null, quarantine.warehouse_code, quarantine.location_code],
      );
      await mgr.query(
        `UPDATE store_sale_allocations SET returned_qty=allocated_qty,updated_at=NOW()
          WHERE id=$1 AND returned_qty < allocated_qty`,
        [allocation.id],
      );
    }
  }

  /** 现金退款（writeCashTransaction 的反向：OUT + 账户余额回减；币种须与销售单一致） */
  private async writeCashRefund(mgr: any, params: {
    accountId:    number;
    companyCode:  string;
    currencyCode: string;
    amount:       number;
    sourceId:     number;
    sourceNo:     string;
    remark:       string;
  }) {
    // L1:FOR UPDATE 锁账户行,杜绝并发余额丢更新
    const [acct] = await mgr.query(
      `SELECT id, account_code, account_name, current_balance, currency_code
       FROM fin_cash_accounts WHERE id = $1 FOR UPDATE`,
      [params.accountId],
    );
    if (!acct) {
      throw new BadRequestException(`退款资金账户 ${params.accountId} 不存在`);
    }
    const acctCurrency = acct.currency_code ?? 'CNY';
    if (acctCurrency !== params.currencyCode) {
      throw new BadRequestException(
        `退款账户「${acct.account_name}」币种 ${acctCurrency} 与销售单币种 ${params.currencyCode} 不一致`,
      );
    }
    const dateStr    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [seq]      = await mgr.query(`SELECT nextval('seq_store_sale_no') AS n`);
    const txnNo      = `CASH-POSRET-${dateStr}-${String(seq.n).padStart(6, '0')}`;

    // L1:原子减量 + RETURNING 取准 balance_after
    const [upd] = await mgr.query(
      `UPDATE fin_cash_accounts SET current_balance = current_balance - $2, updated_at = NOW()
       WHERE id = $1 RETURNING current_balance`,
      [params.accountId, params.amount],
    );
    const newBalance = Number(upd.current_balance);
    await mgr.query(
      `INSERT INTO fin_cash_transactions
        (txn_no, account_id, account_code, account_name, company_code,
         direction, source_type, source_id, source_no,
         currency_code, amount, balance_after, remark, created_by)
       VALUES ($1,$2,$3,$4,$5,'OUT','STORE_SALE_RETURN',$6,$7,$8,$9,$10,$11,$12)`,
      [
        txnNo, acct.id, acct.account_code, acct.account_name, params.companyCode,
        params.sourceId, params.sourceNo, params.currencyCode,
        params.amount, newBalance, params.remark, this.currentUser?.username ?? 'pos',
      ],
    );
  }

  /** AR 红字冲销（createArInvoice 的负额版：amount<0，source_type=STORE_SALE_RETURN，与原应收净抵） */
  private async writeArCreditNote(mgr: any, params: {
    companyCode:   string;
    currencyCode:  string;
    customerCode?: string | null;
    customerName:  string;
    amount:        number;
    sourceId:      number;
    sourceNo:      string;
  }): Promise<number> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [seq]   = await mgr.query(`SELECT nextval('seq_store_sale_no') AS n`);
    const arNo    = `CR-POS-${dateStr}-${String(seq.n).padStart(6, '0')}`;
    const neg     = -Math.abs(params.amount);

    const [row] = await mgr.query(
      `INSERT INTO fin_ar_invoices
        (ar_no, source_type, source_id, source_no,
         company_code, customer_code, customer_name,
         currency_code,
         amount_original, amount_base, base_currency,
         balance_amount_original, balance_amount_base,
         due_date, status, collection_status, created_by)
       VALUES ($1,'STORE_SALE_RETURN',$2,$3,$4,$5,$6,$7,$8,$8,$7,$8,$8,$9,'OPEN','UNRECEIVED',$10)
       RETURNING id`,
      [
        arNo, params.sourceId, params.sourceNo, params.companyCode,
        params.customerCode ?? null, params.customerName, params.currencyCode,
        neg, dateStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
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
