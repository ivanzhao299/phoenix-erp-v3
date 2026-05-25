import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('sys_data_scopes')
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
