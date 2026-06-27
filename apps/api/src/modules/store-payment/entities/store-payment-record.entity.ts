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

@Entity('store_payment_records')
@Unique('UQ_store_payment_records_payment_no', ['paymentNo'])
@Check('CHK_store_payment_records_amount_nonnegative', '"amount" >= 0')
@Check('CHK_store_payment_records_status', `"status" IN ('PENDING', 'CONFIRMED', 'REJECTED', 'VOIDED')`)
@Index('IDX_store_payment_records_store', ['storeCode'])
@Index('IDX_store_payment_records_status', ['status'])
@Index('IDX_store_payment_records_paid_at', ['paidAt'])
@Index('IDX_store_payment_records_created_by', ['createdBy'])
@Index('IDX_store_payment_records_submitted_by', ['submittedBy'])
@Index('IDX_store_payment_records_payment_account', ['paymentAccountId'])
@Index('IDX_store_payment_records_deleted_at', ['deletedAt'])
@Index('IDX_store_payment_records_store_paid_at', ['storeCode', 'paidAt'])
@Index('IDX_store_payment_records_status_paid_at', ['status', 'paidAt'])
export class StorePaymentRecordEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'payment_no', type: 'varchar', length: 64 })
  paymentNo: string;

  @Column({ name: 'store_code', type: 'varchar', length: 64 })
  storeCode: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'payment_account_id', type: 'bigint' })
  paymentAccountId: string;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2 })
  amount: number;

  @Column({ name: 'currency', type: 'varchar', length: 16 })
  currency: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 64 })
  paymentMethod: string;

  @Column({ name: 'paid_at', type: 'timestamptz' })
  paidAt: Date;

  @Column({ name: 'proof_attachment_id', type: 'varchar', length: 255 })
  proofAttachmentId: string;

  @Column({ name: 'order_no', type: 'varchar', length: 64, nullable: true })
  orderNo: string | null;

  @Column({ name: 'sale_no', type: 'varchar', length: 64, nullable: true })
  saleNo: string | null;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'PENDING' })
  status: string;

  @Column({ name: 'submitted_by', type: 'varchar', length: 128 })
  submittedBy: string;

  @Column({ name: 'confirmed_by', type: 'varchar', length: 128, nullable: true })
  confirmedBy: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'rejected_by', type: 'varchar', length: 128, nullable: true })
  rejectedBy: string | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'voided_by', type: 'varchar', length: 128, nullable: true })
  voidedBy: string | null;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

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
