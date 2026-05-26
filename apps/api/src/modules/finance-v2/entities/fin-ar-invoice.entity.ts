import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 应收发票台账  fin_ar_invoices
 *
 * Finance V2 Phase 0 Clean Baseline
 * Phase 2 正式启用（当前为空表）
 */
@Entity('fin_ar_invoices')
export class FinArInvoiceEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** AR 编号（格式：AR-YYYYMM-XXXXX） */
  @Column({ name: 'ar_no', type: 'varchar', length: 60, unique: true })
  arNo: string;

  // ── 公司维度 ─────────────────────────────────────────────────────────────
  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string;

  // ── 项目维度 ─────────────────────────────────────────────────────────────
  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string;

  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
  projectName: string;

  // ── 客户 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'customer_code', type: 'varchar', length: 64 })
  customerCode: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 256, nullable: true })
  customerName: string;

  // ── 发票信息 ─────────────────────────────────────────────────────────────
  @Column({ name: 'invoice_no', type: 'varchar', length: 100, nullable: true })
  invoiceNo: string;

  @Column({ name: 'invoice_date', type: 'date' })
  invoiceDate: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string;

  // ── 金额三段式 ───────────────────────────────────────────────────────────
  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'CNY' })
  currencyCode: string;

  @Column({ name: 'amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountOriginal: number;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 8, default: 1 })
  exchangeRate: number;

  @Column({ name: 'amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountBase: number;

  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
  baseCurrency: string;

  // ── 收款核销 ─────────────────────────────────────────────────────────────
  @Column({ name: 'received_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  receivedAmountOriginal: number;

  @Column({ name: 'balance_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  balanceAmountOriginal: number;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  /** DRAFT / OPEN / PARTIAL / RECEIVED / OVERDUE / VOID */
  @Column({ name: 'status', type: 'varchar', length: 32, default: 'OPEN' })
  status: string;

  // ── 关联 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'order_no', type: 'varchar', length: 80, nullable: true })
  orderNo: string;

  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  taxAmount: number;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'varchar', length: 80, nullable: true })
  createdBy: string;

  @Column({ name: 'updated_by', type: 'varchar', length: 80, nullable: true })
  updatedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
