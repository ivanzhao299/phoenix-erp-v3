import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, Unique,
} from 'typeorm';

/**
 * chanjet_entity_snapshots — 好业财业务实体标准化镜像。
 *
 * 该表用于 ERP 侧查看、汇总、字段对比和人工映射，不作为业务事实权威源。
 */
@Entity('chanjet_entity_snapshots')
@Unique('uq_chanjet_entity_snapshot', ['bookId', 'entityType', 'externalId'])
@Index('idx_chanjet_entity_snapshots_type_status', ['entityType', 'status'])
@Index('idx_chanjet_entity_snapshots_book_type', ['bookId', 'entityType'])
@Index('idx_chanjet_entity_snapshots_code', ['externalCode'])
export class ChanjetEntitySnapshotEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'book_id', type: 'varchar', length: 64, default: '' })
  bookId: string;

  @Column({ name: 'endpoint_key', type: 'varchar', length: 64 })
  endpointKey: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType: string;

  @Column({ name: 'external_id', type: 'varchar', length: 128, default: '' })
  externalId: string;

  @Column({ name: 'external_code', type: 'varchar', length: 128, default: '' })
  externalCode: string;

  @Column({ name: 'external_name', type: 'varchar', length: 256, default: '' })
  externalName: string;

  @Column({ name: 'period', type: 'varchar', length: 16, default: '' })
  period: string;

  @Column({ name: 'status', type: 'varchar', length: 64, default: '' })
  status: string;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amount: string;

  @Column({ name: 'currency', type: 'varchar', length: 16, default: '' })
  currency: string;

  @Column({ name: 'raw_data', type: 'jsonb' })
  rawData: Record<string, unknown>;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
