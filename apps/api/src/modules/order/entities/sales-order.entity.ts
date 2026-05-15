import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index } from 'typeorm';

/**
 * 销售订单表 V3 — 对齐 ord_orders（迁移自 biz_sales_order）
 * 历史数据已通过 migrations/run_full_v3.js 迁移到 ord_orders
 */
@Entity('ord_orders')
@Index('idx_ord_orders_store',    ['store_code'])
@Index('idx_ord_orders_customer', ['customer_id'])
@Index('idx_ord_orders_status',   ['status'])
export class SalesOrderEntity {

  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  order_id: number;

  // BaseBizEntity 里的 id 别名，让 orderRepo.findOne({ where: { id } }) 继续可用
  get id(): number { return this.order_id; }

  @Column({ type: 'varchar', length: 64, unique: true, comment: '订单号' })
  order_no: string;

  @Column({ type: 'bigint', comment: '客户ID' })
  customer_id: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, comment: '订单总金额' })
  total_amount: number;

  @Column({ type: 'varchar', length: 8, default: 'CNY', comment: '币种' })
  currency_code: string;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT', comment: '单据状态' })
  status: string;

  @Column({ type: 'varchar', length: 64, default: 'ALL', comment: '数据隔离字段' })
  store_code: string;

  @Column({ type: 'varchar', length: 64, default: 'ALL', comment: '创建机构' })
  created_store_code: string;

  @Column({ type: 'bigint', nullable: true, comment: '创建人ID' })
  created_by: number;

  @Column({ type: 'bigint', nullable: true, comment: '最后修改人ID' })
  updated_by: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deleted_at: Date;

  @Column({ type: 'text', nullable: true, comment: '备注说明' })
  note: string;
}

