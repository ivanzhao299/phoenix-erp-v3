import {
  Entity, Column, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn, CreateDateColumn,
} from 'typeorm';
import { SalReturnOrderEntity } from './sal-return-order.entity';

/**
 * 退货明细  sal_return_items
 *
 * Sales V2 Phase 6 — Sales Return Runtime
 *
 * inspection_result：PENDING / ACCEPTED / PARTIAL / REJECTED / DAMAGED
 * restock_status：   PENDING / RESTOCKED / WRITTEN_OFF
 *
 * 安全约束：
 *   · accepted_qty + damaged_qty <= returned_qty
 *   · damaged_qty 不得入 inv_batches（只写 inv_ledger WRITE_OFF）
 *   · accepted_qty 正常回库（inv_batches + inv_ledger SALE_RETURN）
 */
@Entity('sal_return_items')
@Index('idx_sal_return_items_return_ord', ['returnOrderId'])
@Index('idx_sal_return_items_product', ['productCode'])
@Index('idx_sal_return_items_sku_code', ['skuCode'], { where: '"sku_code" IS NOT NULL' })
export class SalReturnItemEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'return_order_id', type: 'bigint' })
  returnOrderId: string;

  @ManyToOne(() => SalReturnOrderEntity)
  @JoinColumn({ name: 'return_order_id', referencedColumnName: 'id', foreignKeyConstraintName: 'sal_return_items_return_order_id_fkey' })
  returnOrder?: SalReturnOrderEntity;

  @Column({ name: 'sales_order_item_id', type: 'bigint', nullable: true })
  salesOrderItemId: string | null;

  @Column({ name: 'product_code', type: 'varchar', length: 64 })
  productCode: string;

  @Column({ name: 'product_name', type: 'varchar', length: 256, nullable: true })
  productName: string | null;

  @Column({ name: 'grade_code', type: 'varchar', length: 32, nullable: true })
  gradeCode: string | null;

  @Column({ name: 'packaging_spec', type: 'varchar', length: 128, nullable: true })
  packagingSpec: string | null;

  /** 客户申请退货数量 */
  @Column({ name: 'returned_qty', type: 'numeric', precision: 18, scale: 2, default: 0, nullable: true })
  returnedQty: number | null;

  /** 质检通过可回库数量 */
  @Column({ name: 'accepted_qty', type: 'numeric', precision: 18, scale: 2, default: 0, nullable: true })
  acceptedQty: number | null;

  /** 破损/报废数量（写 inv_ledger WRITE_OFF，不回库存） */
  @Column({ name: 'damaged_qty', type: 'numeric', precision: 18, scale: 2, default: 0, nullable: true })
  damagedQty: number | null;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, default: 0, nullable: true })
  unitPrice: number | null;

  /** accepted_qty * unit_price — Credit Note 金额依据 */
  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2, default: 0, nullable: true })
  amount: number | null;

  /** PENDING / ACCEPTED / PARTIAL / REJECTED / DAMAGED */
  @Column({ name: 'inspection_result', type: 'varchar', length: 32, default: 'PENDING', nullable: true })
  inspectionResult: string | null;

  /** PENDING / RESTOCKED / WRITTEN_OFF */
  @Column({ name: 'restock_status', type: 'varchar', length: 32, default: 'PENDING', nullable: true })
  restockStatus: string | null;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  // ── Phase H5 — SKU 接入 ──────────────────────────────────────────────────
  /** SKU 编码（从原销售明细继承，可选，旧退货单为 NULL） */
  @Column({ name: 'sku_code', type: 'varchar', length: 64, nullable: true })
  skuCode: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
