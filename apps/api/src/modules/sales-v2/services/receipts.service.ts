import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import { CreateReceiptDto, ExceptionReceiptDto } from '../dto/delivery.dto';

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
    const item = await this.getItem(dto.deliveryItemId, deliveryOrderId, mgr);

    if (!['DELIVERED', 'LOADED', 'PENDING'].includes(item.status)) {
      throw new BadRequestException(`明细状态 ${item.status} 不可签收`);
    }

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
    const item = await this.getItem(dto.deliveryItemId, deliveryOrderId, mgr);

    if (!['DELIVERED', 'LOADED', 'PENDING'].includes(item.status)) {
      throw new BadRequestException(`明细状态 ${item.status} 不可签收`);
    }

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

  private async getItem(itemId: string, deliveryOrderId: string, mgr: EntityManager = this.ds.manager) {
    const [item] = await mgr.query(
      `SELECT * FROM sal_delivery_order_items WHERE id=$1 AND delivery_order_id=$2`,
      [itemId, deliveryOrderId],
    );
    if (!item) throw new NotFoundException(`配送明细 ${itemId} 不存在`);
    return item;
  }

  // 查询配送单的所有签收记录
  async listReceipts(deliveryOrderId: string) {
    return this.ds.query(
      `SELECT * FROM sal_receipts WHERE delivery_order_id=$1 ORDER BY created_at DESC`,
      [deliveryOrderId],
    );
  }
}
