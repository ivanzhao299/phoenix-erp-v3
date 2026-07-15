import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { FinanceArAdapter } from '../adapters/finance-ar.adapter';
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
    private readonly financeAr: FinanceArAdapter,
  ) {}

  private currentUser() {
    const u = this.cls.get('user') as any;
    return {
      userId:   String(u?.userId ?? u?.id ?? '0'),
      userName: String(u?.name ?? u?.username ?? ''),
    };
  }

  private async genReceiptNo(): Promise<string> {
    const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `RC-${today}-`;
    const [row]  = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM sal_receipts WHERE receipt_no LIKE $1`, [`${prefix}%`],
    );
    return `${prefix}${String(Number(row.cnt) + 1).padStart(4, '0')}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. 正常签收
  // ─────────────────────────────────────────────────────────────────────────

  async createSigned(deliveryOrderId: string, dto: CreateReceiptDto) {
    const item = await this.getItem(dto.deliveryItemId, deliveryOrderId);

    if (!['DELIVERED', 'LOADED', 'PENDING'].includes(item.status)) {
      throw new BadRequestException(`明细状态 ${item.status} 不可签收`);
    }

    const receiptNo = await this.genReceiptNo();
    const user = this.currentUser();

    const [receipt] = await this.ds.query(
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
    await this.ds.query(
      `UPDATE sal_delivery_order_items
       SET status='SIGNED', received_qty=$1, receipt_id=$2, updated_at=NOW()
       WHERE id=$3`,
      [dto.receivedQty, receipt.id, item.id],
    );

    this.logger.log(`签收记录 ${receiptNo} 已创建（正常签收）`);

    // 检查是否全部签收 → 触发完成链
    await this.checkAndCompleteDelivery(deliveryOrderId);

    return receipt;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. 异常签收
  // ─────────────────────────────────────────────────────────────────────────

  async createException(deliveryOrderId: string, dto: ExceptionReceiptDto) {
    const item = await this.getItem(dto.deliveryItemId, deliveryOrderId);

    if (!['DELIVERED', 'LOADED', 'PENDING'].includes(item.status)) {
      throw new BadRequestException(`明细状态 ${item.status} 不可签收`);
    }

    const receiptNo = await this.genReceiptNo();
    const user = this.currentUser();

    // 部分签收 or 全部异常
    const receiptStatus = dto.receivedQty > 0 ? 'PARTIAL' : 'EXCEPTION';
    const itemStatus    = dto.receivedQty > 0 ? 'SIGNED'  : 'EXCEPTION';

    const [receipt] = await this.ds.query(
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

    await this.ds.query(
      `UPDATE sal_delivery_order_items
       SET status=$1, received_qty=$2, receipt_id=$3, updated_at=NOW()
       WHERE id=$4`,
      [itemStatus, dto.receivedQty, receipt.id, item.id],
    );

    this.logger.log(`签收记录 ${receiptNo} 已创建（异常：${dto.exceptionType}）`);

    await this.checkAndCompleteDelivery(deliveryOrderId);

    return receipt;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. 检查全部签收 → 完成配送单 → 触发销售订单 RECEIVED → AR
  // ─────────────────────────────────────────────────────────────────────────

  private async checkAndCompleteDelivery(deliveryOrderId: string): Promise<void> {
    const [delivery] = await this.ds.query(
      `SELECT * FROM sal_delivery_orders WHERE id=$1`, [deliveryOrderId],
    );
    if (!delivery) return;
    if (['COMPLETED', 'CANCELLED'].includes(delivery.status)) return;

    const items = await this.ds.query(
      `SELECT status, sales_order_id FROM sal_delivery_order_items WHERE delivery_order_id=$1`,
      [deliveryOrderId],
    );

    const total    = items.length;
    const signed   = items.filter((i: any) => ['SIGNED','EXCEPTION','RETURNED'].includes(i.status)).length;
    const allDone  = signed === total;
    const someDone = signed > 0 && signed < total;

    if (someDone && delivery.status === 'ARRIVED') {
      await this.ds.query(
        `UPDATE sal_delivery_orders SET status='PARTIALLY_SIGNED', updated_at=NOW() WHERE id=$1`,
        [deliveryOrderId],
      );
    }

    if (allDone) {
      await this.ds.query(
        `UPDATE sal_delivery_orders SET status='COMPLETED', completed_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [deliveryOrderId],
      );
      this.logger.log(`配送单 ${delivery.delivery_no} 全部签收完成`);

      // 触发每个销售订单 RECEIVED → Finance AR
      for (const item of items) {
        await this.markOrderReceived(String(item.sales_order_id), delivery.delivery_no);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. 核心：触发销售订单 RECEIVED → 生成 AR
  // ─────────────────────────────────────────────────────────────────────────

  private async markOrderReceived(salesOrderId: string, deliveryNo: string): Promise<void> {
    const [so] = await this.ds.query(
      `SELECT * FROM sal_sales_orders WHERE id=$1`, [salesOrderId],
    );
    if (!so) return;
    if (!['SHIPPED', 'DELIVERED', 'ALLOCATED', 'PICKED', 'LOADED', 'APPROVED'].includes(so.status)) {
      this.logger.warn(`销售订单 ${so.order_no} 状态 ${so.status}，跳过 RECEIVED 触发`);
      return;
    }
    if (so.ar_invoice_id) {
      this.logger.warn(`销售订单 ${so.order_no} 已有 AR，跳过`);
      return;
    }

    // 取客户账期
    const [cust] = await this.ds.query(
      `SELECT payment_terms AS payment_terms_days FROM sal_customers
       WHERE customer_no = $1 OR legacy_customer_code = $1
       LIMIT 1`,
      [so.customer_code],
    );
    const paymentTermsDays = Number(cust?.payment_terms_days ?? 30);

    // 更新状态 → RECEIVED
    await this.ds.query(
      `UPDATE sal_sales_orders
       SET status='RECEIVED', received_at=NOW(), updated_at=NOW()
       WHERE id=$1`,
      [salesOrderId],
    );

    // 生成 Finance V2 AR（严禁写 fin_transactions）
    try {
      const arId = await this.financeAr.createArForOrder({
        orderId:           String(so.id),
        orderNo:           so.order_no,
        companyCode:       so.company_code,
        companyName:       so.company_name ?? undefined,
        customerId:        so.customer_id ? String(so.customer_id) : undefined,
        customerCode:      so.customer_code ?? undefined,
        customerName:      so.customer_name ?? '未知客户',
        currencyCode:      so.currency_code ?? 'LAK',
        totalAmount:       Number(so.total_amount),
        paymentTermsDays,
        receivedAt:        new Date(),
        createdBy:         `delivery:${deliveryNo}`,
      });

      await this.ds.query(
        `UPDATE sal_sales_orders SET ar_invoice_id=$1, updated_at=NOW() WHERE id=$2`,
        [arId, salesOrderId],
      );

      this.logger.log(`销售订单 ${so.order_no} RECEIVED，AR ${arId} 已生成`);
    } catch (err: any) {
      this.logger.error(`销售订单 ${so.order_no} AR 生成失败：${err?.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 辅助
  // ─────────────────────────────────────────────────────────────────────────

  private async getItem(itemId: string, deliveryOrderId: string) {
    const [item] = await this.ds.query(
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
