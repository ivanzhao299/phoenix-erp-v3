import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, Unique,
} from 'typeorm';

/**
 * chanjet_erp_field_mapping — 好业财字段与 ERP 字段的差异/适配目录。
 *
 * 自动分析只能给出候选和风险等级，真正改 ERP schema / DTO / UI 必须进入单独 Gate。
 */
@Entity('chanjet_erp_field_mapping')
@Unique('uq_chanjet_erp_field_mapping', ['chanjetEndpoint', 'chanjetFieldPath', 'erpDomain', 'erpField'])
@Index('idx_chanjet_erp_field_mapping_status', ['matchStatus', 'decisionStatus'])
@Index('idx_chanjet_erp_field_mapping_domain', ['erpDomain'])
export class ChanjetErpFieldMappingEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'chanjet_endpoint', type: 'varchar', length: 512 })
  chanjetEndpoint: string;

  @Column({ name: 'chanjet_field_path', type: 'varchar', length: 512 })
  chanjetFieldPath: string;

  @Column({ name: 'chanjet_type', type: 'varchar', length: 32, default: '' })
  chanjetType: string;

  @Column({ name: 'chanjet_sample_masked', type: 'text', nullable: true })
  chanjetSampleMasked: string | null;

  @Column({ name: 'erp_domain', type: 'varchar', length: 64, default: '' })
  erpDomain: string;

  @Column({ name: 'erp_table', type: 'varchar', length: 128, default: '' })
  erpTable: string;

  @Column({ name: 'erp_field', type: 'varchar', length: 128, default: '' })
  erpField: string;

  @Column({ name: 'erp_type', type: 'varchar', length: 64, default: '' })
  erpType: string;

  @Column({ name: 'transform_rule', type: 'text', default: '' })
  transformRule: string;

  @Column({ name: 'match_status', type: 'varchar', length: 32, default: 'PENDING' })
  matchStatus: 'MATCHED' | 'TYPE_MISMATCH' | 'MISSING_IN_ERP' | 'MISSING_IN_CHANJET' | 'TRANSFORM_REQUIRED' | 'PENDING';

  @Column({ name: 'risk_level', type: 'varchar', length: 24, default: 'MEDIUM' })
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @Column({ name: 'decision_status', type: 'varchar', length: 32, default: 'PENDING' })
  decisionStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HOLD';

  @Column({ name: 'analysis_note', type: 'text', default: '' })
  analysisNote: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
