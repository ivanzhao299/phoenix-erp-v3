import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('sys_user_orgs')
export class SysUserOrgEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'org_id', type: 'bigint' })
  orgId: number;

  @Column({ name: 'is_primary', type: 'boolean' })
  isPrimary: boolean;

  @Column({ name: 'data_scope_level', type: 'varchar', length: 16 })
  dataScopeLevel: 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP';

  @Column({ name: 'position_title', type: 'varchar', length: 128, nullable: true })
  positionTitle: string | null;

  @Column({ name: 'is_manager', type: 'boolean', default: false })
  isManager: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
