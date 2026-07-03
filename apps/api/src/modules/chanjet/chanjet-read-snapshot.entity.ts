import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, Unique,
} from 'typeorm';

/**
 * chanjet_read_snapshots — 好业财只读接口原始镜像快照。
 *
 * 仅保存 ERP 侧中间层只读拉取结果。不得用于写回好业财，不得直接覆盖 ERP 业务主表。
 */
@Entity('chanjet_read_snapshots')
@Unique('uq_chanjet_read_snapshot_payload', ['bookId', 'endpointKey', 'payloadHash'])
@Index('idx_chanjet_read_snapshots_endpoint', ['endpointKey'])
@Index('idx_chanjet_read_snapshots_book_endpoint', ['bookId', 'endpointKey'])
@Index('idx_chanjet_read_snapshots_pulled_at', ['pulledAt'])
export class ChanjetReadSnapshotEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'book_id', type: 'varchar', length: 64, default: '' })
  bookId: string;

  @Column({ name: 'endpoint_key', type: 'varchar', length: 64 })
  endpointKey: string;

  @Column({ name: 'api_domain', type: 'varchar', length: 64 })
  apiDomain: string;

  @Column({ name: 'api_path', type: 'varchar', length: 512 })
  apiPath: string;

  @Column({ name: 'method', type: 'varchar', length: 12 })
  method: 'GET' | 'POST';

  @Column({ name: 'period', type: 'varchar', length: 16, default: '' })
  period: string;

  @Column({ name: 'page_no', type: 'integer', default: 1 })
  pageNo: number;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash: string;

  @Column({ name: 'row_count', type: 'integer', default: 0 })
  rowCount: number;

  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload: Record<string, unknown>;

  @CreateDateColumn({ name: 'pulled_at', type: 'timestamptz' })
  pulledAt: Date;
}
