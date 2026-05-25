import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 采购申请明细  prc2_request_items */
@Entity('prc2_request_items')
export class Prc2RequestItemEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'request_id', type: 'bigint' })
  requestId: string;

  /** ── 多项目维度（允许每行归属不同项目） ── */
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

  @Column({ name: 'qty', type: 'numeric', precision: 18, scale: 4, default: 0 })
  qty: number;

  @Column({ name: 'unit', type: 'varchar', length: 20, nullable: true })
  unit: string;

  @Column({ name: 'estimated_unit_price', type: 'numeric', precision: 18, scale: 4, default: 0 })
  estimatedUnitPrice: number;

  @Column({ name: 'estimated_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  estimatedAmount: number;

  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
  warehouseCode: string;

  @Column({ name: 'usage_desc', type: 'text', nullable: true })
  usageDesc: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
