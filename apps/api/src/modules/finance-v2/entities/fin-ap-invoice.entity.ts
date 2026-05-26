import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 应付发票台账  fin_ap_invoices
 *
 * Finance V2 Phase 0 Clean Baseline
 * Phase 1 正式启用（当前为空表，数据通过 AP Workflow Runtime 写入）
 *
 * 金额三段式：
 *   amount_original  — 原币金额
 *   exchange_rate    — 汇率（对 base_currency）
 *   amount_base      — 折算本位币金额（CNY）
 */
@Entity('fin_ap_invoices')
export class FinApInvoiceEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** AP 编号（系统生成，格式：AP-YYYYMM-XXXXX） */
  @Column({ name: 'ap_no', type: 'varchar', length: 60, unique: true })
  apNo: string;

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

  // ── 供应商 ───────────────────────────────────────────────────────────────
  @Column({ name: 'supplier_code', type: 'varchar', length: 64 })
  supplierCode: string;

  @Column({ name: 'supplier_name', type: 'varchar', length: 256, nullable: true })
  supplierName: string;

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

  // ── 核销 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'paid_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  paidAmountOriginal: number;

  @Column({ name: 'balance_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  balanceAmountOriginal: number;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  /** DRAFT / OPEN / PARTIAL / PAID / OVERDUE / VOID */
  @Column({ name: 'status', type: 'varchar', length: 32, default: 'OPEN' })
  status: string;

  // ── 关联 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'po_no', type: 'varchar', length: 80, nullable: true })
  poNo: string;

  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string;

  // ── 其他 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  taxAmount: number;

  @Column({ name: 'tax_rate', type: 'numeric', precision: 8, scale: 4, nullable: true })
  taxRate: number;

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
