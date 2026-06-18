import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 应收往来余额台账  fin_ar_ledger（应收总账）
 *
 * G41 — 刘杰（集团财务总监）应收总账。
 * 按"场 + 往来单位/客户 + 期间日"的期初/本期应收/本期已收/期末余额快照。
 * 与 fin_ar_invoices（发票级、含收款状态机）不同：本表是只读余额台账，
 * 由导入/对账生成，供财务总监查看集团应收态势。
 */
@Entity('fin_ar_ledger')
@Index('idx_fin_ar_ledger_farm_period', ['farmCode', 'periodDate'])
@Index('idx_fin_ar_ledger_counterparty', ['counterpartyName'])
export class FinArLedgerEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** PHOENIX(凤凰鸡场) / DONGPENG(东鹏鸡场) */
  @Column({ name: 'farm_code', type: 'varchar', length: 32 })
  farmCode: string;

  @Column({ name: 'farm_name', type: 'varchar', length: 64 })
  farmName: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string | null;

  @Column({ name: 'counterparty_code', type: 'varchar', length: 64, nullable: true })
  counterpartyCode: string | null;

  @Column({ name: 'counterparty_name', type: 'varchar', length: 256 })
  counterpartyName: string;

  @Column({ name: 'period_date', type: 'date' })
  periodDate: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'LAK' })
  currencyCode: string;

  @Column({ name: 'opening_amount', type: 'numeric', precision: 20, scale: 2, default: 0 })
  openingAmount: string;

  @Column({ name: 'period_charge', type: 'numeric', precision: 20, scale: 2, default: 0 })
  periodCharge: string;

  @Column({ name: 'period_received', type: 'numeric', precision: 20, scale: 2, default: 0 })
  periodReceived: string;

  @Column({ name: 'closing_amount', type: 'numeric', precision: 20, scale: 2, default: 0 })
  closingAmount: string;

  @Column({ name: 'closing_amount_base', type: 'numeric', precision: 20, scale: 2, nullable: true })
  closingAmountBase: string | null;

  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
  baseCurrency: string;

  /** OCR_PENDING_VERIFY / VERIFIED / RECON */
  @Column({ name: 'source', type: 'varchar', length: 32, default: 'OCR_PENDING_VERIFY' })
  source: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
