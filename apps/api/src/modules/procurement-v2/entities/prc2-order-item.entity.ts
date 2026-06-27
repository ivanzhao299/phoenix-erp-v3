import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 采购订单明细  prc2_order_items
 *  说明：每行可归属不同项目（支持一张PO跨项目采购场景） */
@Entity('prc2_order_items')
@Index('idx_prc2_poi_po_id', ['poId'])
@Index('idx_prc2_poi_project', ['projectCode'], { where: '"project_code" IS NOT NULL' })
@Index('idx_prc2_order_items_product', ['productCode'], { where: '"product_code" IS NOT NULL' })
export class Prc2OrderItemEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'po_id', type: 'bigint' })
  poId: string;

  @Column({ name: 'po_no', type: 'varchar', length: 80 })
  poNo: string;

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

  // G85-C 物料 SKU 化补全：选 SKU 时带出，成本可按产品/等级归集
  @Column({ name: 'product_code', type: 'varchar', length: 64, nullable: true })
  productCode: string;

  @Column({ name: 'grade_code', type: 'varchar', length: 64, nullable: true })
  gradeCode: string;

  @Column({ name: 'qty', type: 'numeric', precision: 18, scale: 4, default: 0 })
  qty: number;

  @Column({ name: 'received_qty', type: 'numeric', precision: 18, scale: 4, default: 0 })
  receivedQty: number;

  @Column({ name: 'unit', type: 'varchar', length: 20, nullable: true })
  unit: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 4, default: 0 })
  unitPrice: number;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amount: number;

  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
  warehouseCode: string;

  @Column({ name: 'usage_desc', type: 'text', nullable: true })
  usageDesc: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
