import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique, UpdateDateColumn,
} from 'typeorm';
import { SalOrderItemEntity } from './sal-order-item.entity';

@Entity('sal_order_item_batch_allocations')
@Unique('uq_sal_item_batch_allocation', ['salesOrderItemId', 'batchNo'])
@Check('ck_sal_item_batch_allocation_qty', 'reserved_qty > 0 AND outbound_qty >= 0 AND released_qty >= 0 AND outbound_qty + released_qty <= reserved_qty')
@Index('idx_sal_item_batch_allocation_item', ['salesOrderItemId'])
@Index('idx_sal_item_batch_allocation_batch', ['batchNo'])
export class SalOrderItemBatchAllocationEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'sales_order_item_id', type: 'bigint' })
  salesOrderItemId: string;

  @ManyToOne(() => SalOrderItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_order_item_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_sal_item_batch_alloc_item' })
  salesOrderItem?: SalOrderItemEntity;

  @Column({ name: 'batch_no', type: 'varchar', length: 64 })
  batchNo: string;

  @Column({ name: 'reserved_qty', type: 'numeric', precision: 18, scale: 2 })
  reservedQty: number;

  @Column({ name: 'outbound_qty', type: 'numeric', precision: 18, scale: 2, default: 0 })
  outboundQty: number;

  @Column({ name: 'released_qty', type: 'numeric', precision: 18, scale: 2, default: 0 })
  releasedQty: number;

  @Column({ name: 'reservation_ledger_id', type: 'integer', unique: true })
  reservationLedgerId: number;

  @Column({ name: 'created_by', type: 'varchar', length: 100 })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
