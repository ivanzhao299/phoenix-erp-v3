import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 销售订单  sal_sales_orders
 *
 * Sales V2 Phase 3 — Sales Order Runtime（完整字段）
 *
 * 状态机：
 *   DRAFT → PENDING_APPROVAL → APPROVED
 *         → ALLOCATED → PICKED → LOADED → SHIPPED
 *         → DELIVERED → RECEIVED → RECONCILED
 *         → REJECTED | CANCELLED（终态）
 *
 * ar_invoice_id: RECEIVED 时由 FinanceArAdapter 填入 fin_ar_invoices.id
 * wf_instance_id: Workflow 2.0 审批（低价/超信用时触发）
 */
@Entity('sal_sales_orders')
export class SalSalesOrderEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'order_no', type: 'varchar', length: 64, unique: true })
  orderNo: string;

  @Column({ name: 'customer_id', type: 'bigint', nullable: true })
  customerId: string | null;

  @Column({ name: 'customer_code', type: 'varchar', length: 64, nullable: true })
  customerCode: string | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 256, nullable: true })
  customerName: string | null;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string | null;

  @Column({ name: 'channel_code', type: 'varchar', length: 64, nullable: true })
  channelCode: string | null;

  @Column({ name: 'channel_type', type: 'varchar', length: 32, nullable: true })
  channelType: string | null;

  @Column({ name: 'price_book_id', type: 'bigint', nullable: true })
  priceBookId: string | null;

  @Column({ name: 'price_book_no', type: 'varchar', length: 64, nullable: true })
  priceBookNo: string | null;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'LAK' })
  currencyCode: string;

  @Column({ name: 'subtotal', type: 'numeric', precision: 18, scale: 2, default: 0 })
  subtotal: number;

  @Column({ name: 'discount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  discount: number;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ name: 'need_price_approval', type: 'boolean', default: false })
  needPriceApproval: boolean;

  @Column({ name: 'need_credit_approval', type: 'boolean', default: false })
  needCreditApproval: boolean;

  @Column({ name: 'over_credit', type: 'boolean', default: false })
  overCredit: boolean;

  @Column({ name: 'below_floor_price', type: 'boolean', default: false })
  belowFloorPrice: boolean;

  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string | null;

  // ── Phase 5 信用控制字段 ──────────────────────────────────────────────────
  /** 提交时客户处于 WARNING 状态（有逾期但未超额度） */
  @Column({ name: 'credit_warning', type: 'boolean', default: false })
  creditWarning: boolean;

  /** 提交时刻信用快照 JSONB */
  @Column({ name: 'credit_snapshot', type: 'jsonb', nullable: true })
  creditSnapshot: Record<string, any> | null;

  /** Finance V2 fin_ar_invoices.id — RECEIVED 时由 FinanceArAdapter 写入 */
  @Column({ name: 'ar_invoice_id', type: 'bigint', nullable: true })
  arInvoiceId: string | null;

  @Column({ name: 'expected_delivery_date', type: 'date', nullable: true })
  expectedDeliveryDate: string | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress: string | null;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 128, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
