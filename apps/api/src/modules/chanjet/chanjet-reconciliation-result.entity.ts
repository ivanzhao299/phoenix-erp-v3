import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * chanjet_reconciliation_results — ERP/好业财中间层对账结果。
 *
 * 用于记录主数据映射、凭证草稿和后续 AP/AR/GL 对账差异；append-only 审计优先。
 */
@Entity('chanjet_reconciliation_results')
@Index('idx_chanjet_reconciliation_type_status', ['reconciliationType', 'status'])
@Index('idx_chanjet_reconciliation_book_period', ['bookId', 'period'])
@Index('idx_chanjet_reconciliation_subject', ['subjectType', 'subjectKey'])
export class ChanjetReconciliationResultEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'reconciliation_type', type: 'varchar', length: 64 })
  reconciliationType:
    | 'MASTER_MAPPING'
    | 'AR_LEDGER'
    | 'AP_LEDGER'
    | 'VOUCHER_DRAFT'
    | 'FIELD_CATALOG'
    | 'SHAREHOLDER_EQUITY'
    | 'SHAREHOLDER_CONTRIBUTION';

  @Column({ name: 'company_code', type: 'varchar', length: 64, default: '' })
  companyCode: string;

  @Column({ name: 'book_id', type: 'varchar', length: 64, default: '' })
  bookId: string;

  @Column({ name: 'period', type: 'varchar', length: 16, default: '' })
  period: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'WARN' })
  status: 'OK' | 'WARN' | 'MISMATCH' | 'HOLD';

  @Column({ name: 'severity', type: 'varchar', length: 32, default: 'MEDIUM' })
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @Column({ name: 'subject_type', type: 'varchar', length: 64, default: '' })
  subjectType: string;

  @Column({ name: 'subject_key', type: 'varchar', length: 128, default: '' })
  subjectKey: string;

  @Column({ name: 'subject_name', type: 'varchar', length: 256, default: '' })
  subjectName: string;

  @Column({ name: 'erp_value', type: 'jsonb', nullable: true })
  erpValue: Record<string, unknown> | null;

  @Column({ name: 'chanjet_value', type: 'jsonb', nullable: true })
  chanjetValue: Record<string, unknown> | null;

  @Column({ name: 'diff_summary', type: 'text', default: '' })
  diffSummary: string;

  @Column({ name: 'action_required', type: 'text', default: '' })
  actionRequired: string;

  @Column({ name: 'resolved', type: 'boolean', default: false })
  resolved: boolean;

  @Column({ name: 'resolved_by', type: 'varchar', length: 128, nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
