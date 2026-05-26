import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 费用申请台账  fin_expense_requests
 *
 * Finance V2 Phase 5 — Expense Runtime
 *
 * expense_type: TRAVEL / MEAL / ENTERTAINMENT / OFFICE / MATERIAL / TRANSPORT / OTHER
 *
 * status 状态机：
 *   DRAFT → PENDING_APPROVAL → APPROVED → REIMBURSED
 *                            → REJECTED → CANCELLED
 *   DRAFT → CANCELLED
 */
@Entity('fin_expense_requests')
export class FinExpenseRequestEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'expense_no', type: 'varchar', length: 64, unique: true })
  expenseNo: string;

  // ── 申请人 ───────────────────────────────────────────────────────────────
  @Column({ name: 'requester_id', type: 'bigint', nullable: true })
  requesterId: string | null;

  @Column({ name: 'requester_name', type: 'varchar', length: 128, nullable: true })
  requesterName: string | null;

  // ── 公司 / 项目 ──────────────────────────────────────────────────────────
  @Column({ name: 'company_code', type: 'varchar', length: 32 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 128, nullable: true })
  companyName: string | null;

  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string | null;

  @Column({ name: 'project_name', type: 'varchar', length: 128, nullable: true })
  projectName: string | null;

  // ── 费用类型与金额 ────────────────────────────────────────────────────────
  @Column({ name: 'expense_type', type: 'varchar', length: 32 })
  expenseType: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'CNY' })
  currencyCode: string;

  @Column({ name: 'amount_original', type: 'numeric', precision: 18, scale: 2 })
  amountOriginal: string;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 8, default: 1 })
  exchangeRate: string;

  @Column({ name: 'amount_base', type: 'numeric', precision: 18, scale: 2 })
  amountBase: string;

  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
  baseCurrency: string;

  // ── 费用详情 ─────────────────────────────────────────────────────────────
  @Column({ name: 'expense_date', type: 'date', nullable: true })
  expenseDate: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'attachment_urls', type: 'jsonb', nullable: true })
  attachmentUrls: string[] | null;

  // ── Workflow 关联 ────────────────────────────────────────────────────────
  @Column({ name: 'form_submission_id', type: 'bigint', nullable: true })
  formSubmissionId: string | null;

  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string | null;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
