import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import { PriceRuntimeService } from './price-runtime.service';
import { CustomersService } from './customers.service';
import { FinanceArAdapter } from '../adapters/finance-ar.adapter';
import {
  CreateSalesOrderDto, UpdateSalesOrderDto, QuerySalesOrderDto,
  SubmitSalesOrderDto, CancelSalesOrderDto, TransitionSalesOrderDto,
} from '../dto/sales-order.dto';

// ── 状态机白名单 ──────────────────────────────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<string, string> = {
  APPROVED:   'ALLOCATED',
  ALLOCATED:  'PICKED',
  PICKED:     'LOADED',
  LOADED:     'SHIPPED',
  SHIPPED:    'DELIVERED',
  DELIVERED:  'RECEIVED',
  RECEIVED:   'RECONCILED',
};

const TERMINAL_STATUSES = new Set(['RECONCILED', 'CANCELLED', 'REJECTED']);

// ── 不可取消的状态（已发货后不可取消）────────────────────────────────────────
const NO_CANCEL_STATUSES = new Set(['SHIPPED', 'DELIVERED', 'RECEIVED', 'RECONCILED', 'CANCELLED']);

@Injectable()
export class SalesOrdersService {
  private readonly logger = new Logger(SalesOrdersService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly priceRuntime: PriceRuntimeService,
    private readonly customersService: CustomersService,
    private readonly financeAr: FinanceArAdapter,
  ) {}

  // ── 当前用户 ──────────────────────────────────────────────────────────────

  private currentUser() {
    const u = this.cls.get('user') as any;
    return {
      userId:       String(u?.userId ?? u?.id ?? '0'),
      userName:     String(u?.name ?? u?.username ?? ''),
      roles:        (u?.roles ?? (u?.role ? [u.role] : [])) as string[],
      companyCodes: (u?.companyCodes ?? []) as string[],
      scopeAll:     !!(u?.scopeAll),
    };
  }

  // ── DataScope 断言 ────────────────────────────────────────────────────────

  private async assertOwnership(id: string): Promise<any> {
    const rows = await this.ds.query(
      `SELECT * FROM sal_sales_orders WHERE id = $1`, [id],
    );
    if (!rows?.length) throw new NotFoundException(`销售订单 ${id} 不存在`);
    const rec = rows[0];
    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length > 0 && !user.companyCodes.includes(rec.company_code)) {
      throw new ForbiddenException(`无权访问公司 ${rec.company_code} 的订单`);
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

  // ── 1. 列表 ───────────────────────────────────────────────────────────────

  async listOrders(q: QuerySalesOrderDto) {
    const user   = this.currentUser();
    const page   = Math.max(1, q.page ?? 1);
    const limit  = Math.min(200, Math.max(1, q.limit ?? 20));
    const offset = (page - 1) * limit;

    const params: any[] = [];
    const where: string[] = ['1=1'];

    // DataScope
    if (!user.scopeAll && user.companyCodes.length > 0) {
      params.push(user.companyCodes); where.push(`company_code = ANY($${params.length})`);
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
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    return { data: rows, total: Number(countRow[0].total), page, limit };
  }

  // ── 2. 详情 ───────────────────────────────────────────────────────────────

  async findById(id: string) {
    const rec = await this.assertOwnership(id);
    const items = await this.ds.query(
      `SELECT * FROM sal_order_items WHERE sales_order_id = $1 ORDER BY id ASC`,
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
    return { ...rec, items, arInvoice };
  }

  // ── 3. 创建草稿 ───────────────────────────────────────────────────────────

  async createDraft(dto: CreateSalesOrderDto) {
    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length > 0 && !user.companyCodes.includes(dto.companyCode)) {
      throw new ForbiddenException(`无权在公司 ${dto.companyCode} 下创建订单`);
    }
    if (!dto.items?.length) {
      throw new BadRequestException('订单必须包含至少一条明细');
    }

    // 读取客户信息
    let customer: any = null;
    let channelCode = dto.channelCode ?? null;
    if (dto.customerCode) {
      const cRows = await this.ds.query(
        `SELECT * FROM sal_customers WHERE customer_code = $1 AND company_code = $2 LIMIT 1`,
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
    }> = [];

    let anyBelowFloor = false;

    for (const item of dto.items) {
      let resolved: any = {
        unitPrice: 0, floorPrice: null, ceilingPrice: null,
        priceBookId: null, priceBookNo: null,
      };

      try {
        resolved = await this.priceRuntime.resolvePrice({
          companyCode:    dto.companyCode,
          productCode:    item.productCode,
          gradeCode:      item.gradeCode,
          packagingSpec:  item.packagingSpec,
          qty:            item.qty,
          customerCode:   dto.customerCode ?? undefined,
          channelCode:    channelCode ?? undefined,
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
        productCode:      item.productCode,
        productName:      item.productName ?? null,
        gradeCode:        item.gradeCode ?? null,
        packagingSpec:    item.packagingSpec ?? null,
        qty:              Number(item.qty),
        resolvedUnitPrice,
        actualUnitPrice,
        floorPrice,
        ceilingPrice,
        belowFloor,
        priceBookId:      resolved.priceBookId ? String(resolved.priceBookId) : null,
        priceBookNo:      resolved.priceBookNo ?? null,
        amount,
      });
    }

    const subtotal     = resolvedItems.reduce((s, i) => s + i.amount, 0);
    const totalAmount  = Math.round((subtotal - 0) * 100) / 100; // discount=0
    const orderNo      = await this.genOrderNo();
    const currencyCode = dto.currencyCode ?? 'LAK';

    // 主表
    const orderResult = await this.ds.query(
      `INSERT INTO sal_sales_orders (
         order_no, customer_id, customer_code, customer_name,
         company_code, company_name, channel_code,
         price_book_id, price_book_no, currency_code,
         subtotal, discount, total_amount,
         status, need_price_approval, need_credit_approval,
         over_credit, below_floor_price,
         expected_delivery_date, delivery_address, remark, created_by
       ) VALUES (
         $1,$2,$3,$4,
         $5,$6,$7,
         $8,$9,$10,
         $11,0,$12,
         'DRAFT',FALSE,FALSE,
         FALSE,$13,
         $14,$15,$16,$17
       ) RETURNING *`,
      [
        orderNo,
        customer ? String(customer.id) : null,
        dto.customerCode ?? null,
        customer?.customer_name ?? null,
        dto.companyCode, dto.companyName ?? null,
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
      await this.ds.query(
        `INSERT INTO sal_order_items (
           sales_order_id, product_code, product_name,
           grade_code, packaging_spec, qty,
           resolved_unit_price, actual_unit_price, unit_price,
           floor_price, ceiling_price, amount,
           price_book_id, price_book_no, below_floor_price
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          String(order.id),
          item.productCode, item.productName,
          item.gradeCode, item.packagingSpec, item.qty,
          item.resolvedUnitPrice, item.actualUnitPrice, item.actualUnitPrice,
          item.floorPrice, item.ceilingPrice, item.amount,
          item.priceBookId, item.priceBookNo, item.belowFloor,
        ],
      );
    }

    const items = await this.ds.query(
      `SELECT * FROM sal_order_items WHERE sales_order_id = $1 ORDER BY id ASC`,
      [String(order.id)],
    );
    return { ...order, items };
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
        let resolved: any = { unitPrice: 0, floorPrice: null, ceilingPrice: null, priceBookId: null, priceBookNo: null };
        try {
          resolved = await this.priceRuntime.resolvePrice({
            companyCode, productCode: item.productCode,
            gradeCode: item.gradeCode ?? undefined,
            packagingSpec: item.packagingSpec ?? undefined,
            qty: item.qty,
            customerCode: dto.customerCode ?? rec.customer_code ?? undefined,
            channelCode: channelCode ?? undefined,
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
          productCode: item.productCode, productName: item.productName ?? null,
          gradeCode: item.gradeCode ?? null, packagingSpec: item.packagingSpec ?? null,
          qty: Number(item.qty), resolvedUnitPrice, actualUnitPrice, floorPrice, ceilingPrice,
          belowFloor, priceBookId: resolved.priceBookId ? String(resolved.priceBookId) : null,
          priceBookNo: resolved.priceBookNo ?? null, amount,
        });
      }

      const subtotal    = resolvedItems.reduce((s, i) => s + i.amount, 0);
      const totalAmount = Math.round(subtotal * 100) / 100;

      for (const item of resolvedItems) {
        await this.ds.query(
          `INSERT INTO sal_order_items (
             sales_order_id, product_code, product_name,
             grade_code, packaging_spec, qty,
             resolved_unit_price, actual_unit_price, unit_price,
             floor_price, ceiling_price, amount,
             price_book_id, price_book_no, below_floor_price
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            id,
            item.productCode, item.productName, item.gradeCode, item.packagingSpec, item.qty,
            item.resolvedUnitPrice, item.actualUnitPrice, item.actualUnitPrice,
            item.floorPrice, item.ceilingPrice, item.amount,
            item.priceBookId, item.priceBookNo, item.belowFloor,
          ],
        );
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

  // ── 5. 提交审批 ───────────────────────────────────────────────────────────

  async submit(id: string, _dto: SubmitSalesOrderDto) {
    const rec = await this.assertOwnership(id);
    if (rec.status !== 'DRAFT') {
      throw new BadRequestException(`仅 DRAFT 状态可提交，当前：${rec.status}`);
    }

    // 安全校验：客户状态
    if (rec.customer_code) {
      const cRows = await this.ds.query(
        `SELECT status, credit_limit, credit_used FROM sal_customers
         WHERE customer_code = $1 AND company_code = $2 LIMIT 1`,
        [rec.customer_code, rec.company_code],
      );
      if (cRows.length) {
        const cust = cRows[0];
        if (cust.status === 'BLACKLIST') {
          throw new ForbiddenException('客户已列入黑名单，禁止下单');
        }
        if (cust.status === 'FROZEN') {
          throw new ForbiddenException('客户账户已冻结，禁止下单');
        }
      }
    }

    // 信用额度检查
    let overCredit         = false;
    let needCreditApproval = false;
    if (rec.customer_code) {
      try {
        const snapshot = await this.customersService.getCreditSnapshotByCode(
          rec.customer_code, rec.company_code,
        );
        if (snapshot && Number(snapshot.creditAvailable) < Number(rec.total_amount)) {
          overCredit         = true;
          needCreditApproval = true;
        }
      } catch { /* 无法获取信用快照时不阻断，仅记录 */ }
    }

    const belowFloor       = !!rec.below_floor_price;
    const needPriceApproval = belowFloor;
    const needApproval      = needPriceApproval || needCreditApproval;

    let finalRec: any = null;

    await this.ds.transaction(async (mgr) => {
      // 先更新审批标记
      await mgr.query(
        `UPDATE sal_sales_orders
         SET over_credit=$1, need_price_approval=$2, need_credit_approval=$3, updated_at=NOW()
         WHERE id=$4`,
        [overCredit, needPriceApproval, needCreditApproval, id],
      );

      if (needApproval) {
        const wf = await this.approvalEngine.startApproval({
          bizType:     'SALES_ORDER',
          bizId:       id,
          bizNo:       rec.order_no,
          amount:      Number(rec.total_amount),
          companyCode: rec.company_code,
          companyName: rec.company_name ?? undefined,
          subject:     `销售订单审批：${rec.order_no}`,
          conditionOverrides: {
            customerCode:    rec.customer_code,
            customerName:    rec.customer_name,
            channelCode:     rec.channel_code,
            belowFloorPrice: belowFloor,
            overCredit,
          },
        }, mgr);

        if (!wf) {
          // 无审批规则 → 自动批准
          const rows = await mgr.query(
            `UPDATE sal_sales_orders SET status='APPROVED', updated_at=NOW() WHERE id=$1 RETURNING *`,
            [id],
          );
          finalRec = { ...rows[0], _note: '无审批规则，已自动批准' };
        } else {
          const rows = await mgr.query(
            `UPDATE sal_sales_orders
             SET status='PENDING_APPROVAL', wf_instance_id=$1, updated_at=NOW()
             WHERE id=$2 RETURNING *`,
            [String(wf.id), id],
          );
          finalRec = rows[0];
        }
      } else {
        // 无需审批 → 直接 APPROVED
        const rows = await mgr.query(
          `UPDATE sal_sales_orders SET status='APPROVED', updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id],
        );
        finalRec = { ...rows[0], _note: '无审批要求，已自动批准' };
      }
    });

    return finalRec;
  }

  // ── 6. 审批通过回调（WorkflowBizRegistry onApproved）────────────────────

  async approveCallback(bizId: string, mgr: EntityManager): Promise<void> {
    await mgr.query(
      `UPDATE sal_sales_orders SET status='APPROVED', updated_at=NOW() WHERE id=$1`,
      [bizId],
    );
    this.logger.log(`[SalesOrder] 审批通过: orderId=${bizId} → APPROVED`);
  }

  // ── 7. 审批拒绝回调（WorkflowBizRegistry onRejected）────────────────────

  async rejectCallback(bizId: string, mgr: EntityManager): Promise<void> {
    await mgr.query(
      `UPDATE sal_sales_orders SET status='REJECTED', updated_at=NOW() WHERE id=$1`,
      [bizId],
    );
    this.logger.log(`[SalesOrder] 审批拒绝: orderId=${bizId} → REJECTED`);
  }

  // ── 8. 取消 ───────────────────────────────────────────────────────────────

  async cancel(id: string, _dto: CancelSalesOrderDto) {
    const rec = await this.assertOwnership(id);
    if (NO_CANCEL_STATUSES.has(rec.status)) {
      throw new BadRequestException(`状态 ${rec.status} 的订单不可取消（已发货后禁止取消）`);
    }
    if (rec.status === 'CANCELLED') return rec;
    const result = await this.ds.query(
      `UPDATE sal_sales_orders SET status='CANCELLED', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id],
    );
    return result[0];
  }

  // ── 9. 状态流转（白名单控制）──────────────────────────────────────────────

  async transition(id: string, dto: TransitionSalesOrderDto) {
    const rec    = await this.assertOwnership(id);
    const target = dto.targetStatus;

    if (TERMINAL_STATUSES.has(rec.status)) {
      throw new BadRequestException(`订单已处于终态 ${rec.status}，不可流转`);
    }

    const allowed = ALLOWED_TRANSITIONS[rec.status];
    if (!allowed || allowed !== target) {
      throw new BadRequestException(
        `不允许从 ${rec.status} 流转到 ${target}，合法下一步：${allowed ?? '无'}`,
      );
    }

    const sets: string[] = ['status=$1', 'updated_at=NOW()'];
    const params: any[]  = [target];

    if (target === 'DELIVERED') {
      sets.push(`delivered_at=NOW()`);
    }

    params.push(id);
    const result = await this.ds.query(
      `UPDATE sal_sales_orders SET ${sets.join(',')} WHERE id=$${params.length} RETURNING *`,
      params,
    );
    return result[0];
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

    // 更新状态 → RECEIVED
    await this.ds.query(
      `UPDATE sal_sales_orders SET status='RECEIVED', received_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [id],
    );

    // 获取客户 payment_terms
    let paymentTermsDays = 30;
    if (rec.customer_code) {
      const cRows = await this.ds.query(
        `SELECT payment_terms FROM sal_customers WHERE customer_code=$1 AND company_code=$2 LIMIT 1`,
        [rec.customer_code, rec.company_code],
      );
      if (cRows.length && cRows[0].payment_terms) {
        paymentTermsDays = Number(cRows[0].payment_terms) || 30;
      }
    }

    // 创建 AR Invoice（Finance V2 AR Runtime，严禁写 fin_transactions）
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
      createdBy:       user.userName || user.userId,
    });

    // 回写 ar_invoice_id
    await this.ds.query(
      `UPDATE sal_sales_orders SET ar_invoice_id=$1, updated_at=NOW() WHERE id=$2`,
      [arId, id],
    );

    const updated = await this.ds.query(
      `SELECT * FROM sal_sales_orders WHERE id=$1`, [id],
    );
    return updated[0];
  }

  // ── 11. Dashboard 统计 ────────────────────────────────────────────────────

  async getDashboardStats(companyCode?: string) {
    const user = this.currentUser();
    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (!user.scopeAll && user.companyCodes.length > 0) {
      params.push(user.companyCodes); where.push(`company_code = ANY($${params.length})`);
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
