import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 股东出资 / 代付台账  fin_shareholder_contributions
 *
 * Finance V2 Phase 0 Clean Baseline
 * Phase 4 正式启用（当前为空表）
 *
 * 复用 prc2_shareholder_funds 设计样板，迁移至 Finance V2 领域。
 * 记录股东的出资、借款、代付等各类资金投入，并通过
 * fin_shareholder_settlements 追踪偿还进度。
 */
@Entity('fin_shareholder_contributions')
export class FinShareholderContributionEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'contribution_no', type: 'varchar', length: 60, unique: true })
  contributionNo: string;

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

  // ── 股东 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'shareholder_code', type: 'varchar', length: 64 })
  shareholderCode: string;

  @Column({ name: 'shareholder_name', type: 'varchar', length: 200 })
  shareholderName: string;

  // ── 资金类型 ─────────────────────────────────────────────────────────────
  /** EQUITY / LOAN / ADVANCE_PAYMENT / GUARANTEE */
  @Column({ name: 'contribution_type', type: 'varchar', length: 40 })
  contributionType: string;

  // ── 日期 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'contribution_date', type: 'date' })
  contributionDate: string;

  @Column({ name: 'maturity_date', type: 'date', nullable: true })
  maturityDate: string;

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

  // ── 偿还进度 ─────────────────────────────────────────────────────────────
  @Column({ name: 'settled_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  settledAmount: number;

  @Column({ name: 'balance_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  balanceAmount: number;

  // ── 利息 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'interest_rate', type: 'numeric', precision: 8, scale: 4, nullable: true })
  interestRate: number;

  /** SIMPLE / COMPOUND */
  @Column({ name: 'interest_type', type: 'varchar', length: 20, nullable: true })
  interestType: string;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  /** ACTIVE / PARTIALLY_SETTLED / SETTLED / VOID */
  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string;

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
