import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { SysRoleEntity } from './sys-role.entity';
import { SysMenuEntity } from './sys-menu.entity';

/**
 * sys_role_menu_permission — 角色×菜单×CRUD 三元组
 * 核心权限矩阵：perm_codes 取值 V/C/E/D/A/X 或 * 通配
 *   V = View   (查看)
 *   C = Create (新增)
 *   E = Edit   (编辑)
 *   D = Delete (删除)
 *   A = Approve(审批)
 *   X = Export (导出)
 *   * = 全部
 */
@Entity('sys_role_menu_permission')
@Unique('sys_role_menu_permission_role_id_menu_id_key', ['role_id', 'menu_id'])
@Index('idx_sys_role_menu_perm_role', ['role_id'])
@Index('idx_sys_role_menu_perm_menu', ['menu_id'])
export class SysRoleMenuPermissionEntity {
  @PrimaryGeneratedColumn({ name: 'perm_id', type: 'bigint' })
  perm_id: number;

  @Column({ type: 'bigint' })
  role_id: number;

  @ManyToOne(() => SysRoleEntity)
  @JoinColumn({ name: 'role_id', referencedColumnName: 'role_id', foreignKeyConstraintName: 'sys_role_menu_permission_role_id_fkey' })
  role?: SysRoleEntity;

  @Column({ type: 'bigint' })
  menu_id: number;

  @ManyToOne(() => SysMenuEntity)
  @JoinColumn({ name: 'menu_id', referencedColumnName: 'menu_id', foreignKeyConstraintName: 'sys_role_menu_permission_menu_id_fkey' })
  menu?: SysMenuEntity;

  /** 逗号分隔的权限码集合，例如 "V,C,E" 或 "*" */
  @Column({ type: 'varchar', length: 32 })
  perm_codes: string;
}
