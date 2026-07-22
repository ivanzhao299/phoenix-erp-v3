import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/** 好业财会计事实单向写入 ERP 镜像层的批次审计。 */
@Entity('chanjet_erp_inbound_sync_runs')
@Unique('uq_chanjet_erp_inbound_sync_plan', ['planHash'])
@Index('idx_chanjet_erp_inbound_sync_status', ['status', 'createdAt'])
export class ChanjetErpInboundSyncRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sync_type', type: 'varchar', length: 64 })
  syncType: string;

  @Column({ name: 'period', type: 'varchar', length: 16 })
  period: string;

  @Column({ name: 'plan_hash', type: 'varchar', length: 64 })
  planHash: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'RUNNING' })
  status: 'RUNNING' | 'COMPLETED' | 'HOLD' | 'FAILED';

  @Column({ name: 'source_count', type: 'integer', default: 0 })
  sourceCount: number;

  @Column({ name: 'mapped_count', type: 'integer', default: 0 })
  mappedCount: number;

  @Column({ name: 'hold_count', type: 'integer', default: 0 })
  holdCount: number;

  @Column({ name: 'inserted_count', type: 'integer', default: 0 })
  insertedCount: number;

  @Column({ name: 'updated_count', type: 'integer', default: 0 })
  updatedCount: number;

  @Column({ name: 'source_total', type: 'numeric', precision: 18, scale: 2, default: 0 })
  sourceTotal: string;

  @Column({ name: 'mapped_total', type: 'numeric', precision: 18, scale: 2, default: 0 })
  mappedTotal: string;

  @Column({ name: 'details', type: 'jsonb', default: () => "'{}'::jsonb" })
  details: Record<string, unknown>;

  @Column({ name: 'requested_by', type: 'varchar', length: 128 })
  requestedBy: string;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
