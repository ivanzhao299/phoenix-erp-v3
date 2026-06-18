import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('prc2_init_batch_rows')
@Index('idx_prc2_ibrow_batch_id', ['batchId'])
@Index('idx_prc2_ibrow_status', ['status'])
export class Prc2InitBatchRowEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'batch_id', type: 'bigint' })
  batchId: string;

  @Column({ name: 'row_no', type: 'int' })
  rowNo: number;

  @Column({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData: Record<string, unknown>;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'PENDING' })
  status: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'related_po_id', type: 'bigint', nullable: true })
  relatedPoId: string;

  @Column({ name: 'related_po_no', type: 'varchar', length: 80, nullable: true })
  relatedPoNo: string;

  @Column({ name: 'related_payment_id', type: 'bigint', nullable: true })
  relatedPaymentId: string;

  @Column({ name: 'related_pay_no', type: 'varchar', length: 80, nullable: true })
  relatedPayNo: string;

  @Column({ name: 'related_fund_id', type: 'bigint', nullable: true })
  relatedFundId: string;

  @Column({ name: 'related_fund_no', type: 'varchar', length: 80, nullable: true })
  relatedFundNo: string;

  @Column({ name: 'related_receipt_id', type: 'bigint', nullable: true })
  relatedReceiptId: string;

  @Column({ name: 'related_receipt_no', type: 'varchar', length: 80, nullable: true })
  relatedReceiptNo: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
