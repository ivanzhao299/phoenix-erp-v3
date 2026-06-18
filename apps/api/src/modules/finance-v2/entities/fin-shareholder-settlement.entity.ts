import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 股东出资还款/核销记录  fin_shareholder_settlements
 *
 * Finance V2 Phase 4 — Shareholder Runtime
 *
 * settlement_type: RETURN | OFFSET | TRANSFER | WRITE_OFF
 * status:          DRAFT → PENDING_APPROVAL → APPROVED → SETTLED | CANCELLED
 */
@Entity('fin_shareholder_settlements')
@Index('idx_fin_sh_settle_contrib', ['contributionId', 'status'])
export class FinShareholderSettlementEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'settlement_no', type: 'varchar', length: 60, unique: true })
  settlementNo: string;

  // ── 关联出资 ─────────────────────────────────────────────────────────────
  @Column({ name: 'contribution_id', type: 'bigint' })
  contributionId: string;

  @Column({ name: 'contribution_no', type: 'varchar', length: 60 })
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

  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string | null;

  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
  projectName: string | null;

  // ── 还款类型 ─────────────────────────────────────────────────────────────
  /** RETURN | OFFSET | TRANSFER | WRITE_OFF */
  @Column({ name: 'settlement_type', type: 'varchar', length: 30 })
  settlementType: string;

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

  // ── 现金账户 ─────────────────────────────────────────────────────────────
  @Column({ name: 'cash_account_id', type: 'bigint', nullable: true })
  cashAccountId: string | null;

  @Column({ name: 'cash_account_code', type: 'varchar', length: 60, nullable: true })
  cashAccountCode: string | null;

  // ── 流水关联 ─────────────────────────────────────────────────────────────
  @Column({ name: 'out_txn_id', type: 'bigint', nullable: true })
  outTxnId: string | null;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  /** DRAFT | PENDING_APPROVAL | APPROVED | SETTLED | CANCELLED */
  @Column({ name: 'status', type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

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
