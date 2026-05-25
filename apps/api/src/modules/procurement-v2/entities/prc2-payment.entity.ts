import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 付款记录  prc2_payments
 *
 *  三维语义说明：
 *  - company_*    款项归属哪家公司（财务主体）
 *  - project_*    款项归属哪个项目（成本归集）
 *  - payer_*      实际谁出的钱（可以是公司账户、股东、第三方）
 *  - shareholder_ 股东代付时形成的投资款/借款记录
 */
@Entity('prc2_payments')
export class Prc2PaymentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'pay_no', type: 'varchar', length: 80, unique: true })
  payNo: string;

  @Column({ name: 'payment_date', type: 'date', nullable: true })
  paymentDate: string;

  /** ── 款项归属公司 ── */
  @Column({ name: 'company_id', type: 'bigint', nullable: true })
  companyId: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string;

  /** ── 款项归属项目 ── */
  @Column({ name: 'project_id', type: 'bigint', nullable: true })
  projectId: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string;

  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
  projectName: string;

  /** ── 实际付款人 ── */
  @Column({ name: 'payer_type', type: 'varchar', length: 32 })
  payerType: string;

  @Column({ name: 'payer_id', type: 'bigint', nullable: true })
  payerId: string;

  @Column({ name: 'payer_name', type: 'varchar', length: 128 })
  payerName: string;

  @Column({ name: 'payer_account', type: 'varchar', length: 128, nullable: true })
  payerAccount: string;

  /** ── 收款人 ── */
  @Column({ name: 'payee_type', type: 'varchar', length: 32, nullable: true })
  payeeType: string;

  @Column({ name: 'payee_id', type: 'bigint', nullable: true })
  payeeId: string;

  @Column({ name: 'payee_name', type: 'varchar', length: 256, nullable: true })
  payeeName: string;

  @Column({ name: 'payee_account', type: 'varchar', length: 128, nullable: true })
  payeeAccount: string;

  /** ── 金额 ── */
  @Column({ name: 'currency_code', type: 'varchar', length: 8 })
  currencyCode: string;

  @Column({ name: 'amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountOriginal: number;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 8, default: 1 })
  exchangeRate: number;

  @Column({ name: 'amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountBase: number;

  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
  baseCurrency: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 32, nullable: true })
  paymentMethod: string;

  @Column({ name: 'fund_nature', type: 'varchar', length: 32, nullable: true })
  fundNature: string;

  /** ── 股东代付信息 ── */
  @Column({ name: 'is_shareholder_payment', type: 'boolean', default: false })
  isShareholderPayment: boolean;

  @Column({ name: 'shareholder_id', type: 'bigint', nullable: true })
  shareholderId: string;

  @Column({ name: 'shareholder_name', type: 'varchar', length: 128, nullable: true })
  shareholderName: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ name: 'voucher_url', type: 'text', nullable: true })
  voucherUrl: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
