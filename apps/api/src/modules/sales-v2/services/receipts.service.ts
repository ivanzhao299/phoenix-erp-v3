import { ReturnOrdersService } from './return-orders.service';
import {
  Injectable, NotFoundException, BadRequestException, Logger, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import { CreateReceiptDto, ExceptionReceiptDto } from '../dto/delivery.dto';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { quantityTicks } from '../../wms/stock-quantity';

/**
 * Sales V2 Phase 4 — Receipts Service（签收 Runtime）
 *
 * 关键链路：
 *   客户签收 → 更新 delivery_item → 检查全部签收
 *   → 更新 delivery_order → 调用 markOrderReceived
 *   → Finance V2 AR（fin_ar_invoices）
 *
 * 严禁写 fin_transactions！
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly salesOrders: SalesOrdersService,
    private readonly lifecycle: SalesOrderLifecycleService,
  ) {}

  private currentUser() {
    const u = this.cls.get('user') as any;
    return {
      userId:   String(u?.userId ?? u?.id ?? '0'),
      userName: String(u?.name ?? u?.username ?? ''),
    };
  }

  private async genReceiptNo(mgr: EntityManager): Promise<string> {
    const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `RC-${today}-`;
    await mgr.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['delivery-receipt:' + prefix]);
    const [row]  = await mgr.query(
      `SELECT COUNT(*) AS cnt FROM sal_receipts WHERE receipt_no LIKE $1`, [`${prefix}%`],
    );
    return `${prefix}${String(Number(row.cnt) + 1).padStart(4, '0')}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. 正常签收
  // ─────────────────────────────────────────────────────────────────────────

  async createSigned(deliveryOrderId: string, dto: CreateReceiptDto) {
    return this.ds.transaction(async (mgr) => {
    const { item, replay } = await this.prepareReceipt(mgr, dto.deliveryItemId, deliveryOrderId, dto.receivedQty);
    if (replay) return { ...replay, replayed: true };

    const receiptNo = await this.genReceiptNo(mgr);
    const user = this.currentUser();

    const [receipt] = await mgr.query(
      `INSERT INTO sal_receipts (
        receipt_no, delivery_order_id, delivery_item_id,
        sales_order_id, sales_order_no,
        customer_code, customer_name,
        signed_by, signed_at, received_qty, status, created_by, photo_urls, remark
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,'SIGNED',$10,$11,$12)
       RETURNING *`,
      [
        receiptNo, deliveryOrderId, item.id,
        item.sales_order_id, item.sales_order_no,
        item.customer_code, item.customer_name,
        dto.signedBy ?? null, dto.receivedQty,
        user.userName || user.userId,
        dto.photoUrls ? JSON.stringify(dto.photoUrls) : null,
        dto.remark ?? null,
      ],
    );

    // 更新明细状态
    await mgr.query(
      `UPDATE sal_delivery_order_items
       SET status='SIGNED', received_qty=$1, receipt_id=$2, updated_at=NOW()
       WHERE id=$3`,
      [dto.receivedQty, receipt.id, item.id],
    );

    this.logger.log(`签收记录 ${receiptNo} 已创建（正常签收）`);

    // 检查是否全部签收 → 触发完成链
    await this.lifecycle.appendEvent(mgr, {
      salesOrderId: String(item.sales_order_id), orderNo: item.sales_order_no,
      eventType: 'RECEIPT_SIGNED', actorType: 'USER', actorUserId: user.userId,
      actorName: user.userName, comment: dto.remark ?? null, sourceModule: 'DELIVERY',
      sourceRefType: 'RECEIPT', sourceRefId: String(receipt.id), sourceRefNo: receiptNo,
      sourceEndpoint: '/api/v2/sales/delivery/:id/receipts',
      metadata: { receivedQty: dto.receivedQty },
    });
    await this.checkAndCompleteDelivery(deliveryOrderId, mgr);

    return receipt;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. 异常签收
  // ─────────────────────────────────────────────────────────────────────────

  async createException(deliveryOrderId: string, dto: ExceptionReceiptDto) {
    return this.ds.transaction(async (mgr) => {
    if (quantityTicks(dto.exceptionQty, '异常数量') <= 0) throw new BadRequestException('异常签收的异常数量必须大于 0');
    const { item, replay } = await this.prepareReceipt(mgr, dto.deliveryItemId, deliveryOrderId, dto.receivedQty, dto);
    if (replay) return { ...replay, replayed: true };

    const receiptNo = await this.genReceiptNo(mgr);
    const user = this.currentUser();

    // 部分签收 or 全部异常
    const receiptStatus = dto.receivedQty > 0 ? 'PARTIAL' : 'EXCEPTION';
    const itemStatus    = dto.receivedQty > 0 ? 'SIGNED'  : 'EXCEPTION';

    const [receipt] = await mgr.query(
      `INSERT INTO sal_receipts (
        receipt_no, delivery_order_id, delivery_item_id,
        sales_order_id, sales_order_no,
        customer_code, customer_name,
        signed_by, signed_at,
        received_qty, exception_qty, exception_type,
        status, created_by, photo_urls, remark
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        receiptNo, deliveryOrderId, item.id,
        item.sales_order_id, item.sales_order_no,
        item.customer_code, item.customer_name,
        dto.signedBy ?? null,
        dto.receivedQty, dto.exceptionQty, dto.exceptionType,
        receiptStatus,
        user.userName || user.userId,
        dto.photoUrls ? JSON.stringify(dto.photoUrls) : null,
        dto.remark ?? null,
      ],
    );

    await mgr.query(
      `INSERT INTO sal_delivery_exceptions
         (receipt_id,delivery_order_id,delivery_item_id,sales_order_id,exception_type,exception_qty,resolution_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [receipt.id, deliveryOrderId, item.id, item.sales_order_id, dto.exceptionType, dto.exceptionQty,
       ['DAMAGED','REJECTED'].includes(dto.exceptionType) ? 'RETURN_PENDING' : 'IN_TRANSIT_REVIEW'],
    );

    await mgr.query(
      `UPDATE sal_delivery_order_items
       SET status=$1, received_qty=$2, receipt_id=$3, updated_at=NOW()
       WHERE id=$4`,
      [itemStatus, dto.receivedQty, receipt.id, item.id],
    );

    this.logger.log(`签收记录 ${receiptNo} 已创建（异常：${dto.exceptionType}）`);

    await this.lifecycle.appendEvent(mgr, {
      salesOrderId: String(item.sales_order_id), orderNo: item.sales_order_no,
      eventType: 'RECEIPT_EXCEPTION', actorType: 'USER', actorUserId: user.userId,
      actorName: user.userName, reasonCode: dto.exceptionType, comment: dto.remark ?? null,
      sourceModule: 'DELIVERY', sourceRefType: 'RECEIPT', sourceRefId: String(receipt.id),
      sourceRefNo: receiptNo, sourceEndpoint: '/api/v2/sales/delivery/:id/receipts/exception',
      metadata: { receivedQty: dto.receivedQty, exceptionQty: dto.exceptionQty },
    });
    await this.checkAndCompleteDelivery(deliveryOrderId, mgr);

    return receipt;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. 检查全部签收 → 完成配送单 → 触发销售订单 RECEIVED → AR
  // ─────────────────────────────────────────────────────────────────────────

  private async checkAndCompleteDelivery(deliveryOrderId: string, mgr: EntityManager): Promise<void> {
    const [delivery] = await mgr.query(
      `SELECT * FROM sal_delivery_orders WHERE id=$1`, [deliveryOrderId],
    );
    if (!delivery) return;
    if (['COMPLETED', 'CANCELLED'].includes(delivery.status)) return;

    const items = await mgr.query(
      `SELECT status, sales_order_id FROM sal_delivery_order_items WHERE delivery_order_id=$1`,
      [deliveryOrderId],
    );

    const total    = items.length;
    const signed   = items.filter((i: any) => ['SIGNED','EXCEPTION','RETURNED'].includes(i.status)).length;
    const allDone  = signed === total;
    const someDone = signed > 0 && signed < total;

    if (someDone && delivery.status === 'ARRIVED') {
      await mgr.query(
        `UPDATE sal_delivery_orders SET status='PARTIALLY_SIGNED', updated_at=NOW() WHERE id=$1`,
        [deliveryOrderId],
      );
    }

    if (allDone) {
      await mgr.query(
        `UPDATE sal_delivery_orders SET status='COMPLETED', completed_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [deliveryOrderId],
      );
      this.logger.log(`配送单 ${delivery.delivery_no} 全部签收完成`);

      // 触发每个销售订单 RECEIVED → Finance AR
      for (const item of items) {
        const [so] = await mgr.query(`SELECT * FROM sal_sales_orders WHERE id=$1 FOR UPDATE`, [item.sales_order_id]);
        if (!so || so.ar_invoice_id) continue;
        if (so.status === 'ALLOCATED') continue;
        if (!['SHIPPED', 'DELIVERED'].includes(so.status)) {
          throw new BadRequestException(`销售订单 ${so.order_no} 状态 ${so.status} 与签收不一致`);
        }
        await this.salesOrders.receiveWithAr(mgr, so, {
          actorType: 'SYSTEM', actorName: `delivery:${delivery.delivery_no}`,
          sourceEndpoint: '/api/v2/sales/delivery/:id/receipts', sourceModule: 'DELIVERY',
          sourceRefType: 'DELIVERY', sourceRefId: String(delivery.id), sourceRefNo: delivery.delivery_no,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 辅助
  // ─────────────────────────────────────────────────────────────────────────

  private assertDeliveryAccess(delivery: { company_code: string }) {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (!scope?.isGlobal && !scope?.allowedCompanyCodes.includes(delivery.company_code)) {
      throw new ForbiddenException('无权访问该公司配送单');
    }
  }

  private async prepareReceipt(mgr: EntityManager, itemId: string, deliveryOrderId: string, received: number,
    exception?: ExceptionReceiptDto) {
    const [delivery] = await mgr.query(
      'SELECT delivery_no,company_code,fulfillment_warehouse_code,status FROM sal_delivery_orders WHERE id=$1 FOR UPDATE',
      [deliveryOrderId],
    );
    if (!delivery) throw new NotFoundException('配送单不存在');
    this.assertDeliveryAccess(delivery);
    const [item] = await mgr.query(
      'SELECT * FROM sal_delivery_order_items WHERE id=$1 AND delivery_order_id=$2 FOR UPDATE', [itemId, deliveryOrderId],
    );
    if (!item) throw new NotFoundException('配送明细不存在');
    const receivedTicks = quantityTicks(received, '实收量');
    const exceptionTicks = exception ? quantityTicks(exception.exceptionQty, '异常数量') : 0;
    if (item.receipt_id) {
      const [replay] = await mgr.query(
        'SELECT * FROM sal_receipts WHERE id=$1 AND delivery_order_id=$2 AND delivery_item_id=$3', [item.receipt_id, deliveryOrderId, itemId]);
      if (replay && (replay.exception_type ?? null) === (exception?.exceptionType ?? null)
        && quantityTicks(replay.exception_qty ?? 0, '异常数量') === exceptionTicks
        && quantityTicks(replay.received_qty, '实收量') === receivedTicks) return { item, replay };
      throw new ConflictException('该配送明细已有不同的签收回执');
    }
    if (!['ARRIVED', 'PARTIALLY_SIGNED'].includes(delivery.status) || item.status !== 'DELIVERED') {
      throw new ConflictException('配送单须到达且配送明细已发运后才能签收');
    }
    const [facts] = await mgr.query(`
      SELECT COUNT(*)::int AS actions, COUNT(l.id)::int AS matched, COALESCE(SUM(a.qty) FILTER (WHERE l.id IS NOT NULL),0)::text AS quantity
      FROM sal_order_item_batch_allocation_actions a
      JOIN sal_order_item_batch_allocations allocation ON allocation.id=a.allocation_id
      LEFT JOIN inv_ledger l ON l.id=a.ledger_id AND l.batch_no=allocation.batch_no
        AND l.change_type='FIFO_OUT' AND l.qty_change=-a.qty AND l.ref_no=$3 AND l.company_code=$4
        AND ($5::text IS NULL OR l.warehouse_code=$5)
      WHERE a.delivery_order_id=$1 AND a.sales_order_id=$2 AND a.action_type='OUTBOUND' AND a.action_key='delivery:'||$1::text`,
    [deliveryOrderId, item.sales_order_id, delivery.delivery_no, delivery.company_code, delivery.fulfillment_warehouse_code]);
    let shipped = quantityTicks(facts.quantity, '实发量');
    let expected = quantityTicks(item.outbound_qty ?? 0, '明细实发量');
    if (!delivery.fulfillment_warehouse_code) {
      // Older loading transactions did not always store a fulfillment warehouse or allocation actions.
      expected ||= quantityTicks(item.loaded_qty ?? 0, '明细实装量') || quantityTicks(item.planned_qty, '明细计划量');
      if (facts.actions === 0) {
        const [historical] = await mgr.query(`
          SELECT COALESCE(SUM(-l.qty_change),0)::text AS quantity
          FROM inv_ledger l
          WHERE l.ref_no=$1 AND l.company_code=$2 AND l.change_type='FIFO_OUT' AND l.qty_change<0
            AND l.note='装车出库 delivery='||$1||' order='||$3||' batch='||l.batch_no
            AND EXISTS (SELECT 1 FROM sal_order_lifecycle_events e
              WHERE e.sales_order_id=$4 AND e.order_no=$3 AND e.event_type='OUTBOUND_CONFIRMED'
                AND e.source_ref_type='DELIVERY' AND e.source_ref_id=$5 AND e.source_ref_no=$1)`,
        [delivery.delivery_no, delivery.company_code, item.sales_order_no, item.sales_order_id, deliveryOrderId]);
        shipped = quantityTicks(historical.quantity, '历史流水实发量');
      }
    }
    if (facts.actions !== facts.matched || shipped <= 0 || shipped !== expected) {
      throw new ConflictException('配送明细缺少一致的实发回执');
    }
    if (receivedTicks + exceptionTicks !== shipped) throw new BadRequestException('签收量与异常量之和须等于实发量');
    return { item, replay: null };
  }

  // 查询配送单的所有签收记录
  async listReceipts(deliveryOrderId: string) {
    const [delivery] = await this.ds.query('SELECT company_code FROM sal_delivery_orders WHERE id=$1', [deliveryOrderId]);
    if (!delivery) throw new NotFoundException('配送单不存在');
    this.assertDeliveryAccess(delivery);
    return this.ds.query(
      `SELECT * FROM sal_receipts WHERE delivery_order_id=$1 ORDER BY created_at DESC`,
      [deliveryOrderId],
    );
  }

  async resolveExceptionReturn(receiptId: string, returns: ReturnOrdersService) {
    return this.ds.transaction(async manager => {
      const [exception] = await manager.query(`
        SELECT e.*,d.company_code,d.delivery_no,d.fulfillment_warehouse_code,r.remark
        FROM sal_delivery_exceptions e JOIN sal_receipts r ON r.id=e.receipt_id
        JOIN sal_delivery_orders d ON d.id=e.delivery_order_id
        WHERE e.receipt_id=$1 FOR UPDATE OF e`, [receiptId]);
      if (!exception) throw new NotFoundException('异常签收记录不存在');
      this.assertDeliveryAccess(exception);
      if (exception.return_order_id) {
        const [returnOrder] = await manager.query('SELECT * FROM sal_return_orders WHERE id=$1', [exception.return_order_id]);
        return { returnOrder, resolutionStatus: exception.resolution_status };
      }
      if (exception.resolution_status !== 'RETURN_PENDING') {
        return { returnOrder: null, resolutionStatus: exception.resolution_status };
      }
      const lines = await manager.query(`
        SELECT a.sales_order_item_id,oi.product_code,SUM(action.qty)::text AS shipped
        FROM sal_order_item_batch_allocation_actions action
        JOIN sal_order_item_batch_allocations a ON a.id=action.allocation_id
        JOIN sal_order_items oi ON oi.id=a.sales_order_item_id
        JOIN inv_ledger l ON l.id=action.ledger_id AND l.batch_no=a.batch_no AND l.change_type='FIFO_OUT' AND l.qty_change=-action.qty
        WHERE action.delivery_order_id=$1 AND action.sales_order_id=$2 AND action.action_type='OUTBOUND'
          AND l.company_code=$3 AND l.warehouse_code=$4 AND l.ref_no=$5
        GROUP BY a.sales_order_item_id,oi.product_code`,
      [exception.delivery_order_id, exception.sales_order_id, exception.company_code, exception.fulfillment_warehouse_code, exception.delivery_no]);
      if (lines.length !== 1 || Number(exception.exception_qty) > Number(lines[0].shipped)) {
        return { returnOrder: null, resolutionStatus: exception.resolution_status };
      }
      const [line] = lines;
      const returnOrder = await returns.create({
        salesOrderId: String(exception.sales_order_id), deliveryOrderId: String(exception.delivery_order_id),
        companyCode: exception.company_code, returnType: 'DELIVERY_REJECT', reasonCode: exception.exception_type,
        remark: exception.remark ?? undefined,
        items: [{ salesOrderItemId: String(line.sales_order_item_id), productCode: line.product_code,
          returnedQty: Number(exception.exception_qty), quantityBasis: 'BASE', unitPrice: 0 }],
      }, manager);
      await manager.query(`UPDATE sal_delivery_exceptions SET return_order_id=$1,resolution_status='RETURN_CREATED' WHERE id=$2`,
        [returnOrder.id, exception.id]);
      return { returnOrder, resolutionStatus: 'RETURN_CREATED' };
    });
  }
}
