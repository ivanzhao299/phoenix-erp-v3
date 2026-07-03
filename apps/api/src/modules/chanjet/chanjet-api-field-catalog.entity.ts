import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, Unique,
} from 'typeorm';

/**
 * chanjet_api_field_catalog — 好业财接口字段样本 catalog。
 *
 * 只保存脱敏样本和类型，不保存 token/certificate/appTicket 等敏感值。
 */
@Entity('chanjet_api_field_catalog')
@Unique('uq_chanjet_api_field_catalog', ['apiDomain', 'apiPath', 'method', 'fieldPath'])
@Index('idx_chanjet_api_field_catalog_domain', ['apiDomain'])
@Index('idx_chanjet_api_field_catalog_path', ['apiPath'])
export class ChanjetApiFieldCatalogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'api_domain', type: 'varchar', length: 64 })
  apiDomain: string;

  @Column({ name: 'api_path', type: 'varchar', length: 256 })
  apiPath: string;

  @Column({ name: 'method', type: 'varchar', length: 12 })
  method: 'GET' | 'POST';

  @Column({ name: 'field_path', type: 'varchar', length: 512 })
  fieldPath: string;

  @Column({ name: 'sample_type', type: 'varchar', length: 32 })
  sampleType: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';

  @Column({ name: 'sample_value_masked', type: 'text', nullable: true })
  sampleValueMasked: string | null;

  @Column({ name: 'observed_count', type: 'integer', default: 0 })
  observedCount: number;

  @CreateDateColumn({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt: Date;

  @UpdateDateColumn({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;
}
