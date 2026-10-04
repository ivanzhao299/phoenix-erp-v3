import {
  Injectable, Logger, NotFoundException,
  BadRequestException, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import { FinanceCreditNoteAdapter } from '../adapters/finance-credit-note.adapter';
import { EggInventoryService } from './egg-inventory.service';      // Phase 7
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import { DataScopeContext } from '../../org/services/data-scope.service';

/**
 * ReturnOrdersService — Sales V2 Phase 6
 *
 * 退货 Runtime 核心业务逻辑。
 *
 * 状态机：
 *   DRAFT → submit() → PENDING_APPROVAL (need_approval)
 *                    → INSPECTING       (直接)
 *   PENDING_APPROVAL → approve() → INSPECTING
 *                    → reject()  → REJECTED
 *   INSPECTING → completeInspection() → RESTOCKING (accepted_qty > 0)
 *                                     → COMPLETED  (全部破损)
 *   RESTOCKING → completeRestock() → COMPLETED
 *
 * 安全约束：
 *   · COMPLETED 后不允许修改
 *   · damaged_qty 不回库存（只写 inv_ledger WRITE_OFF）
 *   · accepted_qty 不得超过 returned_qty
 *   · Credit Note amount 必须为负数
 *   · 严禁写 fin_transactions
 */
@Injectable()
export class ReturnOrdersService {
  private readonly logger = new Logger(ReturnOrdersService.name);

  /** 大额退货审批阈值（LAK） */
  private readonly APPROVAL_THRESHOLD = 500_000;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly creditNoteAdapter: FinanceCreditNoteAdapter,
    private readonly eggInventory: EggInventoryService,             // Phase 7
    private readonly lifecycle: SalesOrderLifecycleService,
  ) {}

  // ── 内部工具 ─────────────────────────────────────────────────────────────────

  private get currentUser(): string {
    try { return this.cls.get('user')?.username ?? 'system'; } catch { return 'system'; }
  }

  private get dataScope(): DataScopeContext {
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    // DataScopeGuard should always populate this context. Fail closed if a
    // caller reaches the service without it rather than exposing all returns.
    return scope ?? {
      isGlobal: false,
      scopeLevel: 'SELF',
      allowedCompanyCodes: [],
      allowedProjectCodes: [],
      allowedWarehouseCodes: [],
      allowedFarmCodes: [],
      allowedSiteCodes: [],
      userId: '',
    };
  }

  private appendCompanyScope(
    conds: string[], params: unknown[], alias: string, requested?: string,
  ) {
    const scope = this.dataScope;
    if (!scope.isGlobal) {
      if (scope.allowedCompanyCodes.length === 0) {
        conds.push('1=0');
      } else {
        params.push(scope.allowedCompanyCodes);
        conds.push(`${alias}.company_code = ANY($${params.length})`);
      }
    }
    if (requested) {
      params.push(requested);
      conds.push(`${alias}.company_code = $${params.length}`);
    }
  }

  private assertCompanyAllowed(companyCode: string) {
    const scope = this.dataScope;
    if (!scope.isGlobal && !scope.allowedCompanyCodes.includes(companyCode)) {
      throw new ForbiddenException(`无权访问公司 ${companyCode} 的退货单`);
    }
  }

  private async genReturnNo(): Promise<string> {
    const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `RET-${today}-`;
    const [row]  = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM sal_return_orders WHERE return_no LIKE $1`,
      [`${prefix}%`],
    );
    return `${prefix}${String(Number(row.cnt) + 1).padStart(5, '0')}`;
  }

  private assertNotCompleted(status: string, action: string) {
    if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(status)) {
      throw new ForbiddenException(`退货单已终态 (${status})，不允许执行 ${action}`);
    }
  }

  private async findRaw(id: string) {
    // Every state transition must resolve through the same company scope gate
    // as read endpoints; this prevents ID-based cross-company mutations.
    const conds = ['r.id = $1'];
    const params: unknown[] = [id];
    this.appendCompanyScope(conds, params, 'r');
    const [row] = await this.ds.query(
      `SELECT r.* FROM sal_return_orders r WHERE ${conds.join(' AND ')}`, params,
    );
    if (!row) throw new NotFoundException(`退货单 ${id} 不存在`);
    return row;
  }

  private async appendOrderEvent(
    rec: Record<string, any>, eventType: string, fromStatus: string | null,
    toStatus: string | null, comment?: string | null, metadata?: Record<string, unknown>,
    mgr?: EntityManager,
  ) {
    if (!rec.sales_order_id || !rec.sales_order_no) return;
    const append = (manager: EntityManager) => this.lifecycle.appendEvent(manager, {
      salesOrderId: String(rec.sales_order_id), orderNo: String(rec.sales_order_no),
      eventType, fromStatus, toStatus, actorType: 'USER', actorName: this.currentUser,
      reasonCode: rec.reason_code ?? null, comment: comment ?? null,
      sourceEndpoint: `/api/v2/sales/returns/${rec.id}`,
      sourceModule: 'RETURN', sourceRefType: 'RETURN', sourceRefId: String(rec.id),
      sourceRefNo: String(rec.return_no), metadata,
    });
    if (mgr) await append(mgr); else await this.ds.transaction(append);
  }

  private async assertRestockTarget(
    companyCode: string, warehouseCode: string, zoneCode: string, locationCode: string,
    mgr: EntityManager,
  ) {
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    if (!scope?.isGlobal && !scope?.allowedWarehouseCodes.includes(warehouseCode)) {
      throw new ForbiddenException(`无权使用回库仓 ${warehouseCode}`);
    }
    const [target] = await mgr.query(
      `SELECT w.warehouse_code
       FROM wms_warehouses w
       JOIN wms_zones z ON z.zone_code=$2 AND z.warehouse_code=w.warehouse_code
       JOIN wms_locations l ON l.location_code=$3 AND l.warehouse_code=w.warehouse_code AND l.zone_code=z.zone_code
       WHERE w.warehouse_code=$1 AND w.company_code=$4 AND w.status='ACTIVE' AND w.domain='OPERATIONAL'
         AND w.owner_store_id IS NULL AND z.status IN ('ACTIVE','NORMAL') AND l.status IN ('ACTIVE','NORMAL')`,
      [warehouseCode, zoneCode, locationCode, companyCode],
    );
    if (!target) throw new BadRequestException('回库目标必须是本公司 ACTIVE/OPERATIONAL 仓内的有效隔离库区及货位');
  }

  // ── 1. 列表 ─────────────────────────────────────────────────────────────────

  async list(query: {
    companyCode?: string;
    customerCode?: string;
    status?: string;
    returnType?: string;
    page?: number;
    limit?: number;
  }) {
    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);
    const offset = (page - 1) * limit;

    const conds: string[] = ['1=1'];
    const params: unknown[] = [];
    let pi = 1;

    this.appendCompanyScope(conds, params, 'r', query.companyCode);
    pi = params.length + 1;
    if (query.customerCode){ conds.push(`r.customer_code = $${pi++}`); params.push(query.customerCode); }
    if (query.status)       { conds.push(`r.status = $${pi++}`); params.push(query.status); }
    if (query.returnType)   { conds.push(`r.return_type = $${pi++}`); params.push(query.returnType); }

    const where = conds.join(' AND ');

    const [{ total }] = await this.ds.query(
      `SELECT COUNT(*) AS total FROM sal_return_orders r WHERE ${where}`,
      params,
    );

    const rows = await this.ds.query(
      `SELECT r.*,
       (SELECT c.customer_name FROM sal_customers c WHERE c.customer_no=r.customer_code ORDER BY c.id LIMIT 1) AS customer_name_master,
       (SELECT c.customer_name_en FROM sal_customers c WHERE c.customer_no=r.customer_code ORDER BY c.id LIMIT 1) AS customer_name_en,
       (SELECT c.customer_name_lo FROM sal_customers c WHERE c.customer_no=r.customer_code ORDER BY c.id LIMIT 1) AS customer_name_lo,
       (SELECT COALESCE(o.org_name_cn,o.org_name) FROM sys_organizations o WHERE o.org_type='COMPANY' AND COALESCE(o.company_code,o.org_code)=r.company_code ORDER BY o.org_code LIMIT 1) AS company_name_display,
       (
         SELECT json_agg(x ORDER BY x.id) FROM (
           SELECT i.*,
             (SELECT ps.sku_name FROM product_skus ps WHERE ps.sku_code=i.sku_code LIMIT 1) AS sku_name,
             (SELECT ps.sku_name_en FROM product_skus ps WHERE ps.sku_code=i.sku_code LIMIT 1) AS sku_name_en,
             (SELECT ps.sku_name_lo FROM product_skus ps WHERE ps.sku_code=i.sku_code LIMIT 1) AS sku_name_lo,
             (SELECT p.product_name_zh FROM mst_products p WHERE p.product_code=i.product_code LIMIT 1) AS product_name_zh,
             (SELECT p.product_name_en FROM mst_products p WHERE p.product_code=i.product_code LIMIT 1) AS product_name_en,
             (SELECT p.product_name_lo FROM mst_products p WHERE p.product_code=i.product_code LIMIT 1) AS product_name_lo
           FROM sal_return_items i WHERE i.return_order_id = r.id
         ) x
       ) AS items
       FROM sal_return_orders r
       WHERE ${where}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset],
    );

    return {
      data:  rows,
      total: Number(total),
      page,
      limit,
    };
  }

  // ── 2. 详情 ─────────────────────────────────────────────────────────────────

  async findById(id: string) {
    const conds = ['r.id = $1'];
    const params: unknown[] = [id];
    this.appendCompanyScope(conds, params, 'r');
    const [row] = await this.ds.query(
      `SELECT r.*,
       (SELECT c.customer_name FROM sal_customers c WHERE c.customer_no=r.customer_code ORDER BY c.id LIMIT 1) AS customer_name_master,
       (SELECT c.customer_name_en FROM sal_customers c WHERE c.customer_no=r.customer_code ORDER BY c.id LIMIT 1) AS customer_name_en,
       (SELECT c.customer_name_lo FROM sal_customers c WHERE c.customer_no=r.customer_code ORDER BY c.id LIMIT 1) AS customer_name_lo,
       (SELECT COALESCE(o.org_name_cn,o.org_name) FROM sys_organizations o WHERE o.org_type='COMPANY' AND COALESCE(o.company_code,o.org_code)=r.company_code ORDER BY o.org_code LIMIT 1) AS company_name_display,
       (
         SELECT json_agg(x ORDER BY x.id) FROM (
           SELECT i.*,
             (SELECT ps.sku_name FROM product_skus ps WHERE ps.sku_code=i.sku_code LIMIT 1) AS sku_name,
             (SELECT ps.sku_name_en FROM product_skus ps WHERE ps.sku_code=i.sku_code LIMIT 1) AS sku_name_en,
             (SELECT ps.sku_name_lo FROM product_skus ps WHERE ps.sku_code=i.sku_code LIMIT 1) AS sku_name_lo,
             (SELECT p.product_name_zh FROM mst_products p WHERE p.product_code=i.product_code LIMIT 1) AS product_name_zh,
             (SELECT p.product_name_en FROM mst_products p WHERE p.product_code=i.product_code LIMIT 1) AS product_name_en,
             (SELECT p.product_name_lo FROM mst_products p WHERE p.product_code=i.product_code LIMIT 1) AS product_name_lo
           FROM sal_return_items i WHERE i.return_order_id = r.id
         ) x
       ) AS items
       FROM sal_return_orders r WHERE ${conds.join(' AND ')}`,
      params,
    );
    if (!row) throw new NotFoundException(`退货单 ${id} 不存在`);
    return row;
  }

  // ── 3. 创建退货单 ────────────────────────────────────────────────────────────

  async create(body: {
    salesOrderId?:   string;
    salesOrderNo?:   string;
    deliveryOrderId?: string;
    customerCode?:   string;
    customerName?:   string;
    companyCode:     string;
    companyName?:    string;
    returnType:      string;
    reasonCode?:     string;
    currencyCode?:   string;
    remark?:         string;
    targetWarehouseCode?: string;
    targetZoneCode?: string;
    targetLocationCode?: string;
    items: Array<{
      salesOrderItemId?: string;
      productCode:       string;
      productName?:      string;
      gradeCode?:        string;
      packagingSpec?:    string;
      returnedQty:       number;
      unitPrice:         number;
      remark?:           string;
      /** Phase H5: 可选 SKU，优先从原销售明细自动继承 */
      skuCode?:          string;
    }>;
  }) {
    if (!body.items?.length) {
      throw new BadRequestException('退货单至少需要一条明细');
    }

    const validTypes = ['CUSTOMER_RETURN', 'DELIVERY_REJECT', 'QUALITY_RETURN', 'DAMAGE_RETURN'];
    if (!validTypes.includes(body.returnType)) {
      throw new BadRequestException(`无效的退货类型: ${body.returnType}`);
    }

    // 如果来自销售订单，自动带入客户信息
    let customerCode = body.customerCode;
    let customerName = body.customerName;
    let companyCode  = body.companyCode;
    let companyName  = body.companyName;
    let currencyCode = body.currencyCode ?? 'LAK';
    let targetWarehouseCode = body.targetWarehouseCode;

    if (body.salesOrderId) {
      const [order] = await this.ds.query(
        `SELECT customer_code, customer_name, company_code, company_name, currency_code, fulfillment_warehouse_code
         FROM sal_sales_orders WHERE id = $1`,
        [body.salesOrderId],
      );
      if (order) {
        this.assertCompanyAllowed(String(order.company_code));
        if (body.companyCode && body.companyCode !== order.company_code) {
          throw new BadRequestException('销售订单所属公司与退货单公司不一致');
        }
        customerCode = customerCode ?? order.customer_code;
        customerName = customerName ?? order.customer_name;
        companyCode  = companyCode  ?? order.company_code;
        companyName  = companyName  ?? order.company_name;
        currencyCode = currencyCode ?? order.currency_code ?? 'LAK';
        targetWarehouseCode = targetWarehouseCode ?? order.fulfillment_warehouse_code ?? undefined;
      }
    }

    this.assertCompanyAllowed(String(companyCode));

    const normalizedItems: Array<{
      salesOrderItemId?: string;
      productCode: string;
      productName?: string;
      gradeCode?: string;
      packagingSpec?: string;
      returnedQty: number;
      unitPrice: number;
      remark?: string;
      skuCode: string | null;
    }> = [];
    for (const it of body.items) {
      if (it.returnedQty <= 0) throw new BadRequestException('退货数量必须大于 0');
      let skuCode: string | null = it.skuCode ?? null;
      let productCode = it.productCode;
      let productName = it.productName;
      let gradeCode = it.gradeCode;
      let packagingSpec = it.packagingSpec;
      if (it.salesOrderItemId) {
        if (!body.salesOrderId) {
          throw new BadRequestException('退货明细关联销售订单明细时必须提供 salesOrderId');
        }
        const [origItem] = await this.ds.query(
          `SELECT sku_code, product_code, product_name, grade_code, packaging_spec
             FROM sal_order_items
            WHERE id=$1 AND sales_order_id=$2
            LIMIT 1`,
          [it.salesOrderItemId, body.salesOrderId],
        );
        if (!origItem) {
          throw new BadRequestException('退货明细不属于当前销售订单');
        }
        skuCode = origItem.sku_code ?? null;
        productCode = origItem.product_code;
        productName = origItem.product_name ?? undefined;
        gradeCode = origItem.grade_code ?? undefined;
        packagingSpec = origItem.packaging_spec ?? undefined;
      }
      normalizedItems.push({
        salesOrderItemId: it.salesOrderItemId,
        productCode, productName, gradeCode, packagingSpec,
        returnedQty: it.returnedQty, unitPrice: it.unitPrice,
        remark: it.remark, skuCode,
      });
    }

    const returnNo = await this.genReturnNo();
    const subtotal = normalizedItems.reduce((s, it) => s + it.returnedQty * it.unitPrice, 0);
    const operator = this.currentUser;

    const [ret] = await this.ds.query(
      `INSERT INTO sal_return_orders (
         return_no, sales_order_id, sales_order_no, delivery_order_id,
         customer_code, customer_name, company_code, company_name,
         return_type, reason_code, currency_code, subtotal,
         target_warehouse_code, target_zone_code, target_location_code,
         status, need_approval, created_by, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
         $13,$14,$15,'DRAFT',false,$16,NOW(),NOW()
       ) RETURNING *`,
      [
        returnNo,
        body.salesOrderId ?? null,
        body.salesOrderNo ?? null,
        body.deliveryOrderId ?? null,
        customerCode ?? null,
        customerName ?? null,
        companyCode,
        companyName ?? null,
        body.returnType,
        body.reasonCode ?? null,
        currencyCode,
        subtotal,
        targetWarehouseCode ?? null,
        body.targetZoneCode ?? null,
        body.targetLocationCode ?? null,
        operator,
      ],
    );

    // 插入明细
    for (const it of normalizedItems) {
      const amount = it.returnedQty * it.unitPrice;

      await this.ds.query(
        `INSERT INTO sal_return_items (
           return_order_id, sales_order_item_id,
           product_code, product_name, grade_code, packaging_spec,
           returned_qty, accepted_qty, damaged_qty,
           unit_price, amount,
           inspection_result, restock_status, remark, sku_code, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8,$9,'PENDING','PENDING',$10,$11,NOW())`,
        [
          ret.id,
          it.salesOrderItemId ?? null,
          it.productCode,
          it.productName ?? null,
          it.gradeCode ?? null,
          it.packagingSpec ?? null,
          it.returnedQty,
          it.unitPrice,
          amount,
          it.remark ?? null,
          it.skuCode,   // Phase H5
        ],
      );
    }

    this.logger.log(`[Return] 创建退货单: ${returnNo} (id=${ret.id})`);
    if (ret.sales_order_id && ret.sales_order_no) {
      await this.ds.transaction((mgr) => this.lifecycle.appendEvent(mgr, {
        salesOrderId: String(ret.sales_order_id), orderNo: String(ret.sales_order_no),
        eventType: 'RETURN_CREATED', actorType: 'USER', actorName: operator,
        fromStatus: null, toStatus: 'DRAFT', sourceEndpoint: '/api/v2/sales/returns',
        sourceModule: 'RETURN', sourceRefType: 'RETURN', sourceRefId: String(ret.id),
        sourceRefNo: returnNo, reasonCode: body.reasonCode ?? null, comment: body.remark ?? null,
      }));
    }
    return this.findById(String(ret.id));
  }

  // ── 4. 提交 ─────────────────────────────────────────────────────────────────

  async submit(id: string) {
    const rec = await this.findRaw(id);
    if (rec.status !== 'DRAFT') {
      throw new BadRequestException(`退货单当前状态 ${rec.status}，只有 DRAFT 状态可提交`);
    }

    const amount = Number(rec.subtotal);
    const needApproval = amount >= this.APPROVAL_THRESHOLD;
    const nextStatus   = needApproval ? 'PENDING_APPROVAL' : 'INSPECTING';

    await this.ds.transaction(async (mgr) => {
      await mgr.query(
        `UPDATE sal_return_orders
         SET status=$1, need_approval=$2, requested_at=NOW(), updated_at=NOW()
         WHERE id=$3`,
        [nextStatus, needApproval, id],
      );

      // 触发 Workflow（大额退货）
      if (needApproval) {
        try {
          const wf = await this.approvalEngine.startApproval({
            bizType:     'SALES_RETURN',
            bizId:       id,
            bizNo:       String(rec.return_no),
            amount,
            companyCode: String(rec.company_code),
            companyName: rec.company_name ?? undefined,
            subject:     `退货单审批：${rec.return_no}（金额 ${amount} ${rec.currency_code}）`,
            conditionOverrides: {
              returnType:   rec.return_type,
              customerCode: rec.customer_code,
              reasonCode:   rec.reason_code,
            },
          }, mgr);

          if (wf) {
            await mgr.query(
              `UPDATE sal_return_orders SET wf_instance_id=$1, updated_at=NOW() WHERE id=$2`,
              [String(wf.id), id],
            );
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(`[Return] Workflow 启动失败（不阻断提交）: ${msg}`);
        }
      }
    });

    await this.appendOrderEvent(rec, 'RETURN_SUBMITTED', 'DRAFT', nextStatus, rec.remark);

    this.logger.log(`[Return] 提交退货单: ${rec.return_no} → ${nextStatus}`);
    return this.findById(id);
  }

  // ── 5. 审批通过 ──────────────────────────────────────────────────────────────

  async approve(id: string) {
    const rec = await this.findRaw(id);
    if (rec.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`退货单当前状态 ${rec.status}，无法审批`);
    }
    await this.ds.query(
      `UPDATE sal_return_orders SET status='INSPECTING', updated_at=NOW() WHERE id=$1`,
      [id],
    );
    await this.appendOrderEvent(rec, 'RETURN_APPROVED', 'PENDING_APPROVAL', 'INSPECTING');
    this.logger.log(`[Return] 审批通过: ${rec.return_no} → INSPECTING`);
    return this.findById(id);
  }

  // ── 6. 审批拒绝 ──────────────────────────────────────────────────────────────

  async reject(id: string, reason?: string) {
    const rec = await this.findRaw(id);
    if (rec.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`退货单当前状态 ${rec.status}，无法拒绝`);
    }
    await this.ds.query(
      `UPDATE sal_return_orders
       SET status='REJECTED', remark=COALESCE($1, remark), updated_at=NOW()
       WHERE id=$2`,
      [reason ? `[拒绝原因] ${reason}` : null, id],
    );
    await this.appendOrderEvent(rec, 'RETURN_REJECTED', 'PENDING_APPROVAL', 'REJECTED', reason);
    this.logger.log(`[Return] 审批拒绝: ${rec.return_no} → REJECTED`);
    return this.findById(id);
  }

  // ── 7. 开始质检（确认进入质检流程） ─────────────────────────────────────────

  async startInspection(id: string) {
    const rec = await this.findRaw(id);
    if (rec.status !== 'INSPECTING') {
      throw new BadRequestException(`退货单当前状态 ${rec.status}，不在质检状态`);
    }

    // 幂等：已在 INSPECTING，返回当前详情即可
    await this.appendOrderEvent(rec, 'RETURN_INSPECTION_STARTED', 'INSPECTING', 'INSPECTING');
    this.logger.log(`[Return] 质检进行中: ${rec.return_no}`);
    return this.findById(id);
  }

  // ── 8. 完成质检 ──────────────────────────────────────────────────────────────

  async completeInspection(id: string, inspectionResults: Array<{
    itemId:       string;
    acceptedQty:  number;
    damagedQty:   number;
    remark?:      string;
  }>) {
    const rec = await this.findRaw(id);
    if (rec.status !== 'INSPECTING') {
      throw new BadRequestException(`退货单当前状态 ${rec.status}，不在质检状态`);
    }

    let totalAccepted = 0;
    let newSubtotal   = 0;
    const allItems = await this.ds.query(
      `SELECT * FROM sal_return_items WHERE return_order_id=$1 ORDER BY id`, [id],
    );
    const resultIds = new Set(inspectionResults.map((x) => String(x.itemId)));
    if (allItems.length === 0 || resultIds.size !== allItems.length
      || allItems.some((item: any) => !resultIds.has(String(item.id)))) {
      throw new BadRequestException('质检结果必须且只能覆盖退货单全部明细');
    }
    for (const result of inspectionResults) {
      const item = allItems.find((x: any) => String(x.id) === String(result.itemId));
      if (Number(result.acceptedQty ?? 0) + Number(result.damagedQty ?? 0) !== Number(item.returned_qty)) {
        throw new BadRequestException(`明细 ${result.itemId}：accepted_qty + damaged_qty 必须等于 returned_qty`);
      }
    }
    const nextStatus = inspectionResults.some((x) => Number(x.acceptedQty ?? 0) > 0)
      ? 'RESTOCKING' : 'COMPLETED';

    await this.ds.transaction(async (mgr) => {
      const [locked] = await mgr.query(`SELECT * FROM sal_return_orders WHERE id=$1 FOR UPDATE`, [id]);
      if (!locked || locked.status !== 'INSPECTING') {
        throw new ConflictException('退货单质检状态已变化，请刷新后重试');
      }
      for (const result of inspectionResults) {
      const [item] = await mgr.query(
        `SELECT * FROM sal_return_items WHERE id=$1 AND return_order_id=$2`,
        [result.itemId, id],
      );
      if (!item) throw new NotFoundException(`明细 ${result.itemId} 不存在或不属于本退货单`);

      const acceptedQty = Math.max(0, result.acceptedQty ?? 0);
      const damagedQty  = Math.max(0, result.damagedQty  ?? 0);
      const returnedQty = Number(item.returned_qty);

      if (acceptedQty + damagedQty !== returnedQty) {
        throw new BadRequestException(
          `明细 ${result.itemId}：accepted_qty + damaged_qty 必须等于 returned_qty(${returnedQty})`,
        );
      }

      // 质检结论
      let inspectionResult = 'PENDING';
      if (acceptedQty === returnedQty) {
        inspectionResult = 'ACCEPTED';
      } else if (damagedQty === returnedQty) {
        inspectionResult = 'DAMAGED';
      } else if (acceptedQty === 0 && damagedQty === 0) {
        inspectionResult = 'REJECTED';
      } else {
        inspectionResult = 'PARTIAL';
      }

      const itemAmount = acceptedQty * Number(item.unit_price);
      totalAccepted += acceptedQty;
      newSubtotal   += itemAmount;

      await mgr.query(
        `UPDATE sal_return_items
         SET accepted_qty=$1, damaged_qty=$2, amount=$3,
             inspection_result=$4, remark=COALESCE($5, remark)
         WHERE id=$6`,
        [acceptedQty, damagedQty, itemAmount, inspectionResult, result.remark ?? null, result.itemId],
      );
      }

    await mgr.query(
      `UPDATE sal_return_orders
       SET status=$1, subtotal=$2, inspected_at=NOW(), updated_at=NOW()
       WHERE id=$3`,
      [nextStatus, newSubtotal, id],
    );
      await this.appendOrderEvent(locked, 'RETURN_INSPECTION_COMPLETED', 'INSPECTING', nextStatus,
        inspectionResults.map((x) => x.remark).filter(Boolean).join('；') || null,
        { acceptedQty: totalAccepted, resultCount: inspectionResults.length }, mgr);
      if (nextStatus === 'COMPLETED') {
        await this.completeFinal(id, { ...locked, subtotal: newSubtotal }, mgr);
      }
    });

    this.logger.log(`[Return] 质检完成: ${rec.return_no} → ${nextStatus} (accepted=${totalAccepted})`);
    return this.findById(id);
  }

  // ── 9. 完成回库 ──────────────────────────────────────────────────────────────

  async completeRestock(id: string, target: {
    targetWarehouseCode: string; targetZoneCode: string; targetLocationCode: string;
  }) {
    // Establish ownership before the transaction locks and mutates the row.
    await this.findRaw(id);
    await this.ds.transaction(async (mgr) => {
      const [rec] = await mgr.query(`SELECT * FROM sal_return_orders WHERE id=$1 FOR UPDATE`, [id]);
      if (!rec) throw new NotFoundException(`退货单 ${id} 不存在`);
      if (rec.status !== 'RESTOCKING' || rec.restocked_at) {
        throw new ConflictException(`退货单当前状态 ${rec.status}，不可重复回库`);
      }
      if (!target.targetWarehouseCode || !target.targetZoneCode || !target.targetLocationCode) {
        throw new BadRequestException('回库仓、隔离库区、隔离货位均为必填');
      }
      await this.assertRestockTarget(
        String(rec.company_code), target.targetWarehouseCode, target.targetZoneCode,
        target.targetLocationCode, mgr,
      );
      await mgr.query(
        `UPDATE sal_return_orders SET target_warehouse_code=$1,target_zone_code=$2,target_location_code=$3,updated_at=NOW() WHERE id=$4`,
        [target.targetWarehouseCode, target.targetZoneCode, target.targetLocationCode, id],
      );
      await this.eggInventory.processReturnInventory(
        id, String(rec.return_no), String(rec.company_code ?? 'ALL'),
        target.targetWarehouseCode, target.targetZoneCode, target.targetLocationCode,
        new Date().toISOString().slice(0, 10), mgr,
      );
      await mgr.query(`UPDATE sal_return_orders SET restocked_at=NOW(),updated_at=NOW() WHERE id=$1`, [id]);
      await this.appendOrderEvent(rec, 'RETURN_RESTOCKED', 'RESTOCKING', 'RESTOCKING', null,
        { ...target }, mgr);
      await this.completeFinal(id, rec, mgr);
    });

    const rec = await this.findRaw(id);
    this.logger.log(`[Return] 回库完成: ${rec.return_no} → COMPLETED`);
    return this.findById(id);
  }

  // ── 10. 完成（内部公共方法：生成 Credit Note + 写 COMPLETED） ──────────────

  async complete(id: string) {
    const rec = await this.findRaw(id);
    this.assertNotCompleted(rec.status, 'complete');
    throw new ForbiddenException(`退货单状态 ${rec.status} 不可跨越质检/回库直接完成`);
  }

  // ── 内部：生成 Credit Note + 最终 COMPLETED ─────────────────────────────────

  private async completeFinal(id: string, rec: Record<string, unknown>, mgr: EntityManager) {
    const subtotal  = Number(rec.subtotal ?? 0);
    const operator  = this.currentUser;
    let creditNoteId: string | null = null;

    // 退货金额 > 0 才生成 Credit Note（全部破损则 subtotal=0 跳过）
    if (subtotal > 0) {
        creditNoteId = await this.creditNoteAdapter.createCreditNote({
          returnId:     String(rec.id),
          returnNo:     String(rec.return_no),
          companyCode:  String(rec.company_code),
          companyName:  rec.company_name as string | undefined,
          customerCode: rec.customer_code as string | undefined,
          customerName: (rec.customer_name ?? '未知客户') as string,
          currencyCode: (rec.currency_code ?? 'LAK') as string,
          returnAmount: subtotal,
          createdBy:    operator,
        }, mgr);
    }

    await mgr.query(
      `UPDATE sal_return_orders
       SET status='COMPLETED', credit_note_id=$1, completed_at=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [creditNoteId, id],
    );
    await this.appendOrderEvent(rec, 'RETURN_COMPLETED', String(rec.status), 'COMPLETED', null,
      { creditNoteId }, mgr);
  }

  // ── 11. 取消 ─────────────────────────────────────────────────────────────────

  async cancel(id: string, reason?: string) {
    const rec = await this.findRaw(id);
    this.assertNotCompleted(rec.status, 'cancel');
    if (rec.status === 'RESTOCKING') {
      throw new ForbiddenException('退货单已进入回库阶段，无法取消');
    }
    await this.ds.query(
      `UPDATE sal_return_orders
       SET status='CANCELLED', remark=COALESCE($1, remark), updated_at=NOW()
       WHERE id=$2`,
      [reason ? `[取消原因] ${reason}` : null, id],
    );
    return this.findById(id);
  }

  // ── 12. 统计（供 Dashboard 使用） ────────────────────────────────────────────

  async getDashboardStats(companyCode?: string) {
    const conds: string[] = [];
    const params: unknown[] = [];
    this.appendCompanyScope(conds, params, 'r', companyCode);
    const cond = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [row] = await this.ds.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)                        AS today_total,
        COUNT(*) FILTER (WHERE status = 'INSPECTING')                             AS pending_inspection,
        COUNT(*) FILTER (WHERE status = 'RESTOCKING')                             AS pending_restock,
        COALESCE(SUM(subtotal) FILTER (WHERE status = 'COMPLETED'
                               AND completed_at >= CURRENT_DATE), 0)              AS today_credit_note_amount,
        COUNT(*) FILTER (WHERE status IN ('DRAFT','SUBMITTED','PENDING_APPROVAL')) AS pending_approval
      FROM sal_return_orders r ${cond}
    `, params);
    return {
      todayTotal:           Number(row.today_total),
      pendingInspection:    Number(row.pending_inspection),
      pendingRestock:       Number(row.pending_restock),
      todayCreditNoteAmount:Number(row.today_credit_note_amount),
      pendingApproval:      Number(row.pending_approval),
    };
  }

  // ── 13. 异常分析（供 Reports 使用） ──────────────────────────────────────────

  async getReturnAnalysis(companyCode?: string) {
    const scopeConds: string[] = [];
    const scopeParams: unknown[] = [];
    this.appendCompanyScope(scopeConds, scopeParams, 'r', companyCode);
    const cond = scopeConds.length ? `AND ${scopeConds.join(' AND ')}` : '';

    const topCustomers = await this.ds.query(`
      SELECT customer_code, MAX(customer_name) AS customer_name,
             COUNT(*) AS return_count,
             COALESCE(SUM(subtotal),0) AS total_amount
      FROM sal_return_orders r
      WHERE r.status = 'COMPLETED' ${cond}
      GROUP BY customer_code
      ORDER BY return_count DESC
      LIMIT 10
    `, scopeParams);

    const topProducts = await this.ds.query(`
      SELECT i.product_code, MAX(i.product_name) AS product_name,
             COUNT(*) AS return_count,
             COALESCE(SUM(i.returned_qty),0) AS total_qty,
             COALESCE(SUM(i.damaged_qty),0) AS damaged_qty
      FROM sal_return_items i
      JOIN sal_return_orders r ON r.id = i.return_order_id
      WHERE r.status = 'COMPLETED' ${cond}
      GROUP BY i.product_code
      ORDER BY return_count DESC
      LIMIT 10
    `, scopeParams);

    const [stats] = await this.ds.query(`
      SELECT
        COUNT(*) AS total_returns,
        COALESCE(SUM(subtotal),0) AS total_amount,
        COUNT(*) FILTER (WHERE return_type = 'DELIVERY_REJECT') AS delivery_reject_count,
        COUNT(*) FILTER (WHERE return_type = 'DAMAGE_RETURN')   AS damage_count,
        COALESCE(
          SUM(
            (SELECT COALESCE(SUM(damaged_qty),0) FROM sal_return_items WHERE return_order_id = r.id)
          ),0
        ) AS total_damaged_qty,
        COALESCE(
          SUM(
            (SELECT COALESCE(SUM(returned_qty),0) FROM sal_return_items WHERE return_order_id = r.id)
          ),0
        ) AS total_returned_qty
      FROM sal_return_orders r
      WHERE r.status = 'COMPLETED' ${cond}
        AND completed_at >= NOW() - INTERVAL '30 days'
    `, scopeParams);

    const damageRate = Number(stats.total_returned_qty) > 0
      ? ((Number(stats.total_damaged_qty) / Number(stats.total_returned_qty)) * 100).toFixed(1)
      : '0.0';

    return {
      topCustomers,
      topProducts,
      summary: {
        totalReturns:         Number(stats.total_returns),
        totalAmount:          Number(stats.total_amount),
        deliveryRejectCount:  Number(stats.delivery_reject_count),
        damageCount:          Number(stats.damage_count),
        damageRate:           `${damageRate}%`,
      },
    };
  }
}
