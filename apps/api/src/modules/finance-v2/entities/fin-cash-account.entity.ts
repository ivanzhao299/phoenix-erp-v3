import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 资金账户  fin_cash_accounts
 *
 * Finance V2 Phase 0 Clean Baseline
 * Phase 3 正式启用（当前为空表）
 *
 * 每条记录代表一个资金账户（银行账户、现金账户、虚拟内部账户）。
 * 余额通过 fin_cash_transactions 流水驱动，current_balance 为当前快照。
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
  companyName: string;

  // ── 账户类型 ─────────────────────────────────────────────────────────────
  /** BANK / CASH / VIRTUAL / DEPOSIT */
  @Column({ name: 'account_type', type: 'varchar', length: 30, default: 'BANK' })
  accountType: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: true })
  bankName: string;

  @Column({ name: 'bank_account_no', type: 'varchar', length: 60, nullable: true })
  bankAccountNo: string;

  // ── 余额 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'CNY' })
  currencyCode: string;

  @Column({ name: 'opening_balance', type: 'numeric', precision: 18, scale: 2, default: 0 })
  openingBalance: number;

  @Column({ name: 'current_balance', type: 'numeric', precision: 18, scale: 2, default: 0 })
  currentBalance: number;

  // ── 状态 ─────────────────────────────────────────────────────────────────
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'varchar', length: 80, nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
