import { Entity, PrimaryGeneratedColumn, Column, Unique, CreateDateColumn } from 'typeorm';

/**
 * sys_role_conflict — 岗位分离冲突表（DDL 新增，对应 RACI 文档红线规则）
 * 当角色被授予 menu_a 和 menu_b 两个互斥权限时，触发冲突预警
 *
 * 例：
 *   menu_a=MENU_FIN_CLOSE, menu_b=MENU_FIN_AUDIT
 *   reason='收款登记人不得参与坏账核销（防内外勾结）'
 *   severity=WARN | BLOCK | INFO
 */
@Entity('sys_role_conflict')
@Unique('sys_role_conflict_menu_a_menu_b_key', ['menu_a', 'menu_b'])
export class SysRoleConflictEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 64 })
  menu_a: string;

  @Column({ type: 'varchar', length: 64 })
  menu_b: string;

  @Column({ type: 'text', nullable: true })
  reason_zh: string;

  @Column({ type: 'varchar', length: 16, default: 'WARN' })
  severity: 'WARN' | 'BLOCK' | 'INFO';

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at: Date;
}
