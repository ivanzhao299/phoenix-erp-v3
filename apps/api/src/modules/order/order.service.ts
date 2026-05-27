import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { WmsService } from '../wms/wms.service';
import { SalesEngineService } from './sales-engine.service';

/**
 * V3 OrderService — 订单中心业务服务（深度修复版）
 *
 * 审计修复（Batch A）：
 *   A1: approval 通过后调 WmsService.advanceOutboundOrder 触发 wms allocated 链路
 *   A2: transitionOrder 加状态机白名单 + 大小写统一 (兼容历史 lowercase)
 *   A3: submitOrder 加客户信用额度校验 (credit_limit - credit_used vs total_amount)
 *
 * 兼容：
 *   - status 内部统一 UPPER + lowercase historical aliases ('approved'->'APPROVED')
 *   - DB 旧数据 small-case 仍可读
 */

// 状态机：DRAFT → APPROVED → ALLOCATED → PICKED → LOADED → SHIPPED → DELIVERED / RECEIVED
//        DRAFT → REJECTED / CANCELLED
// 任意状态可走 CANCELLED（管理员特权流程）
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT:     ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED:  ['ALLOCATED', 'CANCELLED'],
  ALLOCATED: ['PICKED', 'CANCELLED'],
  PICKED:    ['LOADED', 'CANCELLED'],
  LOADED:    ['SHIPPED', 'CANCELLED'],
  SHIPPED:   ['DELIVERED', 'RECEIVED', 'PARTIAL_SHIPPED'],
  PARTIAL_SHIPPED: ['SHIPPED', 'DELIVERED', 'CANCELLED'],
  DELIVERED: ['RECEIVED', 'RECONCILED'],
  RECEIVED:  ['RECONCILED'],
  RECONCILED: [],
  REJECTED:  [],
  CANCELLED: [],
};

const norm = (s: string) => String(s || '').toUpperCase();

@Injectable()
export class OrderService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    @Inject(forwardRef(() => WmsService))
    private readonly wmsService: WmsService,
    private readonly salesEngine: SalesEngineService,
  ) {}

  /**
   * V3 submitOrder — 三大校验：明细非空 / 低价审批 / 信用额度
   */
  async submitOrder(orderData: any, user: any) {
    const lines = orderData.lines || [];
    if (lines.length === 0) throw new BadRequestException('订单明细不能为空');

    // V2 fidelity: SalesEngine 三大校验 (ownership + region + price_book retail_band)
    // PRD 8.4.1/8.4.2/8.4.3 — V2 port from _archive/.../services/salesEngine.js
    const engineResult = await this.salesEngine.validateOrder(
      {
        customer_code: orderData.customer_code,
        price_book_id: orderData.price_book_id,
        seller_subject_id: orderData.seller_subject_id || user?.subject_id,
      },
      lines,
    );
    if (engineResult.passed === false) {
      const errMsg = engineResult.errors.join('; ');
      if (engineResult.type === 'OWNERSHIP') throw new ForbiddenException(errMsg);
      if (engineResult.type === 'REGION')    throw new ForbiddenException(errMsg);
      // PRICE_APPROVAL_REQUIRED 不阻断，转特价审批；PRICE 硬失败阻断
      if (engineResult.type === 'PRICE')     throw new BadRequestException(errMsg);
    }

    let subtotal = 0;
    for (const line of lines) {
      subtotal += (line.qty || 0) * (line.unit_price || 0);
    }
    const discount = Math.max(0, Number(orderData.discount) || 0);
    const totalAmount = Math.max(0, subtotal - discount);

    // V2 fidelity: needPriceApproval 由 SalesEngine 派生（含 retail_lower 拦截），不再仅信前端的 below_floor_price
    const enginePriceApprove = engineResult.passed === false && engineResult.type === 'PRICE_APPROVAL_REQUIRED';
    const needPriceApproval = (enginePriceApprove ||
      lines.some((l: any) => l.below_floor_price || l.retail_band_status === 'BELOW_LOWER'))
        ? 1 : 0;

    // A3: 信用额度校验 — 取 ord_customers.credit_limit - credit_used
    let needCreditApproval = 0;
    if (orderData.customer_code) {
      const custRows = await this.entityManager.query(
        `SELECT credit_limit, credit_used FROM ord_customers WHERE customer_code = $1 LIMIT 1`,
        [orderData.customer_code],
      ).catch(() => []);
      if (custRows.length > 0) {
        const limit = Number(custRows[0].credit_limit) || 0;
        const used  = Number(custRows[0].credit_used)  || 0;
        const available = limit - used;
        if (totalAmount > available) {
          needCreditApproval = 1;
        }
      }
    }

    const orderNo = `ODR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;
    const status = (needPriceApproval || needCreditApproval) ? 'DRAFT' : 'APPROVED';

    await this.entityManager.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO "ord_orders"
         ("order_no", "customer_code", "customer_name", "sales_rep", "order_type", "order_source",
          "status", "subtotal", "discount", "total_amount",
          "need_price_approval", "need_credit_approval", "is_urgent",
          "delivery_addr", "expected_date", "remark", "created_by", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          orderNo, orderData.customer_code, orderData.customer_name || '', user?.username || 'SYS',
          orderData.order_type || 'normal', orderData.order_source || 'sales_rep',
          status, subtotal, discount, totalAmount,
          needPriceApproval, needCreditApproval, orderData.is_urgent ? 1 : 0,
          orderData.delivery_addr || '', orderData.expected_date || null, orderData.remark || '',
          user?.username || 'SYS',
        ],
      );

      for (const item of lines) {
        await manager.query(
          `INSERT INTO "ord_order_items"
           ("order_no", "product_code", "product_name_zh", "qty", "unit", "unit_price", "subtotal", "batch_no")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            orderNo, item.product_code, item.product_name_zh || '',
            item.qty, item.unit || '件', item.unit_price || 0,
            (item.qty || 0) * (item.unit_price || 0), item.batch_no || null,
          ],
        );
      }

      await manager.query(
        `INSERT INTO "ord_approval_log" ("order_no", "action", "operator", "remark", "created_at")
         VALUES ($1, 'CREATE', $2, $3, CURRENT_TIMESTAMP)`,
        [orderNo, user?.username || 'SYS', `创建订单，小计 ${subtotal}`],
      );

      // 信用预占（仅当不需审批即 APPROVED 时直接占）
      if (status === 'APPROVED' && orderData.customer_code && totalAmount > 0) {
        await this.reserveCredit(manager, orderNo, orderData.customer_code, totalAmount);
      }
    });

    return {
      code: 200,
      order_no: orderNo,
      msg: (needCreditApproval || needPriceApproval)
        ? `订单已提交，需要特殊审批${needCreditApproval ? '(信用超限)' : ''}${needPriceApproval ? '(低于底价)' : ''}`
        : '订单已提交并自动通过审批',
      need_approval: !!(needCreditApproval || needPriceApproval),
      need_credit_approval: !!needCreditApproval,
      need_price_approval: !!needPriceApproval,
    };
  }

  /**
   * 信用额度预占 — 写 ord_credit_usage + 累加 ord_customers.credit_used
   */
  private async reserveCredit(manager: EntityManager, orderNo: string, customerCode: string, amount: number) {
    await manager.query(
      `INSERT INTO ord_credit_usage (customer_code, order_no, action, amount, created_at)
       VALUES ($1, $2, 'RESERVED', $3, CURRENT_TIMESTAMP)`,
      [customerCode, orderNo, amount],
    ).catch((e: any) => console.warn('[reserveCredit][WARN]', e?.message));
    await manager.query(
      `UPDATE ord_customers SET credit_used = COALESCE(credit_used, 0) + $1::numeric WHERE customer_code = $2`,
      [amount, customerCode],
    );
  }

  /**
   * 信用额度释放 — 取消/拒绝时调用
   */
  private async releaseCredit(manager: EntityManager, orderNo: string, customerCode: string, amount: number) {
    await manager.query(
      `INSERT INTO ord_credit_usage (customer_code, order_no, action, amount, created_at)
       VALUES ($1, $2, 'RELEASED', $3, CURRENT_TIMESTAMP)`,
      [customerCode, orderNo, amount],
    ).catch((e: any) => console.warn('[releaseCredit][WARN]', e?.message));
    await manager.query(
      `UPDATE ord_customers SET credit_used = GREATEST(0, COALESCE(credit_used, 0) - $1::numeric) WHERE customer_code = $2`,
      [amount, customerCode],
    );
  }

  /**
   * V3 transitionOrder — 状态机白名单校验 + 大小写统一 + 联动下游
   */
  async transitionOrder(orderNo: string, actionOrToStatus: string, remark: string, user: any) {
    // 兼容旧 action ('approve'/'reject') 映射到目标状态
    let toStatus = norm(actionOrToStatus);
    if (toStatus === 'APPROVE') toStatus = 'APPROVED';
    if (toStatus === 'REJECT')  toStatus = 'REJECTED';
    if (toStatus === 'CANCEL')  toStatus = 'CANCELLED';

    const orders = await this.entityManager.query('SELECT * FROM "ord_orders" WHERE "order_no" = $1', [orderNo]);
    if (!orders || orders.length === 0) throw new NotFoundException('订单不存在');
    const order = orders[0];
    const fromStatus = norm(order.status);

    // A2: 状态机白名单
    const allowed = VALID_TRANSITIONS[fromStatus] || [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(`订单 ${orderNo} 当前状态 ${fromStatus} 不能流转到 ${toStatus}（允许：${allowed.join(',') || '无'}）`);
    }

    await this.entityManager.transaction(async (manager) => {
      const updates: any[] = [toStatus, orderNo];
      let sql = `UPDATE "ord_orders" SET "status" = $1, "updated_at" = CURRENT_TIMESTAMP`;

      if (toStatus === 'SHIPPED' || toStatus === 'PARTIAL_SHIPPED') sql += `, "shipped_date" = CURRENT_DATE`;
      if (toStatus === 'RECEIVED') sql += `, "received_date" = CURRENT_DATE`;
      if (toStatus === 'REJECTED' || toStatus === 'CANCELLED') {
        sql += `, "cancel_reason" = $3`;
        updates.push(remark || '');
      }
      sql += ` WHERE "order_no" = $2`;
      await manager.query(sql, updates);

      await manager.query(
        `INSERT INTO "ord_approval_log" ("order_no", "action", "operator", "remark", "created_at")
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [orderNo, toStatus, user?.username || 'SYS', remark || ''],
      );

      // 信用额度回滚（REJECTED/CANCELLED）
      if ((toStatus === 'REJECTED' || toStatus === 'CANCELLED') && order.customer_code) {
        await this.releaseCredit(manager, orderNo, order.customer_code, Number(order.total_amount) || 0);
      }
      // 信用额度占用（DRAFT → APPROVED 路径，submitOrder 已占的不重复）
      if (fromStatus === 'DRAFT' && toStatus === 'APPROVED' && order.customer_code) {
        await this.reserveCredit(manager, orderNo, order.customer_code, Number(order.total_amount) || 0);
      }

      // 财务联动
      // TODO [Sales V2 Phase 3]: 切换至 Finance V2 fin_ar_invoices（AR Runtime）
      //   · RECEIVED → 调用 FinArInvoicesService.create() 生成 fin_ar_invoices
      //   · RECONCILED → 核销 fin_ar_invoices（status=RECEIVED）
      //   · 禁止继续向 fin_transactions 写 AR 数据（该表已废弃）
      //   · 参考：docs/sales-v2-architecture.md § Finance V2 AR 集成路线
      if (toStatus === 'RECEIVED') {
        await manager.query(
          `INSERT INTO "fin_transactions" ("account_code", "type", "amount", "ref_no", "note", "created_at")
           VALUES ('AR-TRADE', 'DEBIT', $1, $2, $3, CURRENT_TIMESTAMP)`,
          [order.total_amount, orderNo, `订单 ${orderNo} 已签收，应收 ${order.customer_name || order.customer_code} ${order.total_amount}`],
        ).catch((e: any) => console.warn('[transitionOrder][WARN] fin_transactions failed:', e?.message));
      }
      if (toStatus === 'RECONCILED') {
        await manager.query(
          `INSERT INTO "fin_transactions" ("account_code", "type", "amount", "ref_no", "note", "created_at")
           VALUES ('AR-TRADE', 'CREDIT', $1, $2, $3, CURRENT_TIMESTAMP)`,
          [order.total_amount, orderNo, `订单 ${orderNo} 已对账结清`],
        ).catch((e: any) => console.warn('[transitionOrder][WARN] fin_transactions failed:', e?.message));
      }
    });

    // A1: APPROVED 时联动 WMS — 推进出库单到 allocated 阶段（建工单）
    //     注意：此处不在 transaction 内，避免 WMS 失败回滚订单状态
    if (toStatus === 'APPROVED') {
      try {
        await this.wmsService.advanceOutboundOrder(orderNo, { next_status: 'allocated' }, user);
      } catch (e: any) {
        console.warn('[transitionOrder][WARN] WMS allocate 触发失败:', e?.message);
        // 不阻塞订单状态推进；WMS 可后续手动补
      }
    }

    return {
      code: 200,
      msg: `订单状态已更新为 ${toStatus}`,
      order_no: orderNo,
      from_status: fromStatus,
      to_status: toStatus,
    };
  }

  async getOrder(orderNo: string) {
    const orders = await this.entityManager.query('SELECT * FROM "ord_orders" WHERE "order_no" = $1', [orderNo]);
    if (!orders || orders.length === 0) throw new NotFoundException('订单不存在');
    const order = orders[0];

    const items = await this.entityManager.query('SELECT * FROM "ord_order_items" WHERE "order_no" = $1', [orderNo]);
    const logs = await this.entityManager.query('SELECT * FROM "ord_approval_log" WHERE "order_no" = $1 ORDER BY "created_at" DESC', [orderNo]);

    return { code: 200, data: { ...order, items, logs } };
  }

  /**
   * 供 WMS 发货时回调，更新发货进度
   */
  async updateDispatchProgress(orderNo: string, _dispatchQty: number) {
    const orders = await this.entityManager.query('SELECT * FROM "ord_orders" WHERE "order_no" = $1', [orderNo]);
    if (!orders || orders.length === 0) throw new NotFoundException(`订单 ${orderNo} 不存在`);
    const order = orders[0];
    const fromStatus = norm(order.status);

    // 兼容历史小写
    const allowedFroms = ['APPROVED', 'ALLOCATED', 'PICKED', 'LOADED', 'PARTIAL_SHIPPED'];
    if (!allowedFroms.includes(fromStatus)) {
      throw new ForbiddenException(`订单 ${orderNo} 当前状态 ${fromStatus} 不可发货`);
    }

    await this.entityManager.query(
      'UPDATE "ord_orders" SET "status" = $1, "shipped_date" = CURRENT_DATE, "updated_at" = CURRENT_TIMESTAMP WHERE "order_no" = $2',
      ['SHIPPED', orderNo],
    );

    return { status: 'SHIPPED' };
  }
}
