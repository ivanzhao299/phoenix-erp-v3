import {
  Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn,
} from 'typeorm';

/**
 * 销售渠道主档  sal_channels
 *
 * Sales V2 Phase 0 — Clean Baseline
 *
 * channel_type: DIRECT / DISTRIBUTOR / AGENT / RETAIL
 * status:       ACTIVE / INACTIVE
 */
@Entity('sal_channels')
@Index('idx_sal_channels_company', ['companyCode'])
export class SalChannelEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'channel_code', type: 'varchar', length: 64, unique: true })
  channelCode: string;

  @Column({ name: 'channel_name', type: 'varchar', length: 128 })
  channelName: string;

  @Column({ name: 'channel_type', type: 'varchar', length: 32, default: 'RETAIL' })
  channelType: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string | null;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
