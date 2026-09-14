import { Entity, PrimaryGeneratedColumn, Column, Index, Unique, Check, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** Physical V3 user storage; API aliases remain in the auth/user DTO projections. */
@Entity('sys_user')
@Unique('sys_user_username_key', ['username'])
@Check('chk_sys_user_status_lifecycle', 'status IN (-1, 0, 1)')
@Index('idx_user_store', ['store_code'])
@Index('idx_sys_user_status', ['status'])
@Index('idx_sys_user_archived_at', ['archived_at'])
export class SysUserEntity {
  // Preserve the id property/relation target, but map it to the actual bigint PK.
  // PostgreSQL bigint is a decimal string; never round it through Number on hydration.
  @PrimaryGeneratedColumn('increment', { name: 'user_id', type: 'bigint', primaryKeyConstraintName: 'sys_user_pkey' })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ type: 'varchar', length: 256 })
  password_hash: string;

  @Column({ type: 'varchar', length: 64 })
  real_name: string;

  @Column({ type: 'varchar', length: 64, nullable: true, default: 'ALL' })
  store_code: string | null;

  @Column({ type: 'smallint', default: 1 })
  status: number;

  @Column({ type: 'varchar', length: 8, default: 'zh-CN' })
  locale: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  email: string | null;

  @Column({ type: 'timestamp', nullable: true })
  last_login_at: Date | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'now()' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'now()' })
  updated_at: Date;

  // Existing note is deliberately uninterpreted: no TEST/locale inference or backfill.
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'bigint', default: 1 })
  perms_version: string;

  @Column({ type: 'timestamp', nullable: true })
  archived_at: Date | null;

  @Column({ type: 'bigint', nullable: true })
  archived_by: string | null;

  @Column({ type: 'text', nullable: true })
  archive_reason: string | null;

  // Compatibility properties are not independent physical columns. Real HTTP DTOs
  // are projected by AuthService/BFF/SystemUsersController, retaining their aliases.
  get real_name_zh(): string { return this.real_name; }
  set real_name_zh(value: string) { this.real_name = value; }
  salt?: string;
  real_name_lo?: string;
  role?: string;
  permissions?: string;
  user_type?: string;
  managerUserId?: string | null;
}
