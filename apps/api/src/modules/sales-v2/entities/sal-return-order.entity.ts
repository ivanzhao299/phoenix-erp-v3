import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 销售退货单  sal_return_orders
 *
 * Sales V2 Phase 6 — Sales Return Runtime
 *
 * return_type：
 *   CUSTOMER_RETURN   — 客户主动退货
 *   DELIVERY_REJECT   — 配送拒收（来自 Delivery Runtime）
 *   QUALITY_RETURN    — 质量退货
 *   DAMAGE_RETURN     — 破损退货
 *
 * 状态机：
 *   DRAFT
 *     → submit()
 *   SUBMITTED
 *     → need_approval=true  → PENDING_APPROVAL
 *     → need_approval=false → INSPECTING
 *   PENDING_APPROVAL
 *     → approve() → INSPECTING
 *     → reject()  → REJECTED（终态）
 *   INSPECTING
 *     → completeInspection() → RESTOCKING (accepted_qty>0)
 *                            → COMPLETED  (全部破损)
 *   RESTOCKING
 *     → completeRestock() → COMPLETED（终态）
 *   COMPLETED   — 终态（已回库 + Credit Note 已生成）
 *   REJECTED    — 终态
 *   CANCELLED   — 终态
 *
 * credit_note_id: COMPLETED 时由 FinanceCreditNoteAdapter 写入 fin_ar_invoices.id
 */
@Entity('sal_return_orders')
@Index('idx_sal_return_orders_company', ['companyCode'])
@Index('idx_sal_return_orders_status', ['status'])
@Index('idx_sal_return_orders_customer', ['customerCode'])
@Index('idx_sal_return_orders_sales_ord', ['salesOrderId'])
@Index('idx_sal_return_orders_created', ['createdAt'])
export class SalReturnOrderEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'return_no', type: 'varchar', length: 64, unique: true })
  returnNo: string;

  @Column({ name: 'sales_order_id', type: 'bigint', nullable: true })
  salesOrderId: string | null;

  @Column({ name: 'sales_order_no', type: 'varchar', length: 64, nullable: true })
  salesOrderNo: string | null;

  @Column({ name: 'delivery_order_id', type: 'bigint', nullable: true })
  deliveryOrderId: string | null;

  @Column({ name: 'customer_code', type: 'varchar', length: 64, nullable: true })
  customerCode: string | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 256, nullable: true })
  customerName: string | null;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string | null;

  /** CUSTOMER_RETURN / DELIVERY_REJECT / QUALITY_RETURN / DAMAGE_RETURN */
  @Column({ name: 'return_type', type: 'varchar', length: 32 })
  returnType: string;

  @Column({ name: 'reason_code', type: 'varchar', length: 64, nullable: true })
  reasonCode: string | null;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'LAK' })
  currencyCode: string;

  @Column({ name: 'subtotal', type: 'numeric', precision: 18, scale: 2, default: 0 })
  subtotal: number;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ name: 'need_approval', type: 'boolean', default: false })
  needApproval: boolean;

  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string | null;

  /** Finance V2 fin_ar_invoices.id (Credit Note) — COMPLETED 时写入 */
  @Column({ name: 'credit_note_id', type: 'bigint', nullable: true })
  creditNoteId: string | null;

  @Column({ name: 'requested_at', type: 'timestamptz', nullable: true })
  requestedAt: Date | null;

  @Column({ name: 'inspected_at', type: 'timestamptz', nullable: true })
  inspectedAt: Date | null;

  @Column({ name: 'restocked_at', type: 'timestamptz', nullable: true })
  restockedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 128, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
