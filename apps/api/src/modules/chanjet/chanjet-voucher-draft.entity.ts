import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * chanjet_voucher_drafts — ERP 到好业财的凭证草稿中间层。
 *
 * 这里只保存 ERP 侧建议凭证与人工审核状态；不直接推送好业财。
 */
@Entity('chanjet_voucher_drafts')
@Index('idx_chanjet_voucher_drafts_status', ['status'])
@Index('idx_chanjet_voucher_drafts_source', ['sourceBizType', 'sourceBizId'])
@Index('idx_chanjet_voucher_drafts_book_period', ['bookId', 'period'])
export class ChanjetVoucherDraftEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'source_biz_type', type: 'varchar', length: 64 })
  sourceBizType: string;

  @Column({ name: 'source_biz_id', type: 'varchar', length: 128 })
  sourceBizId: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, default: '' })
  companyCode: string;

  @Column({ name: 'book_id', type: 'varchar', length: 64, default: '' })
  bookId: string;

  @Column({ name: 'period', type: 'varchar', length: 16, default: '' })
  period: string;

  @Column({ name: 'title', type: 'varchar', length: 256, default: '' })
  title: string;

  @Column({ name: 'voucher_lines', type: 'jsonb', default: () => "'[]'::jsonb" })
  voucherLines: Array<Record<string, unknown>>;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: 'DRAFT' | 'VALIDATED' | 'REVIEWED' | 'APPROVED' | 'PUSH_READY' | 'REJECTED' | 'CANCELLED';

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, default: '' })
  idempotencyKey: string;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64, default: '' })
  payloadHash: string;

  @Column({ name: 'push_allowed', type: 'boolean', default: false })
  pushAllowed: boolean;

  @Column({ name: 'push_status', type: 'varchar', length: 32, default: 'NOT_PUSHED' })
  pushStatus: 'NOT_PUSHED' | 'FAILED';

  @Column({ name: 'created_by', type: 'varchar', length: 128, default: '' })
  createdBy: string;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 128, nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'validated_by', type: 'varchar', length: 128, nullable: true })
  validatedBy: string | null;

  @Column({ name: 'validated_at', type: 'timestamptz', nullable: true })
  validatedAt: Date | null;

  @Column({ name: 'approved_by', type: 'varchar', length: 128, nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
