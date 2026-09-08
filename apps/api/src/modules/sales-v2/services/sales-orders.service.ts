import {
  Injectable, NotFoundException, ForbiddenException, OnApplicationBootstrap,
  BadRequestException, ConflictException, Logger, ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import { PriceRuntimeService } from './price-runtime.service';
import { CustomersService } from './customers.service';
import { CustomerCreditService } from './customer-credit.service';
import { FinanceArAdapter } from '../adapters/finance-ar.adapter';
import { EggInventoryService } from './egg-inventory.service';      // Phase 7
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import { WorkflowBizRegistryService } from '../../approval-engine/workflow-biz-registry.service';
import { CreditCustomerMasterNotFoundException } from './credit-domain.errors';
import {
  CreateSalesOrderDto, UpdateSalesOrderDto, QuerySalesOrderDto,
  SubmitSalesOrderDto, CancelSalesOrderDto, TransitionSalesOrderDto,
  ManualOverrideSalesOrderDto,
} from '../dto/sales-order.dto';

// ── 不可取消的状态（已发货后不可取消）────────────────────────────────────────
const NO_CANCEL_STATUSES = new Set(['SHIPPED', 'DELIVERED', 'RECEIVED', 'RECONCILED', 'CANCELLED']);

@Injectable()
export class SalesOrdersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SalesOrdersService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly priceRuntime: PriceRuntimeService,
    private readonly customersService: CustomersService,
    private readonly customerCredit: CustomerCreditService,
    private readonly financeAr: FinanceArAdapter,
    private readonly eggInventory: EggInventoryService,             // Phase 7
    private readonly lifecycle: SalesOrderLifecycleService,
    private readonly workflowRegistry: WorkflowBizRegistryService,
  ) {}

  onApplicationBootstrap() {
    const existing = this.workflowRegistry.get('SALES_ORDER');
    if (!existing) throw new Error('SALES_ORDER workflow registry is not initialized');
    this.workflowRegistry.register('SALES_ORDER', {
      ...existing,
      onApproved: (bizId, mgr) => this.approveCallback(bizId, mgr),
      onRejected: (bizId, mgr) => this.rejectCallback(bizId, mgr),
      onCancelled: (bizId, mgr) => this.cancelCallback(bizId, mgr),
    });
  }

  // ── 当前用户 ──────────────────────────────────────────────────────────────

  private currentUser() {
    const u = this.cls.get('user') as any;
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    return {
      userId:       String(u?.userId ?? u?.id ?? '0'),
      userName:     String(u?.name ?? u?.username ?? ''),
      roles:        (u?.roles ?? (u?.role ? [u.role] : [])) as string[],
      companyCodes: scope ? scope.allowedCompanyCodes : [] as string[],
      warehouseCodes: scope ? scope.allowedWarehouseCodes : [] as string[],
      scopeAll:     scope ? scope.isGlobal : false,
    };
  }

  private async assertFulfillmentWarehouse(companyCode: string, warehouseCode: string): Promise<void> {
    const rows = await this.ds.query(
      `SELECT warehouse_code FROM wms_warehouses w
        WHERE warehouse_code=$1 AND company_code=$2 AND status='ACTIVE' AND domain='OPERATIONAL'
          AND owner_store_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM store_warehouse_bindings b WHERE b.warehouse_code=w.warehouse_code
            AND b.purpose='SALES' AND b.status='ACTIVE' AND b.effective_to IS NULL)`,
      [warehouseCode, companyCode],
    );
    if (!rows.length) throw new BadRequestException(`履约仓 ${warehouseCode} 不存在、不可用、公司不匹配或属于门店 SALES 仓`);
    const user = this.currentUser();
    if (!user.scopeAll && !user.warehouseCodes.includes(warehouseCode)) {
      throw new ForbiddenException(`无权使用履约仓 ${warehouseCode}`);
    }
  }

  // ── DataScope 断言 ────────────────────────────────────────────────────────

  private async assertOwnership(id: string): Promise<any> {
    const rows = await this.ds.query(
      `SELECT * FROM sal_sales_orders WHERE id = $1`, [id],
    );
    if (!rows?.length) throw new NotFoundException(`销售订单 ${id} 不存在`);
    const rec = rows[0];
    const user = this.currentUser();
    if (!user.scopeAll) {
      if (user.companyCodes.length === 0 || !user.companyCodes.includes(rec.company_code)) {
        throw new ForbiddenException(`无权访问公司 ${rec.company_code} 的订单`);
      }
    }
    return rec;
  }

  // ── 自动编号 ──────────────────────────────────────────────────────────────

  private async genOrderNo(): Promise<string> {
    const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `SO-${today}-`;
    const row = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM sal_sales_orders WHERE order_no LIKE $1`,
      [`${prefix}%`],
    );
    return `${prefix}${String(Number(row[0].cnt) + 1).padStart(5, '0')}`;
  }

  private isMissingOrderItemSkuColumn(err: unknown): boolean {
    const e = err as { code?: string; message?: string };
    return e?.code === '42703'
      && String(e.message ?? '').includes('sku_code')
      && String(e.message ?? '').includes('sal_order_items');
  }

  private async insertOrderItem(params: {
    salesOrderId: string;
    productCode: string;
    productName: string | null;
    gradeCode: string | null;
    packagingSpec: string | null;
    qty: number;
    resolvedUnitPrice: number;
    actualUnitPrice: number;
    floorPrice: number | null;
    ceilingPrice: number | null;
    amount: number;
    priceBookId: string | null;
    priceBookNo: string | null;
    belowFloor: boolean;
    skuCode: string | null;
  }, manager: EntityManager = this.ds.manager) {
    const values = [
      params.salesOrderId,
      params.productCode, params.productName,
      params.gradeCode, params.packagingSpec, params.qty,
      params.resolvedUnitPrice, params.actualUnitPrice, params.actualUnitPrice,
      params.floorPrice, params.ceilingPrice, params.amount,
      params.priceBookId, params.priceBookNo, params.belowFloor,
      params.skuCode,
    ];

    try {
      await manager.query(
        `INSERT INTO sal_order_items (
           sales_order_id, product_code, product_name,
           grade_code, packaging_spec, qty,
           resolved_unit_price, actual_unit_price, unit_price,
           floor_price, ceiling_price, amount,
           price_book_id, price_book_no, below_floor_price,
           sku_code
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        values,
      );
    } catch (err: unknown) {
      if (!this.isMissingOrderItemSkuColumn(err)) throw err;

      this.logger.warn('[SalesOrder] sal_order_items.sku_code 缺失，明细写入降级为旧 schema 兼容路径');
      await manager.query(
        `INSERT INTO sal_order_items (
           sales_order_id, product_code, product_name,
           grade_code, packaging_spec, qty,
           resolved_unit_price, actual_unit_price, unit_price,
           floor_price, ceiling_price, amount,
           price_book_id, price_book_no, below_floor_price
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        values.slice(0, 15),
      );
    }
  }

  // ── 1. 列表 ───────────────────────────────────────────────────────────────

  async listOrders(q: QuerySalesOrderDto) {
    const user   = this.currentUser();
    const page   = Math.max(1, q.page ?? 1);
    const limit  = Math.min(200, Math.max(1, q.limit ?? 20));
    const offset = (page - 1) * limit;

    const params: any[] = [];
    const where: string[] = ['1=1'];

    // DataScope
    if (!user.scopeAll) {
      if (user.companyCodes.length > 0) {
        params.push(user.companyCodes); where.push(`company_code = ANY($${params.length})`);
      } else {
        where.push('1=0');  // 未配置数据范围 → 拒绝访问
      }
    }
    if (q.companyCode)   { params.push(q.companyCode);   where.push(`company_code = $${params.length}`); }
    if (q.status)        { params.push(q.status);         where.push(`status = $${params.length}`); }
    if (q.customerCode)  { params.push(q.customerCode);   where.push(`customer_code = $${params.length}`); }
    if (q.channelCode)   { params.push(q.channelCode);    where.push(`channel_code = $${params.length}`); }
    if (q.dateFrom)      { params.push(q.dateFrom);       where.push(`created_at >= $${params.length}::date`); }
    if (q.dateTo)        { params.push(q.dateTo);         where.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`); }
    if (q.keyword) {
      params.push(`%${q.keyword}%`);
      const i = params.length;
      where.push(`(order_no ILIKE $${i} OR customer_name ILIKE $${i})`);
    }

    const wc = where.join(' AND ');
    const [countRow, rows] = await Promise.all([
      this.ds.query(`SELECT COUNT(*) AS total FROM sal_sales_orders WHERE ${wc}`, params),
      this.ds.query(
        `SELECT * FROM sal_sales_orders WHERE ${wc}
         ORDER BY created_at DESC, id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    return { data: rows, total: Number(countRow[0].total), page, limit };
  }

  // ── 2. 详情 ───────────────────────────────────────────────────────────────

  async findById(id: string) {
    const rec = await this.assertOwnership(id);
    const enriched = await this.ds.query(
      `SELECT so.*,
              (SELECT COALESCE(o.org_name_cn, o.org_name) FROM sys_organizations o
                WHERE o.org_type='COMPANY' AND COALESCE(o.company_code,o.org_code)=so.company_code
                ORDER BY o.org_code LIMIT 1) AS company_name_display,
              (SELECT c.customer_name FROM sal_customers c WHERE c.customer_no=so.customer_code ORDER BY c.id LIMIT 1) AS customer_name_master,
              (SELECT c.customer_name_en FROM sal_customers c WHERE c.customer_no=so.customer_code ORDER BY c.id LIMIT 1) AS customer_name_en,
              (SELECT c.customer_name_lo FROM sal_customers c WHERE c.customer_no=so.customer_code ORDER BY c.id LIMIT 1) AS customer_name_lo,
              (SELECT ch.channel_name FROM sal_channels ch WHERE ch.channel_code=so.channel_code ORDER BY ch.id LIMIT 1) AS channel_name
         FROM sal_sales_orders so WHERE so.id = $1`,
      [id],
    );
    const items = await this.ds.query(
      `SELECT oi.*,
              (SELECT ps.sku_name FROM product_skus ps WHERE ps.sku_code=oi.sku_code LIMIT 1) AS sku_name,
              (SELECT ps.sku_name_en FROM product_skus ps WHERE ps.sku_code=oi.sku_code LIMIT 1) AS sku_name_en,
              (SELECT ps.sku_name_lo FROM product_skus ps WHERE ps.sku_code=oi.sku_code LIMIT 1) AS sku_name_lo,
              (SELECT p.product_name_zh FROM mst_products p WHERE p.product_code=oi.product_code LIMIT 1) AS product_name_zh,
              (SELECT p.product_name_en FROM mst_products p WHERE p.product_code=oi.product_code LIMIT 1) AS product_name_en,
              (SELECT p.product_name_lo FROM mst_products p WHERE p.product_code=oi.product_code LIMIT 1) AS product_name_lo,
              (SELECT g.grade_name FROM product_grades g WHERE g.grade_code=oi.grade_code LIMIT 1) AS grade_name,
              (SELECT s.spec_name FROM packaging_specs s WHERE s.spec_code=oi.packaging_spec LIMIT 1) AS spec_name
         FROM sal_order_items oi WHERE oi.sales_order_id = $1 ORDER BY oi.id ASC`,
      [id],
    );
    // AR 关联
    let arInvoice: any = null;
    if (rec.ar_invoice_id) {
      const ar = await this.ds.query(
        `SELECT id, ar_no, status, amount_original, received_amount_original,
                balance_amount_original, due_date, collection_status
         FROM fin_ar_invoices WHERE id = $1`, [rec.ar_invoice_id],
      ).catch(() => []);
      arInvoice = ar[0] ?? null;
    }
    return { ...(enriched[0] ?? rec), items, arInvoice };
  }

  async getProcessLog(id: string) {
    const rec = await this.assertOwnership(id);
    return this.lifecycle.getProcessLog(rec);
  }

  // ── 3. 创建草稿 ───────────────────────────────────────────────────────────

  async createDraft(dto: CreateSalesOrderDto) {
    const user = this.currentUser();
    if (!user.scopeAll) {
      if (user.companyCodes.length === 0 || !user.companyCodes.includes(dto.companyCode)) {
        throw new ForbiddenException(`无权在公司 ${dto.companyCode} 下创建订单`);
      }
    }
    if (!dto.items?.length) {
      throw new BadRequestException('订单必须包含至少一条明细');
    }
    await this.assertFulfillmentWarehouse(dto.companyCode, dto.fulfillmentWarehouseCode);

    // 读取客户信息
    let customer: any = null;
    let channelCode = dto.channelCode ?? null;
    if (dto.customerCode) {
      const cRows = await this.ds.query(
        `SELECT * FROM sal_customers
         WHERE (customer_no = $1 OR legacy_customer_code = $1)
           AND company_code = $2
         LIMIT 1`,
        [dto.customerCode, dto.companyCode],
      );
      if (cRows.length) {
        customer = cRows[0];
        channelCode = channelCode ?? customer.channel_code ?? null;
      }
    }

    // 解析价格（每行调用 PriceRuntime）
    const resolvedItems: Array<{
      productCode: string; productName: string | null;
      gradeCode: string | null; packagingSpec: string | null;
      qty: number;
      resolvedUnitPrice: number; actualUnitPrice: number;
      floorPrice: number | null; ceilingPrice: number | null;
      belowFloor: boolean;
      priceBookId: string | null; priceBookNo: string | null;
      amount: number;
      skuCode: string | null;     // Phase H5
    }> = [];

    let anyBelowFloor = false;

    for (const item of dto.items) {
      // Phase H5: SKU 优先推导 — 若传入 skuCode，从 product_skus 自动带出产品/等级/规格
      let productCode    = item.productCode;
      let gradeCode      = item.gradeCode ?? null;
      let packagingSpec  = item.packagingSpec ?? null;
      let skuCode: string | null = item.skuCode ?? null;

      if (skuCode) {
        try {
          const [skuRow] = await this.ds.query(
            `SELECT product_code, grade_code, spec_code, sku_name
             FROM product_skus WHERE sku_code=$1 AND status='ACTIVE' LIMIT 1`,
            [skuCode],
          );
          if (skuRow) {
            productCode   = skuRow.product_code;
            gradeCode     = skuRow.grade_code;
            packagingSpec = skuRow.spec_code;
          } else {
            this.logger.warn(`[SalesOrder] skuCode ${skuCode} 在 product_skus 中不存在或已停用，降级为旧逻辑`);
            skuCode = null;
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(`[SalesOrder] SKU 查询失败（不阻断建单）: ${msg}`);
          skuCode = null;
        }
      }

      let resolved: any = {
        unitPrice: 0, floorPrice: null, ceilingPrice: null,
        priceBookId: null, priceBookNo: null,
      };

      try {
        resolved = await this.priceRuntime.resolvePrice({
          companyCode:    dto.companyCode,
          productCode,
          gradeCode:      gradeCode ?? undefined,
          packagingSpec:  packagingSpec ?? undefined,
          qty:            item.qty,
          customerCode:   dto.customerCode ?? undefined,
          channelCode:    channelCode ?? undefined,
          skuCode:        skuCode ?? undefined,   // Phase H5: sku_code 优先匹配价格
        });
      } catch { /* 无价格时用 0 */ }

      const resolvedUnitPrice = Number(resolved.unitPrice ?? 0);
      const actualUnitPrice   = item.actualUnitPrice !== undefined
        ? Number(item.actualUnitPrice)
        : resolvedUnitPrice;

      const floorPrice   = resolved.floorPrice != null ? Number(resolved.floorPrice) : null;
      const ceilingPrice = resolved.ceilingPrice != null ? Number(resolved.ceilingPrice) : null;
      const belowFloor   = floorPrice !== null && actualUnitPrice < floorPrice;

      if (belowFloor) anyBelowFloor = true;

      const amount = Math.round(actualUnitPrice * Number(item.qty) * 100) / 100;

      resolvedItems.push({
        productCode,
        productName:      item.productName ?? null,
        gradeCode,
        packagingSpec,
        qty:              Number(item.qty),
        resolvedUnitPrice,
        actualUnitPrice,
        floorPrice,
        ceilingPrice,
        belowFloor,
        priceBookId:      resolved.priceBookId ? String(resolved.priceBookId) : null,
        priceBookNo:      resolved.priceBookNo ?? null,
        amount,
        skuCode,          // Phase H5
      });
    }

    const subtotal     = resolvedItems.reduce((s, i) => s + i.amount, 0);
    const totalAmount  = Math.round((subtotal - 0) * 100) / 100; // discount=0
    const orderNo      = await this.genOrderNo();
    const currencyCode = dto.currencyCode ?? 'LAK';

    return this.ds.transaction(async (mgr) => {
    const orderResult = await mgr.query(
      `INSERT INTO sal_sales_orders (
         order_no, customer_id, customer_code, customer_name,
         company_code, company_name, fulfillment_warehouse_code, warehouse_governance_pending, channel_code,
         price_book_id, price_book_no, currency_code,
         subtotal, discount, total_amount,
         status, need_price_approval, need_credit_approval,
         over_credit, below_floor_price,
         expected_delivery_date, delivery_address, remark, created_by
       ) VALUES (
         $1,$2,$3,$4,
         $5,$6,$7,FALSE,$8,
         $9,$10,$11,
         $12,0,$13,
         'DRAFT',FALSE,FALSE,
         FALSE,$14,
         $15,$16,$17,$18
       ) RETURNING *`,
      [
        orderNo,
        customer ? String(customer.id) : null,
        customer?.customer_no ?? dto.customerCode ?? null,
        customer?.customer_name ?? null,
        dto.companyCode, dto.companyName ?? null, dto.fulfillmentWarehouseCode,
        channelCode,
        resolvedItems[0]?.priceBookId ?? null,
        resolvedItems[0]?.priceBookNo ?? null,
        currencyCode,
        subtotal, totalAmount,
        anyBelowFloor,
        dto.expectedDeliveryDate ?? null,
        dto.deliveryAddress ?? null,
        dto.remark ?? null,
        user.userName || user.userId,
      ],
    );
    const order = orderResult[0];

    // 明细行
    for (const item of resolvedItems) {
      await this.insertOrderItem({ salesOrderId: String(order.id), ...item }, mgr);
    }

    await this.lifecycle.appendEvent(mgr, {
      salesOrderId: String(order.id), orderNo: order.order_no,
      eventType: 'CREATED', fromStatus: null, toStatus: 'DRAFT',
      actorUserId: user.userId, actorName: user.userName, actorType: 'USER',
      comment: dto.remark ?? null, sourceEndpoint: '/api/v2/sales/orders',
      sourceModule: 'SALES_ORDER',
    });

    const items = await mgr.query(
      `SELECT * FROM sal_order_items WHERE sales_order_id = $1 ORDER BY id ASC`,
      [String(order.id)],
    );
    return { ...order, items };
    });
  }

  // ── 4. 更新草稿 ───────────────────────────────────────────────────────────

  async updateDraft(id: string, dto: UpdateSalesOrderDto) {
    const rec = await this.assertOwnership(id);
    if (rec.status !== 'DRAFT') {
      throw new ForbiddenException(`仅 DRAFT 状态的订单可编辑，当前状态：${rec.status}`);
    }

    // 如果 items 传入则重建明细（删旧插新）
    if (dto.items && dto.items.length > 0) {
      await this.ds.query(`DELETE FROM sal_order_items WHERE sales_order_id = $1`, [id]);

      let anyBelowFloor = false;
      const resolvedItems: any[] = [];
      const companyCode = rec.company_code;
      const channelCode = dto.channelCode ?? rec.channel_code ?? null;

      for (const item of dto.items) {
        // Phase H5: SKU 优先推导
        let productCode   = item.productCode;
        let gradeCode     = item.gradeCode ?? null;
        let packagingSpec = item.packagingSpec ?? null;
        let skuCode: string | null = item.skuCode ?? null;

        if (skuCode) {
          try {
            const [skuRow] = await this.ds.query(
              `SELECT product_code, grade_code, spec_code
               FROM product_skus WHERE sku_code=$1 AND status='ACTIVE' LIMIT 1`,
              [skuCode],
            );
            if (skuRow) {
              productCode   = skuRow.product_code;
              gradeCode     = skuRow.grade_code;
              packagingSpec = skuRow.spec_code;
            } else {
              skuCode = null;
            }
          } catch { skuCode = null; }
        }

        let resolved: any = { unitPrice: 0, floorPrice: null, ceilingPrice: null, priceBookId: null, priceBookNo: null };
        try {
          resolved = await this.priceRuntime.resolvePrice({
            companyCode, productCode,
            gradeCode:      gradeCode ?? undefined,
            packagingSpec:  packagingSpec ?? undefined,
            qty:            item.qty,
            customerCode:   dto.customerCode ?? rec.customer_code ?? undefined,
            channelCode:    channelCode ?? undefined,
            skuCode:        skuCode ?? undefined,  // Phase H5
          });
        } catch { /* fallback 0 */ }

        const resolvedUnitPrice = Number(resolved.unitPrice ?? 0);
        const actualUnitPrice   = item.actualUnitPrice !== undefined ? Number(item.actualUnitPrice) : resolvedUnitPrice;
        const floorPrice   = resolved.floorPrice != null ? Number(resolved.floorPrice) : null;
        const ceilingPrice = resolved.ceilingPrice != null ? Number(resolved.ceilingPrice) : null;
        const belowFloor   = floorPrice !== null && actualUnitPrice < floorPrice;
        if (belowFloor) anyBelowFloor = true;
        const amount = Math.round(actualUnitPrice * Number(item.qty) * 100) / 100;

        resolvedItems.push({
          productCode, productName: item.productName ?? null,
          gradeCode, packagingSpec,
          qty: Number(item.qty), resolvedUnitPrice, actualUnitPrice, floorPrice, ceilingPrice,
          belowFloor, priceBookId: resolved.priceBookId ? String(resolved.priceBookId) : null,
          priceBookNo: resolved.priceBookNo ?? null, amount,
          skuCode,  // Phase H5
        });
      }

      const subtotal    = resolvedItems.reduce((s, i) => s + i.amount, 0);
      const totalAmount = Math.round(subtotal * 100) / 100;

      for (const item of resolvedItems) {
        await this.insertOrderItem({ salesOrderId: id, ...item });
      }

      // 更新订单金额
      await this.ds.query(
        `UPDATE sal_sales_orders
         SET subtotal=$1, total_amount=$2, below_floor_price=$3, updated_at=NOW()
         WHERE id=$4`,
        [subtotal, totalAmount, anyBelowFloor, id],
      );
    }

    // 更新头部字段
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    const add = (col: string, v: any) => {
      if (v !== undefined) { params.push(v); sets.push(`${col} = $${params.length}`); }
    };
    add('customer_code',          dto.customerCode);
    add('channel_code',           dto.channelCode);
    add('currency_code',          dto.currencyCode);
    add('expected_delivery_date', dto.expectedDeliveryDate);
    add('delivery_address',       dto.deliveryAddress);
    add('remark',                 dto.remark);

    params.push(id);
    const result = await this.ds.query(
      `UPDATE sal_sales_orders SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    const items = await this.ds.query(
      `SELECT * FROM sal_order_items WHERE sales_order_id = $1 ORDER BY id ASC`, [id],
    );
    return { ...result[0], items };
  }

  // ── 5. 提交审批（Phase 5 增强：信用控制 Runtime）────────────────────────

  async submit(id: string, dto: SubmitSalesOrderDto) {
    const rec = await this.assertOwnership(id);
    if (rec.status !== 'DRAFT') {
      throw new BadRequestException(`仅 DRAFT 状态可提交，当前：${rec.status}`);
    }

    // ── Phase 5：完整信用评估 ─────────────────────────────────────────────
    let overCredit         = false;
    let needCreditApproval = false;
    let creditWarning      = false;
    let creditSnapshot: Record<string, any> | null = null;

    if (rec.customer_code) {
      try {
        const eval_ = await this.customerCredit.evaluateCreditStatus(
          rec.customer_code, rec.company_code,
        );
        const snap = eval_.snapshot;
        creditSnapshot = {
          creditStatus:      eval_.creditStatus,
          policyMode:        eval_.policyMode,
          totalReceivable:   snap.totalReceivable,
          overdueReceivable: snap.overdueReceivable,
          overdueDays:       snap.overdueDays,
          creditLimit:       snap.creditLimit,
          creditUsed:        snap.creditUsed,
          creditAvailable:   snap.creditAvailable,
          paymentTerms:      snap.paymentTerms,
          riskLevel:         snap.riskLevel,
          reason:            eval_.reason,
          snapshotAt:        snap.snapshotAt,
        };

        // FROZEN / BLACKLIST → 禁止提交
        if (!eval_.allowOrder) {
          throw new ForbiddenException(eval_.reason);
        }
        // OVER_LIMIT / OVERDUE → 需要审批
        if (eval_.requireApproval) {
          overCredit         = true;
          needCreditApproval = true;
        }
        // WARNING → 允许提交，仅标记
        if (eval_.creditWarning) {
          creditWarning = true;
        }
      } catch (err: any) {
        // 仅透传明确列入白名单的信用域错误；基础设施及未知执行错误继续 fail-closed 为 503。
        if (err instanceof ForbiddenException || err instanceof CreditCustomerMasterNotFoundException) {
          throw err;
        }
        const errorName = String(err?.name ?? err?.constructor?.name ?? 'UnknownError');
        const errorCode = String(err?.code ?? 'UNKNOWN_EXECUTION_ERROR');
        this.logger.error(
          `[submit] 信用评估失败，已阻断提交 ${JSON.stringify({
            orderNo: rec.order_no,
            customerCode: rec.customer_code,
            companyCode: rec.company_code,
            errorName,
            errorCode,
          })}`,
          err?.stack,
        );
        throw new ServiceUnavailableException('信用评估服务暂时不可用，订单未提交，请稍后重试');
      }
    }

    const belowFloor        = !!rec.below_floor_price;
    const needPriceApproval = belowFloor;
    const needApproval      = needPriceApproval || needCreditApproval;
    const triggerCodes = [
      ...(needPriceApproval ? ['BELOW_FLOOR_PRICE'] : []),
      ...(needCreditApproval ? ['CREDIT_OVER_LIMIT'] : []),
    ];
    const user = this.currentUser();

    let finalRec: any = null;

    await this.ds.transaction(async (mgr) => {
      // 写入信用标记 + 快照
      await mgr.query(
        `UPDATE sal_sales_orders
         SET over_credit=$1, need_price_approval=$2, need_credit_approval=$3,
             credit_warning=$4, credit_snapshot=$5, updated_at=NOW()
         WHERE id=$6`,
        [
          overCredit, needPriceApproval, needCreditApproval,
          creditWarning, creditSnapshot ? JSON.stringify(creditSnapshot) : null,
          id,
        ],
      );

      await this.lifecycle.appendEvent(mgr, {
        salesOrderId: id, orderNo: rec.order_no, eventType: 'SUBMITTED',
        fromStatus: 'DRAFT', toStatus: needApproval ? 'PENDING_APPROVAL' : 'APPROVED',
        actorUserId: user.userId, actorName: user.userName, actorType: 'USER',
        comment: dto.remark ?? null, sourceEndpoint: '/api/v2/sales/orders/:id/submit',
        sourceModule: 'SALES_ORDER', metadata: { triggerCodes },
      });

      if (needApproval) {
        const snap = creditSnapshot ?? {};
        const lowPriceItems = await mgr.query(
          `SELECT sku_code AS "skuCode", product_code AS "productCode", product_name AS "productName",
                  actual_unit_price AS "actualUnitPrice", floor_price AS "floorPrice",
                  ROUND((floor_price-actual_unit_price)*qty,2) AS "priceDifference"
           FROM sal_order_items
           WHERE sales_order_id=$1 AND below_floor_price=TRUE
           ORDER BY id`,
          [id],
        );
        const contextSnapshot = {
          customerCode: rec.customer_code,
          customerName: rec.customer_name,
          totalAmount: Number(rec.total_amount),
          lowPriceItems,
          credit: {
            totalReceivable: snap.totalReceivable ?? 0,
            overdueReceivable: snap.overdueReceivable ?? 0,
            overdueDays: snap.overdueDays ?? 0,
            creditLimit: snap.creditLimit ?? 0,
            availableCredit: snap.creditAvailable ?? 0,
            status: snap.creditStatus ?? 'NORMAL',
            reason: snap.reason ?? '',
            snapshotAt: snap.snapshotAt ?? null,
          },
        };
        const wf = await this.approvalEngine.startApproval({
          bizType:     'SALES_ORDER',
          bizId:       id,
          bizNo:       rec.order_no,
          amount:      Number(rec.total_amount),
          companyCode: rec.company_code,
          companyName: rec.company_name ?? undefined,
          subject:     `销售订单审批：${rec.order_no}`,
          triggerCodes,
          contextSnapshot,
          conditionOverrides: {
            customerCode:      rec.customer_code,
            customerName:      rec.customer_name,
            channelCode:       rec.channel_code,
            belowFloorPrice:   belowFloor,
            overCredit,
            // Phase 5 信用上下文（审批人可见）
            totalReceivable:   snap.totalReceivable ?? 0,
            overdueReceivable: snap.overdueReceivable ?? 0,
            overdueDays:       snap.overdueDays ?? 0,
            creditLimit:       snap.creditLimit ?? 0,
            availableCredit:   snap.creditAvailable ?? 0,
            creditStatus:      snap.creditStatus ?? 'NORMAL',
            creditReason:      snap.reason ?? '',
          },
        }, mgr);

        // startApproval contract: null means the engine already performed the
        // fail-open DRAFT→APPROVED CAS and invoked this module's onApproved hook.
        if (!wf) {
          const [updated] = await mgr.query(`SELECT * FROM sal_sales_orders WHERE id=$1 AND status='APPROVED'`, [id]);
          if (!updated) throw new BadRequestException('无规则自动批准回写失败');
          await this.lifecycle.appendEvent(mgr, {
            salesOrderId: id, orderNo: rec.order_no, eventType: 'AUTO_APPROVED_NO_RULE',
            fromStatus: 'DRAFT', toStatus: 'APPROVED', actorType: 'SYSTEM',
            sourceModule: 'WORKFLOW', metadata: {
              triggerCodes, ruleLookup: 'NO_MATCH_OR_NO_STEPS', failOpenEnabled: true,
            },
          });
          finalRec = { ...updated, _note: '无审批规则，已自动批准' };
        } else {
          finalRec = await this.lifecycle.transitionStatus(
            mgr, id, 'DRAFT', 'PENDING_APPROVAL', ', wf_instance_id=$4', [String(wf.id)],
          );
          await this.lifecycle.appendEvent(mgr, {
            salesOrderId: id, orderNo: rec.order_no, eventType: 'APPROVAL_STARTED',
            fromStatus: 'DRAFT', toStatus: 'PENDING_APPROVAL', actorType: 'SYSTEM',
            sourceModule: 'WORKFLOW', sourceRefType: 'WORKFLOW_INSTANCE',
            sourceRefId: String(wf.id), metadata: { triggerCodes },
          });
        }
      } else {
        const updated = await this.lifecycle.transitionStatus(mgr, id, 'DRAFT', 'APPROVED');
        await this.lifecycle.appendEvent(mgr, {
          salesOrderId: id, orderNo: rec.order_no, eventType: 'AUTO_APPROVED_NOT_REQUIRED',
          fromStatus: 'DRAFT', toStatus: 'APPROVED', actorType: 'SYSTEM',
          sourceModule: 'WORKFLOW', metadata: { triggerCodes, creditWarning },
        });
        await this.applyApprovedInventory(id, rec.order_no, rec.company_code, rec.fulfillment_warehouse_code, mgr);
        finalRec = { ...updated, _note: creditWarning ? '信用预警（WARNING），已批准但需关注' : '无审批要求，已自动批准' };
      }
    });

    return finalRec;
  }

  // ── 6. 审批通过回调（WorkflowBizRegistry onApproved）────────────────────

  private async applyApprovedInventory(
    orderId: string,
    orderNo: string,
    companyCode: string,
    fulfillmentWarehouseCode: string | null,
    mgr: EntityManager,
  ): Promise<void> {
    if (fulfillmentWarehouseCode) {
      await this.assertFulfillmentWarehouse(companyCode, fulfillmentWarehouseCode);
    } else {
      await mgr.query(`UPDATE sal_sales_orders SET warehouse_governance_pending=TRUE WHERE id=$1`, [orderId]);
    }
    const created = await this.eggInventory.reserveInventory(
      orderId, orderNo, companyCode, mgr, fulfillmentWarehouseCode ?? undefined,
    );
    if (!created) return;
    await this.lifecycle.appendEvent(mgr, {
      salesOrderId: orderId, orderNo, eventType: 'INVENTORY_RESERVED',
      actorType: 'SYSTEM', sourceModule: 'WMS', sourceRefType: 'SALES_ORDER',
      sourceRefId: orderId, sourceRefNo: orderNo,
    });
  }

  async approveCallback(bizId: string, mgr: EntityManager): Promise<void> {
    const [order] = await mgr.query(
      `SELECT so.id,so.order_no,so.company_code,so.fulfillment_warehouse_code,so.wf_instance_id,so.status,
              COALESCE(i.trigger_codes,'{}'::text[]) AS trigger_codes
       FROM sal_sales_orders so LEFT JOIN wf_approval_instances i ON i.id=so.wf_instance_id
       WHERE so.id=$1`, [bizId],
    );
    if (!order) throw new NotFoundException(`销售订单 ${bizId} 不存在`);
    if (order.status !== 'APPROVED') {
      throw new ConflictException(`销售订单 ${order.order_no} 当前状态 ${order.status}，拒绝执行批准副作用`);
    }
    await this.lifecycle.appendEvent(mgr, {
      salesOrderId: bizId, orderNo: order.order_no, eventType: 'APPROVED',
      fromStatus: 'PENDING_APPROVAL', toStatus: 'APPROVED', actorType: 'WORKFLOW',
      sourceModule: 'WORKFLOW', sourceRefType: 'WORKFLOW_INSTANCE',
      sourceRefId: order.wf_instance_id ? String(order.wf_instance_id) : null,
      metadata: { triggerCodes: order.trigger_codes ?? [] },
    });
    this.logger.log(`[SalesOrder] 审批通过: orderId=${bizId} → APPROVED`);

    await this.applyApprovedInventory(bizId, order.order_no, order.company_code, order.fulfillment_warehouse_code, mgr);
  }

  // ── 7. 审批拒绝回调（WorkflowBizRegistry onRejected）────────────────────

  async rejectCallback(bizId: string, mgr: EntityManager): Promise<void> {
    const [order] = await mgr.query(
      `SELECT so.order_no,so.wf_instance_id,COALESCE(i.trigger_codes,'{}'::text[]) AS trigger_codes
       FROM sal_sales_orders so LEFT JOIN wf_approval_instances i ON i.id=so.wf_instance_id WHERE so.id=$1`, [bizId],
    );
    if (!order) throw new NotFoundException(`销售订单 ${bizId} 不存在`);
    await this.lifecycle.appendEvent(mgr, {
      salesOrderId: bizId, orderNo: order.order_no, eventType: 'REJECTED',
      fromStatus: 'PENDING_APPROVAL', toStatus: 'REJECTED', actorType: 'WORKFLOW',
      reasonCode: 'WORKFLOW_REJECTED', comment: '审批拒绝（意见见 Workflow 步骤）',
      sourceModule: 'WORKFLOW', sourceRefType: 'WORKFLOW_INSTANCE',
      sourceRefId: order.wf_instance_id ? String(order.wf_instance_id) : null,
      metadata: { triggerCodes: order.trigger_codes ?? [] },
    });
    this.logger.log(`[SalesOrder] 审批拒绝: orderId=${bizId} → REJECTED`);
  }

  async cancelCallback(bizId: string, mgr: EntityManager): Promise<void> {
    const [order] = await mgr.query(
      `SELECT so.order_no,so.wf_instance_id,COALESCE(i.trigger_codes,'{}'::text[]) AS trigger_codes
       FROM sal_sales_orders so LEFT JOIN wf_approval_instances i ON i.id=so.wf_instance_id WHERE so.id=$1`, [bizId],
    );
    if (!order) throw new NotFoundException(`销售订单 ${bizId} 不存在`);
    await this.lifecycle.appendEvent(mgr, {
      salesOrderId: bizId, orderNo: order.order_no, eventType: 'CANCELLED',
      fromStatus: 'PENDING_APPROVAL', toStatus: 'CANCELLED', actorType: 'WORKFLOW',
      reasonCode: 'WORKFLOW_CANCELLED', comment: '审批实例取消并回写订单',
      sourceModule: 'WORKFLOW', sourceRefType: 'WORKFLOW_INSTANCE',
      sourceRefId: order.wf_instance_id ? String(order.wf_instance_id) : null,
      metadata: { triggerCodes: order.trigger_codes ?? [] },
    });
  }

  // ── 8. 取消 ───────────────────────────────────────────────────────────────

  async cancel(id: string, dto: CancelSalesOrderDto) {
    const rec = await this.assertOwnership(id);
    if (NO_CANCEL_STATUSES.has(rec.status)) {
      throw new BadRequestException(`状态 ${rec.status} 的订单不可取消（已发货后禁止取消）`);
    }
    if (rec.status === 'CANCELLED') return rec;

    const user = this.currentUser();
    return this.ds.transaction(async (mgr) => {
      const [current] = await mgr.query(`SELECT * FROM sal_sales_orders WHERE id=$1`, [id]);
      if (!current) throw new NotFoundException(`销售订单 ${id} 不存在`);
      if (NO_CANCEL_STATUSES.has(current.status)) throw new BadRequestException(`状态 ${current.status} 的订单不可取消`);
      // 与 approve/reject 保持一致的锁顺序：实例 → 业务单据，规避双向联动死锁。
      if (current.status === 'PENDING_APPROVAL') {
        if (!current.wf_instance_id) throw new BadRequestException('待审批订单缺少审批实例，已拒绝取消');
        await this.approvalEngine.cancelInstance(String(current.wf_instance_id), mgr, false);
      }
      const [locked] = await mgr.query(`SELECT * FROM sal_sales_orders WHERE id=$1 FOR UPDATE`, [id]);
      if (NO_CANCEL_STATUSES.has(locked.status)) throw new BadRequestException(`状态 ${locked.status} 的订单不可取消`);
      if (locked.status === 'APPROVED' || locked.status === 'ALLOCATED') {
        await this.eggInventory.releaseInventory(id, rec.order_no, rec.company_code, mgr);
      }
      const updated = await this.lifecycle.transitionStatus(mgr, id, locked.status, 'CANCELLED');
      await this.lifecycle.appendEvent(mgr, {
        salesOrderId: id, orderNo: rec.order_no, eventType: 'CANCELLED',
        fromStatus: locked.status, toStatus: 'CANCELLED', actorType: 'USER',
        actorUserId: user.userId, actorName: user.userName,
        reasonCode: 'USER_CANCELLED', comment: dto.remark,
        sourceEndpoint: '/api/v2/sales/orders/:id/cancel', sourceModule: 'SALES_ORDER',
      });
      return updated;
    });
  }

  // ── 9. 状态流转（白名单控制）──────────────────────────────────────────────

  async transition(id: string, dto: TransitionSalesOrderDto) {
    await this.assertOwnership(id);
    throw new ForbiddenException(
      `禁止通过订单 transition 执行 ${dto.targetStatus}；请使用配送/WMS 履约入口，人工纠偏使用 manual-override`,
    );
  }

  async manualOverride(id: string, dto: ManualOverrideSalesOrderDto) {
    const rec = await this.assertOwnership(id);
    if (rec.status === dto.targetStatus) throw new BadRequestException('目标状态与当前状态相同');
    if (dto.targetStatus === 'APPROVED') {
      throw new BadRequestException('人工纠偏不可进入 APPROVED；批准必须通过订单提交/审批唯一入口');
    }
    const user = this.currentUser();
    return this.ds.transaction(async (mgr) => {
      const updated = await this.lifecycle.transitionStatus(mgr, id, rec.status, dto.targetStatus);
      await this.lifecycle.appendEvent(mgr, {
        salesOrderId: id, orderNo: rec.order_no, eventType: 'MANUAL_OVERRIDE',
        fromStatus: rec.status, toStatus: dto.targetStatus, actorType: 'USER',
        actorUserId: user.userId, actorName: user.userName,
        reasonCode: 'MANUAL_OVERRIDE', comment: dto.reason,
        sourceEndpoint: '/api/v2/sales/orders/:id/manual-override', sourceModule: 'SALES_ORDER',
      });
      return updated;
    });
  }

  // ── 10. 标记签收 + 生成 Finance V2 AR ────────────────────────────────────

  async markReceived(id: string) {
    const rec = await this.assertOwnership(id);

    if (rec.status !== 'DELIVERED') {
      throw new BadRequestException(`仅 DELIVERED 状态可标记签收，当前：${rec.status}`);
    }
    if (rec.ar_invoice_id) {
      throw new BadRequestException('AR Invoice 已存在，不可重复创建');
    }

    const user = this.currentUser();
    return this.ds.transaction((mgr) => this.receiveWithAr(mgr, rec, {
      actorType: 'USER', actorUserId: user.userId, actorName: user.userName,
      sourceEndpoint: '/api/v2/sales/orders/:id/mark-received', sourceModule: 'SALES_ORDER',
    }));
  }

  async receiveWithAr(
    mgr: EntityManager,
    rec: any,
    context: {
      actorType: 'USER' | 'SYSTEM' | 'MOBILE' | 'INTEGRATION';
      actorUserId?: string; actorName?: string; sourceEndpoint?: string;
      sourceModule: string; sourceRefType?: string; sourceRefId?: string; sourceRefNo?: string;
    },
  ) {
    let paymentTermsDays = 30;
    if (rec.customer_code) {
      const cRows = await mgr.query(
        `SELECT payment_terms FROM sal_customers
         WHERE (customer_no = $1 OR legacy_customer_code = $1)
           AND company_code = $2
         LIMIT 1`,
        [rec.customer_code, rec.company_code],
      );
      if (cRows.length && cRows[0].payment_terms) {
        paymentTermsDays = Number(cRows[0].payment_terms) || 30;
      }
    }

    // 创建 AR Invoice（Finance V2 AR Runtime，严禁写 fin_transactions）
    const updated = await this.lifecycle.transitionStatus(
      mgr, String(rec.id), rec.status, 'RECEIVED', ', received_at=NOW()',
    );
    await this.lifecycle.appendEvent(mgr, {
      salesOrderId: String(rec.id), orderNo: rec.order_no, eventType: 'RECEIPT_COMPLETED',
      fromStatus: rec.status, toStatus: 'RECEIVED', ...context,
    });

    const arId = await this.financeAr.createArForOrder({
      orderId:         String(rec.id),
      orderNo:         rec.order_no,
      companyCode:     rec.company_code,
      companyName:     rec.company_name ?? undefined,
      customerId:      rec.customer_id ? String(rec.customer_id) : undefined,
      customerCode:    rec.customer_code ?? undefined,
      customerName:    rec.customer_name ?? '未知客户',
      currencyCode:    rec.currency_code ?? 'LAK',
      totalAmount:     Number(rec.total_amount),
      paymentTermsDays,
      receivedAt:      new Date(),
      createdBy:       context.actorName || context.actorUserId || context.actorType,
    }, mgr);

    // 回写 ar_invoice_id
    await mgr.query(
      `UPDATE sal_sales_orders SET ar_invoice_id=$1, updated_at=NOW() WHERE id=$2 AND status='RECEIVED' AND ar_invoice_id IS NULL`,
      [arId, String(rec.id)],
    );
    await this.lifecycle.appendEvent(mgr, {
      salesOrderId: String(rec.id), orderNo: rec.order_no, eventType: 'AR_CREATED',
      fromStatus: 'RECEIVED', toStatus: 'RECEIVED', ...context,
      comment: `应收单由签收自动生成`, sourceEndpoint: '/api/v2/sales/orders/:id/mark-received',
      sourceModule: 'FINANCE_AR', sourceRefType: 'AR_INVOICE',
      sourceRefId: arId, metadata: { sourceType: 'SALES_ORDER' },
    });

    return { ...updated, ar_invoice_id: arId };
  }

  // ── 11. Dashboard 统计 ────────────────────────────────────────────────────

  async getDashboardStats(companyCode?: string) {
    const user = this.currentUser();
    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (!user.scopeAll) {
      if (user.companyCodes.length > 0) {
        params.push(user.companyCodes); where.push(`company_code = ANY($${params.length})`);
      } else {
        where.push('1=0');  // 未配置数据范围 → 拒绝访问
      }
    }
    if (companyCode) { params.push(companyCode); where.push(`company_code = $${params.length}`); }

    const wc = where.join(' AND ');

    const [todayRow, pendingRow, receivedRow, arPendingRow, arDoneRow, lowPriceRow, overCreditRow] = await Promise.all([
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_sales_orders WHERE ${wc} AND created_at >= CURRENT_DATE`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_sales_orders WHERE ${wc} AND status = 'PENDING_APPROVAL'`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_sales_orders WHERE ${wc} AND status IN ('RECEIVED','RECONCILED')`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_sales_orders WHERE ${wc} AND status = 'RECEIVED' AND ar_invoice_id IS NULL`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_sales_orders WHERE ${wc} AND ar_invoice_id IS NOT NULL`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_sales_orders WHERE ${wc} AND below_floor_price = TRUE AND status IN ('DRAFT','PENDING_APPROVAL')`, params),
      this.ds.query(`SELECT COUNT(*) AS cnt FROM sal_sales_orders WHERE ${wc} AND over_credit = TRUE AND status IN ('DRAFT','PENDING_APPROVAL')`, params),
    ]);

    return {
      todayOrders:    Number(todayRow[0].cnt),
      pendingApproval: Number(pendingRow[0].cnt),
      receivedOrders:  Number(receivedRow[0].cnt),
      arPending:       Number(arPendingRow[0].cnt),
      arGenerated:     Number(arDoneRow[0].cnt),
      lowPriceOrders:  Number(lowPriceRow[0].cnt),
      overCreditOrders: Number(overCreditRow[0].cnt),
    };
  }
}
