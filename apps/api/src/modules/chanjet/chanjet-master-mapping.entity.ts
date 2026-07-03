import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, Unique,
} from 'typeorm';

export type ChanjetMappingType =
  | 'COMPANY'
  | 'DEPARTMENT'
  | 'CUSTOMER'
  | 'SUPPLIER'
  | 'CASH_ACCOUNT'
  | 'SUBJECT'
  | 'PROJECT'
  | 'WAREHOUSE'
  | 'PRODUCT'
  | 'CURRENCY';

/**
 * chanjet_master_mapping — ERP 主数据与好业财主数据的统一映射层。
 *
 * 自动探针只能生成 PENDING/MANUAL 建议；业务生效必须经财务/主数据人工审核。
 */
@Entity('chanjet_master_mapping')
@Unique('uq_chanjet_master_mapping', ['mappingType', 'erpCode', 'chanjetId'])
@Index('idx_chanjet_master_mapping_type_status', ['mappingType', 'matchStatus', 'reviewStatus'])
@Index('idx_chanjet_master_mapping_book', ['bookId'])
export class ChanjetMasterMappingEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'mapping_type', type: 'varchar', length: 40 })
  mappingType: ChanjetMappingType;

  @Column({ name: 'book_id', type: 'varchar', length: 64, default: '' })
  bookId: string;

  @Column({ name: 'erp_code', type: 'varchar', length: 128, default: '' })
  erpCode: string;

  @Column({ name: 'erp_name', type: 'varchar', length: 256, default: '' })
  erpName: string;

  @Column({ name: 'chanjet_id', type: 'varchar', length: 128, default: '' })
  chanjetId: string;

  @Column({ name: 'chanjet_code', type: 'varchar', length: 128, default: '' })
  chanjetCode: string;

  @Column({ name: 'chanjet_name', type: 'varchar', length: 256, default: '' })
  chanjetName: string;

  @Column({ name: 'match_status', type: 'varchar', length: 32, default: 'PENDING' })
  matchStatus: 'MATCHED' | 'MISSING_IN_ERP' | 'MISSING_IN_CHANJET' | 'CONFLICT' | 'MANUAL' | 'PENDING';

  @Column({ name: 'confidence', type: 'numeric', precision: 5, scale: 2, default: 0 })
  confidence: string;

  @Column({ name: 'review_status', type: 'varchar', length: 32, default: 'PENDING' })
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Column({ name: 'reviewed_by', type: 'varchar', length: 128, nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
