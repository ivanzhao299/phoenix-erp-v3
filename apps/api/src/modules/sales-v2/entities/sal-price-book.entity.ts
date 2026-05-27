import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
} from 'typeorm';

/**
 * 价格册  sal_price_books
 *
 * Sales V2 Phase 0 — Clean Baseline
 *
 * 取代旧表（均已冻结）：
 *   ord_prices      — Sales 管理入口，无 SalesEngine 引用
 *   prc_price_items — Procurement 表，被 SalesEngine 错误引用
 *   DEFAULT_PRICES  — 移动端硬编码，Phase 9 删除
 *
 * status: DRAFT / PENDING_APPROVAL / APPROVED / ACTIVE / EXPIRED / CANCELLED
 * wf_instance_id: Workflow 2.0 价格变更审批（Phase 2 接入）
 */
@Entity('sal_price_books')
export class SalPriceBookEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'price_book_no', type: 'varchar', length: 64, unique: true })
  priceBookNo: string;

  @Column({ name: 'price_book_name', type: 'varchar', length: 256 })
  priceBookName: string;

  @Column({ name: 'channel_code', type: 'varchar', length: 64, nullable: true })
  channelCode: string | null;

  @Column({ name: 'customer_code', type: 'varchar', length: 64, nullable: true })
  customerCode: string | null;

  @Column({ name: 'effective_from', type: 'date', nullable: true })
  effectiveFrom: string | null;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 128, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
