import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
} from 'typeorm';

/**
 * 资金流水  fin_cash_transactions
 *
 * Finance V2 Phase 3 — Cash Runtime 正式启用
 *
 * 设计原则：
 *   - Append-only：不允许修改任何历史流水
 *   - amount 恒为正数，方向由 direction (IN/OUT) 决定
 *   - balance_after 是本条流水发生后的账户余额快照
 *   - 余额更新必须与流水写入在同一事务内完成
 *
 * 来源类型（source_type）：
 *   AP_PAYMENT  — AP 应付付款
 *   AR_RECEIPT  — AR 应收收款
 *   TRANSFER    — 账户间转账
 *   SHAREHOLDER — 股东资金
 *   MANUAL      — 手工录入
 *   OPENING     — 期初余额
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

  @Column({ name: 'account_code', type: 'varchar', length: 60 })
  accountCode: string;

  @Column({ name: 'account_name', type: 'varchar', length: 200 })
  accountName: string;

  // ── 公司维度 ─────────────────────────────────────────────────────────────
  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string | null;

  // ── 方向与金额 ────────────────────────────────────────────────────────────
  /** IN / OUT */
  @Column({ name: 'direction', type: 'varchar', length: 8 })
  direction: string;

  /** AP_PAYMENT / AR_RECEIPT / TRANSFER / SHAREHOLDER / MANUAL / OPENING */
  @Column({ name: 'source_type', type: 'varchar', length: 30, nullable: true })
  sourceType: string | null;

  @Column({ name: 'source_id', type: 'bigint', nullable: true })
  sourceId: string | null;

  @Column({ name: 'source_no', type: 'varchar', length: 80, nullable: true })
  sourceNo: string | null;

  @Column({ name: 'currency_code', type: 'varchar', length: 8 })
  currencyCode: string;

  /** 恒为正数，方向由 direction 决定 */
  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2 })
  amount: number;

  /** 本条流水后账户余额快照（Append-only，不可修改） */
  @Column({ name: 'balance_after', type: 'numeric', precision: 18, scale: 2 })
  balanceAfter: number;

  @Column({ name: 'txn_date', type: 'timestamptz', default: () => 'now()' })
  txnDate: Date;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 80, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
