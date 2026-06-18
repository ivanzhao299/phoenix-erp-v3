import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  Check,
  CreateDateColumn,
} from 'typeorm';

@Entity('sys_user_orgs')
@Index('idx_user_orgs_user', ['userId'])
@Index('idx_user_orgs_org', ['orgId'])
@Unique('uq_user_org', ['userId', 'orgId'])
@Check('chk_user_org_scope_level', `data_scope_level IN ('SELF','PROJECT','COMPANY','REGION','GROUP','BU','SITE','DEPARTMENT','STORE','WAREHOUSE')`)
@Check('chk_user_org_role_scope', `role_scope IS NULL OR role_scope IN ('GROUP','BU','COMPANY','SITE','DEPARTMENT')`)
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
