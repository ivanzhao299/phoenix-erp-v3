import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 价格册  sal_price_books
 *
 * Sales V2 Phase 2 — Price Runtime
 *
 * 取代旧表（均已冻结 READ_ONLY）：
 *   ord_prices      — 无 SalesEngine 引用，无审批
 *   prc_price_items — Procurement 表，被 SalesEngine 错误引用（已切换）
 *   DEFAULT_PRICES  — 移动端硬编码（Phase 2 切换为动态 API）
 *
 * 匹配优先级（resolvePrice）：
 *   1. customer_code 精确匹配（最高优先）
 *   2. channel_code 匹配
 *   3. 默认价格册（customer_code 和 channel_code 均为 NULL）
 *   4. priority 数字越小越优先
 *
 * status: DRAFT / PENDING_APPROVAL / APPROVED / ACTIVE / EXPIRED / CANCELLED
 */
@Entity('sal_price_books')
@Index('idx_sal_price_books_company', ['companyCode'])
@Index('idx_sal_price_books_status', ['status'])
@Index('idx_sal_price_books_customer', ['customerCode'], { where: '"customer_code" IS NOT NULL' })
@Index('idx_sal_price_books_channel', ['channelCode'], { where: '"channel_code" IS NOT NULL' })
@Index('idx_sal_price_books_priority', ['companyCode', 'status', 'priority'])
export class SalPriceBookEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'price_book_no', type: 'varchar', length: 64, unique: true })
  priceBookNo: string;

  @Column({ name: 'price_book_name', type: 'varchar', length: 256 })
  priceBookName: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string | null;

  @Column({ name: 'store_code', type: 'varchar', length: 64, nullable: true })
  storeCode: string | null;

  @Column({ name: 'channel_code', type: 'varchar', length: 64, nullable: true })
  channelCode: string | null;

  @Column({ name: 'customer_code', type: 'varchar', length: 64, nullable: true })
  customerCode: string | null;

  @Column({ name: 'priority', type: 'integer', default: 100 })
  priority: number;

  @Column({ name: 'publish_version', type: 'integer', default: 0 })
  publishVersion: number;

  @Column({ name: 'effective_from', type: 'date', nullable: true })
  effectiveFrom: string | null;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string | null;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 128, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
