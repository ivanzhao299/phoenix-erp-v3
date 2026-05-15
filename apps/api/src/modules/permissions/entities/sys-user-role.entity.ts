import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * sys_user_role — 用户-角色关联表（多对多）
 * 复合主键：(user_id, role_id)
 */
@Entity('sys_user_role')
export class SysUserRoleEntity {
  @PrimaryColumn({ type: 'bigint' })
  user_id: number;

  @PrimaryColumn({ type: 'bigint' })
  role_id: number;

  /** 是否主角色（用户多角色时，主角色用于审批/单据归属判断） */
  @Column({ type: 'boolean', default: false })
  is_primary: boolean;

  @CreateDateColumn({ name: 'granted_at', type: 'timestamp' })
  granted_at: Date;

  @Column({ type: 'bigint', nullable: true })
  granted_by: number;
}
