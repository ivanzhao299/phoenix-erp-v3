import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * sys_role — 角色表（V3 RBAC 设计）
 * 对应 ddl/01_create_rbac_tables.sql
 */
@Entity('sys_role')
export class SysRoleEntity {
  @PrimaryGeneratedColumn({ name: 'role_id', type: 'bigint' })
  role_id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  role_code: string;

  @Column({ type: 'varchar', length: 128 })
  role_name_zh: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  role_name_lo: string;

  /**
   * 角色业务域分类
   * SYSTEM | DECISION | FINANCE | MANAGEMENT | PRODUCTION | QUALITY |
   * PACKAGING | WAREHOUSE | LOGISTICS | COMMON | PROCUREMENT | STORE | SALES | EXTERNAL
   */
  @Column({ type: 'varchar', length: 32 })
  role_type: string;

  /** 审批级别 0-99，越高越尊贵 */
  @Column({ type: 'smallint', default: 0 })
  approval_level: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  /** 生命周期：ACTIVE 正常 / DEPRECATED 已停用（从编辑页隐藏，保留可恢复） */
  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'deprecated_at', type: 'timestamp', nullable: true })
  deprecated_at: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at: Date;
}
