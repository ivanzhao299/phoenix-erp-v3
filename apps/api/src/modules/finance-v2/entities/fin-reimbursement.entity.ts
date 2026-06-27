import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 报销台账  fin_reimbursements
 *
 * Finance V2 Phase 5 — Reimbursement Runtime
 *
 * 由 Expense 审批通过后自动生成（onApproved 回调）。
 *
 * status 状态机：
 *   PENDING → PENDING_APPROVAL → APPROVED → PAID
 *   PENDING → APPROVED → PAID  （金额小，无需二次审批）
 *   PENDING / APPROVED → CANCELLED
 */
@Entity('fin_reimbursements')
@Index('idx_fin_reimb_expense', ['expenseRequestId'])
@Index('idx_fin_reimb_company_status', ['companyCode', 'status'])
export class FinReimbursementEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'reimb_no', type: 'varchar', length: 64, unique: true })
  reimbNo: string;

  // ── 关联费用申请 ──────────────────────────────────────────────────────────
  @Column({ name: 'expense_request_id', type: 'bigint' })
  expenseRequestId: string;

  @Column({ name: 'expense_no', type: 'varchar', length: 64 })
  expenseNo: string;

  // ── 员工 / 公司 ──────────────────────────────────────────────────────────
  @Column({ name: 'employee_id', type: 'bigint', nullable: true })
  employeeId: string | null;

  @Column({ name: 'employee_name', type: 'varchar', length: 128 })
  employeeName: string;

  @Column({ name: 'company_code', type: 'varchar', length: 32 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 128, nullable: true })
  companyName: string | null;

  // ── 金额 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'CNY' })
  currencyCode: string;

  @Column({ name: 'reimb_amount_original', type: 'numeric', precision: 18, scale: 2 })
  reimbAmountOriginal: string;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 8, default: 1 })
  exchangeRate: string;

  @Column({ name: 'reimb_amount_base', type: 'numeric', precision: 18, scale: 2 })
  reimbAmountBase: string;

  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
  baseCurrency: string;

  // ── 付款信息（pay() 时填入）────────────────────────────────────────────
  @Column({ name: 'cash_account_id', type: 'bigint', nullable: true })
  cashAccountId: string | null;

  @Column({ name: 'cash_account_code', type: 'varchar', length: 64, nullable: true })
  cashAccountCode: string | null;

  @Column({ name: 'payment_txn_id', type: 'bigint', nullable: true })
  paymentTxnId: string | null;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status: string;

  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string | null;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
