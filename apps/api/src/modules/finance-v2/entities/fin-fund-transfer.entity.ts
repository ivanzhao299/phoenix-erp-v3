import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 账户间资金转账  fin_fund_transfers
 *
 * Finance V2 Phase 3 — Cash Runtime
 *
 * 状态机：
 *   DRAFT → PENDING_APPROVAL（submit 时）
 *   PENDING_APPROVAL → APPROVED（审批通过）
 *   PENDING_APPROVAL → CANCELLED（审批拒绝或人工取消）
 *   APPROVED → EXECUTED（执行，写两条流水 + 更新余额，全事务）
 *   DRAFT → CANCELLED（未提交可直接取消）
 *
 * 金额规则：
 *   - amount_original 恒为正数
 *   - 同币种转账：exchange_rate = 1
 *   - 跨币种转账：amount_base 由调用方换算
 *
 * 安全：
 *   - from_account ≠ to_account（DDL CHECK）
 *   - execute() 必须校验 from_account 余额充足
 *   - execute() 全事务（QueryRunner SERIALIZABLE）
 *   - EXECUTED / CANCELLED 不可再变更
 */
@Entity('fin_fund_transfers')
export class FinFundTransferEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'transfer_no', type: 'varchar', length: 60, unique: true })
  transferNo: string;

  // ── 转出账户 ──────────────────────────────────────────────────────────────
  @Column({ name: 'from_account_id', type: 'bigint' })
  fromAccountId: string;

  @Column({ name: 'from_account_code', type: 'varchar', length: 60 })
  fromAccountCode: string;

  @Column({ name: 'from_account_name', type: 'varchar', length: 200 })
  fromAccountName: string;

  // ── 转入账户 ──────────────────────────────────────────────────────────────
  @Column({ name: 'to_account_id', type: 'bigint' })
  toAccountId: string;

  @Column({ name: 'to_account_code', type: 'varchar', length: 60 })
  toAccountCode: string;

  @Column({ name: 'to_account_name', type: 'varchar', length: 200 })
  toAccountName: string;

  // ── 公司维度 ──────────────────────────────────────────────────────────────
  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string | null;

  // ── 金额 ──────────────────────────────────────────────────────────────────
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

  // ── 状态 ──────────────────────────────────────────────────────────────────
  /** DRAFT / PENDING_APPROVAL / APPROVED / EXECUTED / CANCELLED */
  @Column({ name: 'status', type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  // ── 关联 ──────────────────────────────────────────────────────────────────
  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string | null;

  @Column({ name: 'out_txn_id', type: 'bigint', nullable: true })
  outTxnId: string | null;

  @Column({ name: 'in_txn_id', type: 'bigint', nullable: true })
  inTxnId: string | null;

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
