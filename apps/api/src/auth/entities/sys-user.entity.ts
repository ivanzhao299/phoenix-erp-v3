import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * 对应 V3.0 PostgreSQL 的 sys_user 表
 * 字段名严格与数据库实际列名一致
 */
@Entity('sys_user')
@Index('idx_user_store', ['store_code'])
export class SysUserEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  username: string;

  @Column({ type: 'varchar', nullable: true })
  password_hash: string;

  @Column({ type: 'varchar', nullable: true })
  salt: string;

  @Column({ type: 'varchar', nullable: true })
  real_name_zh: string;

  @Column({ type: 'varchar', nullable: true })
  real_name_lo: string;

  @Column({ type: 'varchar', nullable: true })
  role: string;

  @Column({ type: 'varchar', default: 'ALL' })
  store_code: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  locale: string;

  @Column({ type: 'text', nullable: true })
  permissions: string; // JSON string

  @Column({ type: 'varchar', nullable: true })
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  user_type: string;

  @Column({ name: 'manager_user_id', type: 'bigint', nullable: true })
  managerUserId: number | null;
}
