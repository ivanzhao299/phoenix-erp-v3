import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** 配送单明细  sal_delivery_order_items — Sales V2 Phase 4 */
@Entity('sal_delivery_order_items')
export class SalDeliveryOrderItemEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'delivery_order_id', type: 'bigint' }) deliveryOrderId: string;
  @Column({ name: 'sales_order_id', type: 'bigint' }) salesOrderId: string;
  @Column({ name: 'sales_order_no', type: 'varchar', length: 64 }) salesOrderNo: string;
  @Column({ name: 'customer_code', type: 'varchar', length: 64, nullable: true }) customerCode: string | null;
  @Column({ name: 'customer_name', type: 'varchar', length: 256, nullable: true }) customerName: string | null;
  @Column({ name: 'delivery_address', type: 'text', nullable: true }) deliveryAddress: string | null;
  @Column({ name: 'planned_qty', type: 'numeric', precision: 18, scale: 2, default: 0 }) plannedQty: number;
  @Column({ name: 'loaded_qty', type: 'numeric', precision: 18, scale: 2, default: 0 }) loadedQty: number;
  @Column({ name: 'received_qty', type: 'numeric', precision: 18, scale: 2, default: 0 }) receivedQty: number;
  @Column({ name: 'status', type: 'varchar', length: 32, default: 'PENDING' }) status: string;
  @Column({ name: 'receipt_id', type: 'bigint', nullable: true }) receiptId: string | null;
  @Column({ name: 'remark', type: 'text', nullable: true }) remark: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
