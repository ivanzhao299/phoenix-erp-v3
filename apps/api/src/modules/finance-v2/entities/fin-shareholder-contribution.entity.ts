import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 股东出资 / 代付台账  fin_shareholder_contributions
 *
 * Finance V2 Phase 4 — Shareholder Runtime 正式启用
 *
 * contribution_type: INVESTMENT | LOAN | ADVANCE | GUARANTEE | PAYMENT_ON_BEHALF
 * source_type:       MANUAL | PAYMENT | OPENING | IMPORT
 * status:            DRAFT → PENDING_CONFIRM → CONFIRMED → PARTIALLY_SETTLED → SETTLED | CANCELLED
 */
@Entity('fin_shareholder_contributions')
@Index('idx_fin_sh_contrib_company', ['companyCode', 'status'])
export class FinShareholderContributionEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'contribution_no', type: 'varchar', length: 60, unique: true })
  contributionNo: string;

  // ── 股东 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'shareholder_id', type: 'bigint', nullable: true })
  shareholderId: string | null;

  @Column({ name: 'shareholder_code', type: 'varchar', length: 64, nullable: true })
  shareholderCode: string | null;

  @Column({ name: 'shareholder_name', type: 'varchar', length: 200 })
  shareholderName: string;

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

  // ── 来源 ─────────────────────────────────────────────────────────────────
  /** MANUAL | PAYMENT | OPENING | IMPORT */
  @Column({ name: 'source_type', type: 'varchar', length: 30, default: 'MANUAL' })
  sourceType: string;

  @Column({ name: 'source_id', type: 'bigint', nullable: true })
  sourceId: string | null;

  @Column({ name: 'source_no', type: 'varchar', length: 80, nullable: true })
  sourceNo: string | null;

  // ── 资金类型 ─────────────────────────────────────────────────────────────
  /** INVESTMENT | LOAN | ADVANCE | GUARANTEE | PAYMENT_ON_BEHALF */
  @Column({ name: 'contribution_type', type: 'varchar', length: 40 })
  contributionType: string;

  @Column({ name: 'fund_nature', type: 'varchar', length: 40, nullable: true })
  fundNature: string | null;

  // ── 金额三段式 ───────────────────────────────────────────────────────────
  @Column({ name: 'currency_code', type: 'varchar', length: 8 })
  currencyCode: string;

  @Column({ name: 'amount_original', type: 'numeric', precision: 18, scale: 2 })
  amountOriginal: number;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 8, default: 1 })
  exchangeRate: number;

  @Column({ name: 'amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountBase: number;

  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
  baseCurrency: string;

  // ── 偿还进度 ─────────────────────────────────────────────────────────────
  @Column({ name: 'settled_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  settledAmountOriginal: number;

  @Column({ name: 'settled_amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  settledAmountBase: number;

  @Column({ name: 'balance_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  balanceAmountOriginal: number;

  @Column({ name: 'balance_amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  balanceAmountBase: number;

  // ── 利息 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'expected_return_date', type: 'date', nullable: true })
  expectedReturnDate: string | null;

  @Column({ name: 'interest_rate', type: 'numeric', precision: 8, scale: 4, nullable: true })
  interestRate: number | null;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  /** DRAFT | PENDING_CONFIRM | CONFIRMED | PARTIALLY_SETTLED | SETTLED | CANCELLED */
  @Column({ name: 'status', type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string | null;

  @Column({ name: 'cash_account_id', type: 'bigint', nullable: true })
  cashAccountId: string | null;

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
