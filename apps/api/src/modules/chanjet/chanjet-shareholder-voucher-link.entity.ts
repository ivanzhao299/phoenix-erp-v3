import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn,
} from 'typeorm';

/** ERP 股东出资与好业财已记账凭证行的可审计关联。不会修改任一业务源。 */
@Entity('chanjet_shareholder_voucher_links')
@Unique('uq_chanjet_shareholder_voucher_link', ['bookId', 'contributionNo', 'voucherLineId'])
@Index('idx_chanjet_shareholder_link_contribution', ['contributionId'])
@Index('idx_chanjet_shareholder_link_status', ['matchStatus'])
export class ChanjetShareholderVoucherLinkEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'book_id', type: 'varchar', length: 64 })
  bookId: string;

  @Column({ name: 'contribution_id', type: 'bigint', nullable: true })
  contributionId: string | null;

  @Column({ name: 'contribution_no', type: 'varchar', length: 64 })
  contributionNo: string;

  @Column({ name: 'shareholder_code', type: 'varchar', length: 64 })
  shareholderCode: string;

  @Column({ name: 'voucher_id', type: 'varchar', length: 128 })
  voucherId: string;

  @Column({ name: 'voucher_no', type: 'varchar', length: 128, default: '' })
  voucherNo: string;

  @Column({ name: 'voucher_line_id', type: 'varchar', length: 128 })
  voucherLineId: string;

  @Column({ name: 'voucher_date', type: 'date', nullable: true })
  voucherDate: string | null;

  @Column({ name: 'subject_code', type: 'varchar', length: 64 })
  subjectCode: string;

  @Column({ name: 'subject_name', type: 'varchar', length: 256, default: '' })
  subjectName: string;

  @Column({ name: 'currency', type: 'varchar', length: 16, default: 'CNY' })
  currency: string;

  @Column({ name: 'amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountOriginal: string;

  @Column({ name: 'amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountBase: string;

  @Column({ name: 'match_status', type: 'varchar', length: 32, default: 'CANDIDATE' })
  matchStatus: 'CANDIDATE' | 'MATCHED' | 'NEED_REVIEW' | 'UNMATCHED' | 'CONFLICT';

  @Column({ name: 'confidence', type: 'numeric', precision: 5, scale: 2, default: 0 })
  confidence: string;

  @Column({ name: 'match_basis', type: 'jsonb', default: () => "'{}'::jsonb" })
  matchBasis: Record<string, unknown>;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 128, nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
