import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type ChanjetWmsPromotionState =
  | 'CANDIDATE'
  | 'NEED_MAPPING'
  | 'NEED_MANUAL_REVIEW'
  | 'HOLD'
  | 'APPROVED'
  | 'PROMOTED'
  | 'REJECTED';

/**
 * A reviewed bridge between the read-only Chanjet mirror and ERP WMS.
 *
 * Rows in this table are evidence only. They never mutate inv_batches,
 * inv_ledger, wms_inbound or wms_outbound by themselves.
 */
@Entity('chanjet_wms_promotion_candidates')
@Unique('uq_chanjet_wms_promotion_source', ['bookId', 'entityType', 'externalDocumentId'])
@Index('idx_chanjet_wms_promotion_state', ['state', 'updatedAt'])
export class ChanjetWmsPromotionCandidateEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'book_id', type: 'varchar', length: 64 })
  bookId: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType: string;

  @Column({ name: 'external_document_id', type: 'varchar', length: 128 })
  externalDocumentId: string;

  @Column({ name: 'external_document_no', type: 'varchar', length: 128, default: '' })
  externalDocumentNo: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, default: '' })
  companyCode: string;

  @Column({ name: 'erp_direction', type: 'varchar', length: 16 })
  erpDirection: 'INBOUND' | 'OUTBOUND' | 'TRANSFER' | 'COUNT';

  @Column({ name: 'erp_document_type', type: 'varchar', length: 64 })
  erpDocumentType: string;

  @Column({ name: 'state', type: 'varchar', length: 32, default: 'CANDIDATE' })
  state: ChanjetWmsPromotionState;

  @Column({ name: 'source_hash', type: 'varchar', length: 64 })
  sourceHash: string;

  @Column({ name: 'mapping_evidence', type: 'jsonb', default: () => "'{}'::jsonb" })
  mappingEvidence: Record<string, unknown>;

  @Column({ name: 'canonical_payload', type: 'jsonb' })
  canonicalPayload: Record<string, unknown>;

  @Column({ name: 'blockers', type: 'jsonb', default: () => "'[]'::jsonb" })
  blockers: string[];

  @Column({ name: 'conditions', type: 'jsonb', default: () => "'[]'::jsonb" })
  conditions: string[];

  @Column({ name: 'approved_by', type: 'varchar', length: 128, default: '' })
  approvedBy: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'promoted_document_no', type: 'varchar', length: 128, default: '' })
  promotedDocumentNo: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
