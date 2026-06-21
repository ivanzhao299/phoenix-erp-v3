import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('store_payment_accounts')
@Unique('UQ_store_payment_accounts_scope_code', ['companyCode', 'storeCode', 'accountCode'])
@Check('CHK_store_payment_accounts_status', `"status" IN ('ACTIVE', 'DISABLED')`)
@Index('IDX_store_payment_accounts_store', ['storeCode'])
@Index('IDX_store_payment_accounts_company_store_status', ['companyCode', 'storeCode', 'status'])
@Index('IDX_store_payment_accounts_fin_cash_account', ['finCashAccountId'])
@Index('IDX_store_payment_accounts_deleted_at', ['deletedAt'])
export class StorePaymentAccountEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'account_code', type: 'varchar', length: 64 })
  accountCode: string;

  @Column({ name: 'account_name', type: 'varchar', length: 160 })
  accountName: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'store_code', type: 'varchar', length: 64 })
  storeCode: string;

  @Column({ name: 'fin_cash_account_id', type: 'bigint', nullable: true })
  finCashAccountId: string | null;

  @Column({ name: 'currency', type: 'varchar', length: 16 })
  currency: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 64 })
  paymentMethod: string;

  @Column({ name: 'qr_attachment_id', type: 'varchar', length: 255, nullable: true })
  qrAttachmentId: string | null;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 128, default: '' })
  createdBy: string;

  @Column({ name: 'updated_by', type: 'varchar', length: 128, default: '' })
  updatedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
