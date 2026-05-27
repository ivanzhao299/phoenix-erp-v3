import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
} from 'typeorm';

/**
 * 销售订单明细  sal_order_items
 *
 * Sales V2 Phase 0 — Clean Baseline
 */
@Entity('sal_order_items')
export class SalOrderItemEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'sales_order_id', type: 'bigint' })
  salesOrderId: string;

  @Column({ name: 'product_code', type: 'varchar', length: 64 })
  productCode: string;

  @Column({ name: 'grade_code', type: 'varchar', length: 16, nullable: true })
  gradeCode: string | null;

  @Column({ name: 'packaging_spec', type: 'varchar', length: 64, nullable: true })
  packagingSpec: string | null;

  @Column({ name: 'qty', type: 'numeric', precision: 18, scale: 2 })
  qty: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2 })
  unitPrice: number;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2 })
  amount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
