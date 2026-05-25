import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 股东资金池  prc2_shareholder_funds */
@Entity('prc2_shareholder_funds')
export class Prc2ShareholderFundEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'fund_no', type: 'varchar', length: 80, unique: true })
  fundNo: string;

  @Column({ name: 'shareholder_id', type: 'bigint', nullable: true })
  shareholderId: string;

  @Column({ name: 'shareholder_name', type: 'varchar', length: 128 })
  shareholderName: string;

  /** ── 多公司维度 ── */
  @Column({ name: 'company_id', type: 'bigint', nullable: true })
  companyId: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string;

  /** ── 多项目维度 ── */
  @Column({ name: 'project_id', type: 'bigint', nullable: true })
  projectId: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string;

  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
  projectName: string;

  @Column({ name: 'source_type', type: 'varchar', length: 32, nullable: true })
  sourceType: string;

  @Column({ name: 'fund_nature', type: 'varchar', length: 32, nullable: true })
  fundNature: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, nullable: true })
  currencyCode: string;

  @Column({ name: 'amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountOriginal: number;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 8, default: 1 })
  exchangeRate: number;

  @Column({ name: 'amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountBase: number;

  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
  baseCurrency: string;

  @Column({ name: 'related_payment_id', type: 'bigint', nullable: true })
  relatedPaymentId: string;

  @Column({ name: 'related_po_id', type: 'bigint', nullable: true })
  relatedPoId: string;

  @Column({ name: 'related_po_no', type: 'varchar', length: 80, nullable: true })
  relatedPoNo: string;

  @Column({ name: 'occurred_date', type: 'date', nullable: true })
  occurredDate: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'CONFIRMED' })
  status: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
