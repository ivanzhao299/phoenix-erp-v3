import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * 资金流水  fin_cash_transactions
 *
 * Finance V2 Phase 0 Clean Baseline
 * Phase 3 正式启用（当前为空表）
 *
 * 每一笔资金进出均记录一条流水，驱动 fin_cash_accounts.current_balance 更新。
 * 不可修改（Append-only），更正使用反向冲销条目。
 */
@Entity('fin_cash_transactions')
export class FinCashTransactionEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'txn_no', type: 'varchar', length: 60, unique: true })
  txnNo: string;

  // ── 账户 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'account_id', type: 'bigint' })
  accountId: string;

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

  // ── 流水信息 ─────────────────────────────────────────────────────────────
  @Column({ name: 'txn_date', type: 'date' })
  txnDate: string;

  /** IN / OUT / TRANSFER_IN / TRANSFER_OUT / ADJUSTMENT */
  @Column({ name: 'txn_type', type: 'varchar', length: 30 })
  txnType: string;

  // ── 金额三段式 ───────────────────────────────────────────────────────────
  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'CNY' })
  currencyCode: string;

  /** 正数=收入，负数=支出 */
  @Column({ name: 'amount_original', type: 'numeric', precision: 18, scale: 2 })
  amountOriginal: number;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 8, default: 1 })
  exchangeRate: number;

  @Column({ name: 'amount_base', type: 'numeric', precision: 18, scale: 2 })
  amountBase: number;

  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
  baseCurrency: string;

  /** 流水发生后的账户余额快照 */
  @Column({ name: 'balance_after', type: 'numeric', precision: 18, scale: 2 })
  balanceAfter: number;

  // ── 关联来源 ─────────────────────────────────────────────────────────────
  /** AP_PAYMENT / AR_RECEIPT / TRANSFER / ADJUSTMENT */
  @Column({ name: 'reference_type', type: 'varchar', length: 40, nullable: true })
  referenceType: string;

  @Column({ name: 'reference_id', type: 'bigint', nullable: true })
  referenceId: string;

  @Column({ name: 'reference_no', type: 'varchar', length: 80, nullable: true })
  referenceNo: string;

  /** 银行流水号/凭证号 */
  @Column({ name: 'bank_reference', type: 'varchar', length: 100, nullable: true })
  bankReference: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'created_by', type: 'varchar', length: 80, nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
