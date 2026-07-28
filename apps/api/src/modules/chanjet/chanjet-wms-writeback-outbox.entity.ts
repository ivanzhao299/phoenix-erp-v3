import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ChanjetOutboxState } from './chanjet-writeback-outbox.entity';

/**
 * WMS-specific external write preparation.
 *
 * This intentionally does not reuse the voucher outbox: inventory documents
 * have different idempotency, red/blue, readback and compensation contracts.
 * External transport stays fail-closed until a separate execution Gate.
 */
@Entity('chanjet_wms_writeback_outbox')
@Unique('uq_chanjet_wms_outbox_idempotency', ['idempotencyKey'])
@Index('idx_chanjet_wms_outbox_state_retry', ['state', 'nextAttemptAt'])
@Index('idx_chanjet_wms_outbox_document', ['documentType', 'erpDocumentNo'])
export class ChanjetWmsWritebackOutboxEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'book_id', type: 'varchar', length: 64 })
  bookId: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'document_type', type: 'varchar', length: 64 })
  documentType: string;

  @Column({ name: 'erp_document_no', type: 'varchar', length: 128 })
  erpDocumentNo: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 160 })
  idempotencyKey: string;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash: string;

  @Column({ name: 'canonical_payload', type: 'jsonb' })
  canonicalPayload: Record<string, unknown>;

  @Column({ name: 'state', type: 'varchar', length: 32, default: 'READY' })
  state: ChanjetOutboxState;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 3 })
  maxAttempts: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ name: 'provider_receipt', type: 'jsonb', nullable: true })
  providerReceipt: Record<string, unknown> | null;

  @Column({ name: 'readback_evidence', type: 'jsonb', nullable: true })
  readbackEvidence: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'compensation_ref', type: 'varchar', length: 128, default: '' })
  compensationRef: string;

  @Column({ name: 'external_write_enabled', type: 'boolean', default: false })
  externalWriteEnabled: boolean;

  @Column({ name: 'created_by', type: 'varchar', length: 128, default: '' })
  createdBy: string;

  @Column({ name: 'approved_by', type: 'varchar', length: 128, default: '' })
  approvedBy: string;

  @Column({ name: 'state_history', type: 'jsonb', default: () => "'[]'::jsonb" })
  stateHistory: Array<Record<string, unknown>>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
