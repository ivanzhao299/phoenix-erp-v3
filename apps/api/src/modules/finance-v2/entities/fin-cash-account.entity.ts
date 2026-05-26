import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 资金账户台账  fin_cash_accounts
 *
 * Finance V2 Phase 3 — Cash Runtime 正式启用
 *
 * 账户类型（account_type）：
 *   BANK        — 银行账户
 *   CASH        — 现金账户
 *   VIRTUAL     — 虚拟内部账户（资金池）
 *   SHAREHOLDER — 股东往来账户
 *   INTERNAL    — 内部往来账户
 *
 * 状态机：
 *   ACTIVE → FROZEN（临时冻结，不允许收付）
 *   ACTIVE → CLOSED（余额必须为 0）
 *   FROZEN → ACTIVE（解冻）
 *   FROZEN → CLOSED（余额为 0）
 *
 * 余额驱动：
 *   current_balance 由 fin_cash_transactions 流水驱动，实时快照。
 *   所有余额变动必须先写流水，再更新账户余额（同事务）。
 */
@Entity('fin_cash_accounts')
export class FinCashAccountEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'account_code', type: 'varchar', length: 60, unique: true })
  accountCode: string;

  @Column({ name: 'account_name', type: 'varchar', length: 200 })
  accountName: string;

  // ── 公司维度 ─────────────────────────────────────────────────────────────
  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string | null;

  // ── 货币 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'CNY' })
  currencyCode: string;

  // ── 账户类型 ─────────────────────────────────────────────────────────────
  /** BANK / CASH / VIRTUAL / SHAREHOLDER / INTERNAL */
  @Column({ name: 'account_type', type: 'varchar', length: 30, default: 'BANK' })
  accountType: string;

  // ── 余额 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'opening_balance', type: 'numeric', precision: 18, scale: 2, default: 0 })
  openingBalance: number;

  @Column({ name: 'current_balance', type: 'numeric', precision: 18, scale: 2, default: 0 })
  currentBalance: number;

  // ── 银行信息 ─────────────────────────────────────────────────────────────
  @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: true })
  bankName: string | null;

  @Column({ name: 'bank_account_no', type: 'varchar', length: 60, nullable: true })
  bankAccountNo: string | null;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  /** ACTIVE / FROZEN / CLOSED */
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

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
