import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 应付发票台账  fin_ap_invoices
 *
 * Finance V2 Phase 1 — AP Runtime 正式启用
 *
 * 来源类型（source_type）：
 *   PO            — 从采购 PO / prc2_ap_ledger 导入
 *   MANUAL        — 财务手工录入
 *   EXPENSE       — 费用报销（Phase 3）
 *   REIMBURSEMENT — 报销（Phase 3）
 *   OPENING       — 期初余额导入
 *
 * 状态机：
 *   OPEN → PARTIALLY_PAID → PAID
 *   OPEN → DISPUTED
 *   OPEN / PARTIALLY_PAID → CANCELLED（未全额付款可取消）
 *
 * 付款状态（payment_status，冗余便于查询）：
 *   UNPAID → PARTIAL → PAID
 */
@Entity('fin_ap_invoices')
@Index('idx_fin_ap_company_status', ['companyCode', 'status'])
@Index('idx_fin_ap_supplier_status', ['supplierCode', 'status'], { where: '"supplier_code" IS NOT NULL' })
@Index('idx_fin_ap_due_date', ['dueDate'], { where: '"due_date" IS NOT NULL' })
export class FinApInvoiceEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'ap_no', type: 'varchar', length: 60, unique: true })
  apNo: string;

  // ── 来源追踪 ─────────────────────────────────────────────────────────────
  /** PO / MANUAL / EXPENSE / REIMBURSEMENT / OPENING */
  @Column({ name: 'source_type', type: 'varchar', length: 30, default: 'MANUAL' })
  sourceType: string;

  @Column({ name: 'source_id', type: 'bigint', nullable: true })
  sourceId: string | null;

  @Column({ name: 'source_no', type: 'varchar', length: 80, nullable: true })
  sourceNo: string | null;

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

  // ── 供应商 ───────────────────────────────────────────────────────────────
  @Column({ name: 'supplier_id', type: 'bigint', nullable: true })
  supplierId: string | null;

  @Column({ name: 'supplier_code', type: 'varchar', length: 64, nullable: true })
  supplierCode: string | null;

  @Column({ name: 'supplier_name', type: 'varchar', length: 256 })
  supplierName: string;

  // ── 发票信息 ─────────────────────────────────────────────────────────────
  @Column({ name: 'invoice_no', type: 'varchar', length: 100, nullable: true })
  invoiceNo: string | null;

  @Column({ name: 'invoice_date', type: 'date', nullable: true })
  invoiceDate: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

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

  // ── 付款进度 ─────────────────────────────────────────────────────────────
  @Column({ name: 'paid_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  paidAmountOriginal: number;

  @Column({ name: 'paid_amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  paidAmountBase: number;

  @Column({ name: 'balance_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  balanceAmountOriginal: number;

  @Column({ name: 'balance_amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  balanceAmountBase: number;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  /** OPEN / PARTIALLY_PAID / PAID / DISPUTED / CANCELLED */
  @Column({ name: 'status', type: 'varchar', length: 32, default: 'OPEN' })
  status: string;

  /** UNPAID / PARTIAL / PAID */
  @Column({ name: 'payment_status', type: 'varchar', length: 20, default: 'UNPAID' })
  paymentStatus: string;

  // ── 税费 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  taxAmount: number | null;

  @Column({ name: 'tax_rate', type: 'numeric', precision: 8, scale: 4, nullable: true })
  taxRate: number | null;

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
