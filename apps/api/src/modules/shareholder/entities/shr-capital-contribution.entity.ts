import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 出资台账  shr_capital_contributions */
@Entity('shr_capital_contributions')
export class ShrCapitalContributionEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'contribution_no', type: 'varchar', length: 64, unique: true })
  contributionNo: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64 })
  projectCode: string;

  @Column({ name: 'shareholder_code', type: 'varchar', length: 64 })
  shareholderCode: string;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  @Column({ name: 'currency', type: 'varchar', length: 8, default: 'CNY' })
  currency: string;

  @Column({ name: 'contribution_date', type: 'date', nullable: true })
  contributionDate: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 64, nullable: true })
  paymentMethod: string;

  /** BANK_TRANSFER/CASH/DIVIDEND_OFFSET/SHAREHOLDER_ADVANCE/OTHER */
  @Column({ name: 'source_type', type: 'varchar', length: 32, default: 'BANK_TRANSFER' })
  sourceType: string;

  @Column({ name: 'source_reference', type: 'varchar', length: 256, nullable: true })
  sourceReference: string;

  @Column({ name: 'bank_account', type: 'varchar', length: 128, nullable: true })
  bankAccount: string;

  /** DRAFT/CONFIRMED/CANCELLED */
  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
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
