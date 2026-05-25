import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 收货明细  prc2_receipt_items
 *  说明：每行可归属不同项目（支持一批货物分配到多个工厂/项目场景） */
@Entity('prc2_receipt_items')
export class Prc2ReceiptItemEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'receipt_id', type: 'bigint' })
  receiptId: string;

  @Column({ name: 'po_item_id', type: 'bigint', nullable: true })
  poItemId: string;

  /** ── 多项目维度（行级快照） ── */
  @Column({ name: 'project_id', type: 'bigint', nullable: true })
  projectId: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string;

  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
  projectName: string;

  @Column({ name: 'item_code', type: 'varchar', length: 64, nullable: true })
  itemCode: string;

  @Column({ name: 'item_name', type: 'varchar', length: 256 })
  itemName: string;

  @Column({ name: 'spec', type: 'text', nullable: true })
  spec: string;

  @Column({ name: 'expected_qty', type: 'numeric', precision: 18, scale: 4, default: 0 })
  expectedQty: number;

  @Column({ name: 'actual_qty', type: 'numeric', precision: 18, scale: 4, default: 0 })
  actualQty: number;

  @Column({ name: 'rejected_qty', type: 'numeric', precision: 18, scale: 4, default: 0 })
  rejectedQty: number;

  @Column({ name: 'unit', type: 'varchar', length: 20, nullable: true })
  unit: string;

  @Column({ name: 'quality_status', type: 'varchar', length: 32, nullable: true })
  qualityStatus: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
