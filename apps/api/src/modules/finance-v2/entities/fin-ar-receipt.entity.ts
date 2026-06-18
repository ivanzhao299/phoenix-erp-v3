import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 收款记录  fin_ar_receipts
 *
 * Finance V2 Phase 2 — AR Runtime
 *
 * 状态机：
 *   DRAFT → CONFIRMED（confirm() 时写核销分摊，更新 AR 状态）
 *   DRAFT → CANCELLED
 *   CONFIRMED 暂不允许取消（Phase 3 再支持冲销）
 *
 * 一笔收款可通过 fin_ar_receipt_allocations 分摊到多个 AR。
 */
@Entity('fin_ar_receipts')
@Index('idx_fin_ar_receipts_company', ['companyCode', 'status'])
@Index('idx_fin_ar_receipts_customer', ['customerCode'], { where: '"customer_code" IS NOT NULL' })
// idx_fin_ar_rec_sal_cust 跳过:DB 列 sal_customer_id 在 entity 缺(g197 真业务漂移)
export class FinArReceiptEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'receipt_no', type: 'varchar', length: 60, unique: true })
  receiptNo: string;

  // ── 公司维度 ─────────────────────────────────────────────────────────────
  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string | null;

  // ── 项目维度 ─────────────────────────────────────────────────────────────
  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string | null;

  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
  projectName: string | null;

  // ── 客户 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'customer_id', type: 'bigint', nullable: true })
  customerId: string | null;

  @Column({ name: 'customer_code', type: 'varchar', length: 64, nullable: true })
  customerCode: string | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 256 })
  customerName: string;

  // ── 收款信息 ─────────────────────────────────────────────────────────────
  @Column({ name: 'receipt_date', type: 'date' })
  receiptDate: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'CNY' })
  currencyCode: string;

  @Column({ name: 'amount_original', type: 'numeric', precision: 18, scale: 2 })
  amountOriginal: number;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 8, default: 1 })
  exchangeRate: number;

  @Column({ name: 'amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountBase: number;

  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
  baseCurrency: string;

  // ── 收款渠道 ─────────────────────────────────────────────────────────────
  @Column({ name: 'receipt_method', type: 'varchar', length: 40, nullable: true })
  receiptMethod: string | null;

  @Column({ name: 'received_account_code', type: 'varchar', length: 100, nullable: true })
  receivedAccountCode: string | null;

  @Column({ name: 'bank_ref', type: 'varchar', length: 100, nullable: true })
  bankRef: string | null;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  /** DRAFT / CONFIRMED / CANCELLED */
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  // ── 关联 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string | null;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 80, nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'varchar', length: 80, nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
