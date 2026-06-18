import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  CreateDateColumn,
} from 'typeorm';

@Entity('sys_data_scopes')
@Index('idx_data_scopes_role', ['roleCode'])
@Index('idx_data_scopes_module', ['moduleCode'])
@Index('idx_data_scopes_enabled', ['enabled'], { where: '"enabled" = TRUE' })
@Unique('uq_data_scope_role_module', ['roleCode', 'moduleCode'])
export class SysDataScopeEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'role_code', type: 'varchar', length: 64 })
  roleCode: string;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode: string;

  @Column({
    name: 'scope_type',
    type: 'varchar',
    length: 16,
    default: 'COMPANY',
  })
  scopeType: 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP';

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
