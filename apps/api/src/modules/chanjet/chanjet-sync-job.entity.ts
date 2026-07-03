import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * chanjet_sync_jobs — 好业财探针/同步/对账/入账审计作业。
 */
@Entity('chanjet_sync_jobs')
@Index('idx_chanjet_sync_jobs_type_status', ['jobType', 'status'])
@Index('idx_chanjet_sync_jobs_book_period', ['bookId', 'period'])
export class ChanjetSyncJobEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'job_type', type: 'varchar', length: 32 })
  jobType: 'PROBE' | 'SNAPSHOT' | 'RECONCILE' | 'IMPORT' | 'BOOK_REFRESH';

  @Column({ name: 'book_id', type: 'varchar', length: 64, default: '' })
  bookId: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, default: '' })
  companyCode: string;

  @Column({ name: 'period', type: 'varchar', length: 16, default: '' })
  period: string;

  @Column({ name: 'status', type: 'varchar', length: 24, default: 'RUNNING' })
  status: 'RUNNING' | 'SUCCESS' | 'FAIL';

  @Column({ name: 'request_scope', type: 'jsonb', nullable: true })
  requestScope: Record<string, unknown> | null;

  @Column({ name: 'result_summary', type: 'jsonb', nullable: true })
  resultSummary: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
