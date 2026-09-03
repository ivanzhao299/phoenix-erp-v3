import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('sal_order_item_batch_allocation_actions')
@Unique('uq_sal_batch_alloc_action_key', ['allocationId', 'actionType', 'actionKey'])
@Check('ck_sal_batch_alloc_action_type', "action_type IN ('OUTBOUND','RELEASED')")
@Check('ck_sal_batch_alloc_action_qty', 'qty > 0')
@Index('idx_sal_batch_alloc_action_allocation', ['allocationId'])
@Index('uq_sal_batch_alloc_outbound_fact', ['deliveryOrderId', 'salesOrderId', 'allocationId'], {
  unique: true,
  where: `"action_type"='OUTBOUND' AND "delivery_order_id" IS NOT NULL`,
})
export class SalOrderItemBatchAllocationActionEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'allocation_id', type: 'bigint' })
  allocationId: string;

  @Column({ name: 'sales_order_id', type: 'bigint' })
  salesOrderId: string;

  @Column({ name: 'delivery_order_id', type: 'bigint', nullable: true })
  deliveryOrderId: string | null;

  @Column({ name: 'action_type', type: 'varchar', length: 16 })
  actionType: 'OUTBOUND' | 'RELEASED';

  @Column({ name: 'action_key', type: 'varchar', length: 120 })
  actionKey: string;

  @Column({ name: 'qty', type: 'numeric', precision: 18, scale: 2 })
  qty: number;

  @Column({ name: 'ledger_id', type: 'integer', unique: true })
  ledgerId: number;

  @Column({ name: 'created_by', type: 'varchar', length: 100 })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
