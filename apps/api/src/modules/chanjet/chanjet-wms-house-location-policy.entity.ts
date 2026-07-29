import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type ChanjetWmsPolicyState = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'HOLD';

/**
 * Explicitly relates a Chanjet warehouse-shaped source identity to an ERP
 * breeding house and its real WMS warehouse/location ownership.
 *
 * A house is never treated as a warehouse. This table records the reviewed
 * bridge needed to interpret inventory documents without rewriting history.
 */
@Entity('chanjet_wms_house_location_policies')
@Unique('uq_chanjet_wms_house_location_source', ['bookId', 'sourceWarehouseCode'])
@Index('idx_chanjet_wms_house_location_state', ['state', 'updatedAt'])
export class ChanjetWmsHouseLocationPolicyEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'book_id', type: 'varchar', length: 64 })
  bookId: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'source_warehouse_code', type: 'varchar', length: 128 })
  sourceWarehouseCode: string;

  @Column({ name: 'source_warehouse_name', type: 'varchar', length: 256, default: '' })
  sourceWarehouseName: string;

  @Column({ name: 'erp_house_code', type: 'varchar', length: 64 })
  erpHouseCode: string;

  @Column({ name: 'erp_warehouse_code', type: 'varchar', length: 64 })
  erpWarehouseCode: string;

  @Column({ name: 'erp_location_code', type: 'varchar', length: 64 })
  erpLocationCode: string;

  @Column({ name: 'state', type: 'varchar', length: 16, default: 'DRAFT' })
  state: ChanjetWmsPolicyState;

  @Column({ name: 'evidence', type: 'jsonb', default: () => "'{}'::jsonb" })
  evidence: Record<string, unknown>;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 128, default: '' })
  reviewedBy: string;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
