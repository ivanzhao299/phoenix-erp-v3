import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ChanjetWmsPolicyState } from './chanjet-wms-house-location-policy.entity';

/**
 * Product-specific conversion for package/context units. A global "box" or
 * "bag" mapping is unsafe because the quantity differs by product.
 */
@Entity('chanjet_wms_uom_conversion_policies')
@Unique('uq_chanjet_wms_uom_conversion_source', [
  'bookId',
  'sourceProductCode',
  'sourceUom',
])
@Index('idx_chanjet_wms_uom_conversion_state', ['state', 'updatedAt'])
export class ChanjetWmsUomConversionPolicyEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'book_id', type: 'varchar', length: 64 })
  bookId: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, default: '' })
  companyCode: string;

  @Column({ name: 'source_product_code', type: 'varchar', length: 128 })
  sourceProductCode: string;

  @Column({ name: 'source_product_name', type: 'varchar', length: 256, default: '' })
  sourceProductName: string;

  @Column({ name: 'source_uom', type: 'varchar', length: 64 })
  sourceUom: string;

  @Column({ name: 'erp_entity_type', type: 'varchar', length: 32 })
  erpEntityType: 'PRODUCT' | 'SKU' | 'MATERIAL';

  @Column({ name: 'erp_product_code', type: 'varchar', length: 128 })
  erpProductCode: string;

  @Column({ name: 'erp_base_uom', type: 'varchar', length: 64 })
  erpBaseUom: string;

  @Column({ name: 'conversion_ratio', type: 'numeric', precision: 20, scale: 8 })
  conversionRatio: string;

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
