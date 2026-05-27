import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
} from 'typeorm';

/**
 * 销售订单明细  sal_order_items
 *
 * Sales V2 Phase 3 — Sales Order Runtime（完整字段）
 *
 * resolved_unit_price: PriceRuntime 查询到的建议价格
 * actual_unit_price:   实际成交价（默认等于 resolved_unit_price；调低需审批）
 * floor_price:         底价（来自 price book，低于此值需审批）
 * ceiling_price:       最高价（超出仅标记，不阻断）
 * unit_price:          向后兼容字段，始终写入 actual_unit_price 值
 */
@Entity('sal_order_items')
export class SalOrderItemEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'sales_order_id', type: 'bigint' })
  salesOrderId: string;

  @Column({ name: 'product_code', type: 'varchar', length: 64 })
  productCode: string;

  @Column({ name: 'product_name', type: 'varchar', length: 256, nullable: true })
  productName: string | null;

  @Column({ name: 'grade_code', type: 'varchar', length: 16, nullable: true })
  gradeCode: string | null;

  @Column({ name: 'packaging_spec', type: 'varchar', length: 64, nullable: true })
  packagingSpec: string | null;

  @Column({ name: 'qty', type: 'numeric', precision: 18, scale: 2 })
  qty: number;

  /** PriceRuntime 查询价（参考价） */
  @Column({ name: 'resolved_unit_price', type: 'numeric', precision: 18, scale: 2, default: 0 })
  resolvedUnitPrice: number;

  /** 实际成交价（默认 = resolved_unit_price，可由销售调低需审批） */
  @Column({ name: 'actual_unit_price', type: 'numeric', precision: 18, scale: 2, default: 0 })
  actualUnitPrice: number;

  /** 向后兼容字段，始终与 actual_unit_price 保持一致 */
  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2 })
  unitPrice: number;

  @Column({ name: 'floor_price', type: 'numeric', precision: 18, scale: 2, nullable: true })
  floorPrice: number | null;

  @Column({ name: 'ceiling_price', type: 'numeric', precision: 18, scale: 2, nullable: true })
  ceilingPrice: number | null;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2 })
  amount: number;

  @Column({ name: 'price_book_id', type: 'bigint', nullable: true })
  priceBookId: string | null;

  @Column({ name: 'price_book_no', type: 'varchar', length: 64, nullable: true })
  priceBookNo: string | null;

  @Column({ name: 'below_floor_price', type: 'boolean', default: false })
  belowFloorPrice: boolean;

  // ── Phase 7 — FIFO 库存分配字段 ──────────────────────────────────────────
  /** FIFO 分配的批次号（多批次逗号分隔，取首批） */
  @Column({ name: 'allocated_batch_no', type: 'varchar', length: 128, nullable: true })
  allocatedBatchNo: string | null;

  /** 实际分配数量 */
  @Column({ name: 'allocated_qty', type: 'numeric', precision: 18, scale: 2, default: 0 })
  allocatedQty: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
