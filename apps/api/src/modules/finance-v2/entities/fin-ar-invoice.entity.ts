import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 应收发票台账  fin_ar_invoices
 *
 * Finance V2 Phase 2 — AR Runtime 正式启用
 *
 * 来源类型（source_type）：
 *   SALES_ORDER — 销售订单自动生成（Phase 3）
 *   MANUAL      — 财务手工录入
 *   CONTRACT    — 合同应收
 *   OPENING     — 期初余额导入
 *
 * 状态机：
 *   OPEN → PARTIALLY_RECEIVED → RECEIVED
 *   OPEN → OVERDUE（到期未收自动标记，后台任务）
 *   OPEN / PARTIALLY_RECEIVED → DISPUTED
 *   OPEN / PARTIALLY_RECEIVED → CANCELLED（未收款可取消）
 *   OVERDUE → WRITTEN_OFF（核销坏账，Phase 3）
 *
 * 收款状态（collection_status，冗余便于查询）：
 *   UNRECEIVED → PARTIAL → RECEIVED
 */
@Entity('fin_ar_invoices')
@Index('idx_fin_ar_company_status', ['companyCode', 'status'])
@Index('idx_fin_ar_customer_status', ['customerCode', 'status'], { where: '"customer_code" IS NOT NULL' })
@Index('idx_fin_ar_due_date', ['dueDate'], { where: '"due_date" IS NOT NULL' })
@Index('idx_fin_ar_source_no', ['sourceNo'], { where: '"source_no" IS NOT NULL' })
// idx_fin_ar_inv_sal_cust 跳过:DB 列 sal_customer_id 在 entity 缺(g197 真业务漂移)
export class FinArInvoiceEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'ar_no', type: 'varchar', length: 60, unique: true })
  arNo: string;

  // ── 来源追踪 ─────────────────────────────────────────────────────────────
  /** SALES_ORDER / MANUAL / CONTRACT / OPENING */
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

  // ── 客户 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'customer_id', type: 'bigint', nullable: true })
  customerId: string | null;

  @Column({ name: 'customer_code', type: 'varchar', length: 64, nullable: true })
  customerCode: string | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 256 })
  customerName: string;

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

  // ── 收款进度 ─────────────────────────────────────────────────────────────
  @Column({ name: 'received_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  receivedAmountOriginal: number;

  @Column({ name: 'received_amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  receivedAmountBase: number;

  @Column({ name: 'balance_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  balanceAmountOriginal: number;

  @Column({ name: 'balance_amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  balanceAmountBase: number;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  /** OPEN / PARTIALLY_RECEIVED / RECEIVED / OVERDUE / DISPUTED / WRITTEN_OFF / CANCELLED */
  @Column({ name: 'status', type: 'varchar', length: 32, default: 'OPEN' })
  status: string;

  /** UNRECEIVED / PARTIAL / RECEIVED */
  @Column({ name: 'collection_status', type: 'varchar', length: 20, default: 'UNRECEIVED' })
  collectionStatus: string;

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
