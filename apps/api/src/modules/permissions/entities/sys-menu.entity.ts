import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * sys_menu — 菜单表（V3 RBAC 设计）
 * 对应 ddl/01_create_rbac_tables.sql
 */
@Entity('sys_menu')
export class SysMenuEntity {
  @PrimaryGeneratedColumn({ name: 'menu_id', type: 'bigint' })
  menu_id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  menu_code: string;

  @Column({ type: 'varchar', length: 128 })
  menu_name_zh: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  menu_name_lo: string;

  /**
   * 业务域：COMMON | FINANCE | ORDER | STORE | FARM | QA | PKG | WMS | LOG | PRC | SALES
   * 用于前端按 domain 分组展示菜单
   */
  @Column({ type: 'varchar', length: 32 })
  domain: string;

  /** 父菜单 code（多级菜单支持） */
  @Column({ type: 'varchar', length: 64, nullable: true })
  parent_code: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  icon: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  route: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at: Date;
}
