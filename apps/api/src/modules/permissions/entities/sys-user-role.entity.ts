import { Entity, PrimaryColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { SysUserEntity } from '../../../auth/entities/sys-user.entity';
import { SysRoleEntity } from './sys-role.entity';

/**
 * sys_user_role — 用户-角色关联表（多对多）
 * 复合主键：(user_id, role_id)
 */
@Entity('sys_user_role')
@Index('idx_sys_user_role_user', ['user_id'])
@Index('idx_sys_user_role_role', ['role_id'])
@Index('uq_sys_user_role_one_visible_primary', ['user_id'], { unique: true, where: 'is_primary = true AND COALESCE(is_visible, true) = true' })
export class SysUserRoleEntity {
  @PrimaryColumn({ type: 'bigint', primaryKeyConstraintName: 'sys_user_role_pkey' })
  user_id: string;

  @ManyToOne(() => SysUserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'sys_user_role_user_id_fkey' })
  user?: SysUserEntity;

  @PrimaryColumn({ type: 'bigint', primaryKeyConstraintName: 'sys_user_role_pkey' })
  role_id: number;

  @ManyToOne(() => SysRoleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id', referencedColumnName: 'role_id', foreignKeyConstraintName: 'sys_user_role_role_id_fkey' })
  role?: SysRoleEntity;

  @Column({ type: 'boolean', default: true, comment: '前台是否显示该角色名（纯显示，不影响权限）' })
  is_visible: boolean;

  /** 是否主角色（用户多角色时，主角色用于审批/单据归属判断） */
  @Column({ type: 'boolean', default: false })
  is_primary: boolean;

  @CreateDateColumn({ name: 'granted_at', type: 'timestamp' })
  granted_at: Date;

  @Column({ type: 'bigint', nullable: true })
  granted_by: string | null;

  @ManyToOne(() => SysUserEntity)
  @JoinColumn({ name: 'granted_by', referencedColumnName: 'id', foreignKeyConstraintName: 'sys_user_role_granted_by_fkey' })
  granter?: SysUserEntity;
}
