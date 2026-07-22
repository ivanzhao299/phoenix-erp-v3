import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn,
} from 'typeorm';

/** 股东权益与好业财实收资本的月度关账证据；仅保存 ERP 中间层快照。 */
@Entity('chanjet_shareholder_close_periods')
@Unique('uq_chanjet_shareholder_close_period', ['companyCode', 'bookId', 'period'])
@Index('idx_chanjet_shareholder_close_status', ['status'])
export class ChanjetShareholderClosePeriodEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'book_id', type: 'varchar', length: 64 })
  bookId: string;

  @Column({ name: 'period', type: 'varchar', length: 16 })
  period: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'OPEN' })
  status: 'OPEN' | 'READY' | 'CLOSED' | 'REOPENED';

  @Column({ name: 'erp_paid_in', type: 'numeric', precision: 18, scale: 2, default: 0 })
  erpPaidIn: string;

  @Column({ name: 'chanjet_paid_in', type: 'numeric', precision: 18, scale: 2, default: 0 })
  chanjetPaidIn: string;

  @Column({ name: 'difference_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  differenceAmount: string;

  @Column({ name: 'evidence', type: 'jsonb', default: () => "'{}'::jsonb" })
  evidence: Record<string, unknown>;

  @Column({ name: 'closed_by', type: 'varchar', length: 128, nullable: true })
  closedBy: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'note', type: 'text', default: '' })
  note: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
