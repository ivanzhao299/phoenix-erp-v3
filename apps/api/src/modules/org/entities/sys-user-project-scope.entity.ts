import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('sys_user_project_scopes')
export class SysUserProjectScopeEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'project_code', type: 'varchar', length: 64 })
  projectCode: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
