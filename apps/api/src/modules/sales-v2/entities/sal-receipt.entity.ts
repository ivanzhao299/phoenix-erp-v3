import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

/** 签收记录  sal_receipts — Sales V2 Phase 4 */
@Entity('sal_receipts')
@Index('idx_sal_rc_delivery', ['deliveryOrderId'])
@Index('idx_sal_rc_item', ['deliveryItemId'])
@Index('idx_sal_rc_so', ['salesOrderId'])
@Index('idx_sal_rc_status', ['status'])
@Index('idx_sal_rc_signed_at', ['signedAt'])
export class SalReceiptEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'receipt_no', type: 'varchar', length: 64, unique: true }) receiptNo: string;
  @Column({ name: 'delivery_order_id', type: 'bigint' }) deliveryOrderId: string;
  @Column({ name: 'delivery_item_id', type: 'bigint' }) deliveryItemId: string;
  @Column({ name: 'sales_order_id', type: 'bigint' }) salesOrderId: string;
  @Column({ name: 'sales_order_no', type: 'varchar', length: 64 }) salesOrderNo: string;
  @Column({ name: 'customer_code', type: 'varchar', length: 64, nullable: true }) customerCode: string | null;
  @Column({ name: 'customer_name', type: 'varchar', length: 256, nullable: true }) customerName: string | null;
  @Column({ name: 'signed_by', type: 'varchar', length: 256, nullable: true }) signedBy: string | null;
  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true }) signedAt: Date | null;
  @Column({ name: 'received_qty', type: 'numeric', precision: 18, scale: 2, default: 0 }) receivedQty: number;
  @Column({ name: 'exception_qty', type: 'numeric', precision: 18, scale: 2, default: 0 }) exceptionQty: number;
  @Column({ name: 'exception_type', type: 'varchar', length: 32, nullable: true }) exceptionType: string | null;
  @Column({ name: 'photo_urls', type: 'jsonb', nullable: true }) photoUrls: string[] | null;
  @Column({ name: 'remark', type: 'text', nullable: true }) remark: string | null;
  @Column({ name: 'status', type: 'varchar', length: 16, default: 'SIGNED' }) status: string;
  @Column({ name: 'created_by', type: 'varchar', length: 128, nullable: true }) createdBy: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
