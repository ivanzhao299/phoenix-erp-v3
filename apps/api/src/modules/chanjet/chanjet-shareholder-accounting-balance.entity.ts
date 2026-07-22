import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn,
} from 'typeorm';

/**
 * 好业财实收资本明细在 ERP 内的权威会计镜像。
 *
 * 该表只承载已记账会计事实，不反向改写 ERP 法定股权或逐笔出资。
 */
@Entity('chanjet_shareholder_accounting_balances')
@Unique('uq_chanjet_shareholder_accounting_balance', ['bookId', 'period', 'subjectId'])
@Index('idx_chanjet_shareholder_balance_company_period', ['companyCode', 'period'])
@Index('idx_chanjet_shareholder_balance_shareholder', ['shareholderCode', 'period'])
@Index('idx_chanjet_shareholder_balance_mapping', ['mappingStatus', 'active'])
export class ChanjetShareholderAccountingBalanceEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'book_id', type: 'varchar', length: 64 })
  bookId: string;

  @Column({ name: 'period', type: 'varchar', length: 16 })
  period: string;

  @Column({ name: 'subject_id', type: 'varchar', length: 128 })
  subjectId: string;

  @Column({ name: 'subject_code', type: 'varchar', length: 64, default: '' })
  subjectCode: string;

  @Column({ name: 'subject_name', type: 'varchar', length: 256, default: '' })
  subjectName: string;

  @Column({ name: 'shareholder_code', type: 'varchar', length: 64, default: '' })
  shareholderCode: string;

  @Column({ name: 'shareholder_name', type: 'varchar', length: 256, default: '' })
  shareholderName: string;

  @Column({ name: 'currency', type: 'varchar', length: 16, default: '' })
  currency: string;

  @Column({ name: 'ending_amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  endingAmountBase: string;

  @Column({ name: 'mapping_status', type: 'varchar', length: 32, default: 'SOURCE_ONLY' })
  mappingStatus: 'APPROVED' | 'EXACT' | 'ALIAS' | 'SOURCE_ONLY' | 'CONFLICT';

  @Column({ name: 'match_confidence', type: 'numeric', precision: 5, scale: 2, default: 0 })
  matchConfidence: string;

  @Column({ name: 'match_basis', type: 'jsonb', default: () => "'{}'::jsonb" })
  matchBasis: Record<string, unknown>;

  @Column({ name: 'source_snapshot_id', type: 'bigint' })
  sourceSnapshotId: string;

  @Column({ name: 'source_hash', type: 'varchar', length: 64 })
  sourceHash: string;

  @Column({ name: 'sync_run_id', type: 'uuid' })
  syncRunId: string;

  @Column({ name: 'active', type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'source_updated_at', type: 'timestamptz' })
  sourceUpdatedAt: Date;

  @Column({ name: 'synced_by', type: 'varchar', length: 128 })
  syncedBy: string;

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
