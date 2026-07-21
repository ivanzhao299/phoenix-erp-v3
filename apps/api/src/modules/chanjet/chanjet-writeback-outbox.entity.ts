import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, Unique,
} from 'typeorm';

export type ChanjetOutboxState =
  | 'READY'
  | 'SENDING'
  | 'ACKNOWLEDGED'
  | 'FAILED'
  | 'RETRYABLE'
  | 'DEAD_LETTER'
  | 'CANCELLED'
  | 'REVERSED';

/**
 * ERP-side writeback outbox. Transport remains disabled until the external Wave 7 Gate.
 */
@Entity('chanjet_writeback_outbox')
@Unique('uq_chanjet_writeback_outbox_idempotency', ['idempotencyKey'])
@Index('idx_chanjet_writeback_outbox_state_retry', ['state', 'nextAttemptAt'])
@Index('idx_chanjet_writeback_outbox_draft', ['draftId'])
export class ChanjetWritebackOutboxEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'draft_id', type: 'bigint' })
  draftId: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey: string;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash: string;

  @Column({ name: 'state', type: 'varchar', length: 32, default: 'READY' })
  state: ChanjetOutboxState;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 3 })
  maxAttempts: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ name: 'provider_request_hash', type: 'varchar', length: 64, default: '' })
  providerRequestHash: string;

  @Column({ name: 'provider_response_hash', type: 'varchar', length: 64, default: '' })
  providerResponseHash: string;

  @Column({ name: 'provider_receipt', type: 'jsonb', nullable: true })
  providerReceipt: Record<string, unknown> | null;

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
