import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * 操作日志（高敏感操作专用）
 * 表：sys_operation_logs
 * RBAC-1 安全加固 2026-05-25
 * g196-A1 1.1：补 4 个 @Index 装饰器,与 20260530_create_missing_sys_tables.sql 对齐
 */
@Entity('sys_operation_logs')
@Index('idx_oplogs_user', ['userId', 'createdAt'])
@Index('idx_oplogs_module', ['moduleCode', 'actionCode'])
@Index('idx_oplogs_biz', ['bizType', 'bizId'], { where: '"biz_type" IS NOT NULL' })
@Index('idx_oplogs_created', ['createdAt'])
export class SysOperationLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId: string | null;

  @Column({ name: 'username', type: 'varchar', length: 64, nullable: true })
  username: string | null;

  /** 执行时的首个角色代码 */
  @Column({ name: 'role_code', type: 'varchar', length: 64, nullable: true })
  roleCode: string | null;

  /** MENU 代码，如 MENU_PRC2_FUND */
  @Column({ name: 'module_code', type: 'varchar', length: 64, nullable: true })
  moduleCode: string | null;

  /** 操作类型：CREATE / APPROVE / VOID / IMPORT / DELETE / MODIFY */
  @Column({ name: 'action_code', type: 'varchar', length: 32, nullable: true })
  actionCode: string | null;

  /** 业务类型：PAYMENT / FUND / INIT / PERMISSION / CONFIG / AP */
  @Column({ name: 'biz_type', type: 'varchar', length: 64, nullable: true })
  bizType: string | null;

  @Column({ name: 'biz_id', type: 'bigint', nullable: true })
  bizId: string | null;

  /** 业务单号快照（如 PAY-20260525-00001） */
  @Column({ name: 'biz_no', type: 'varchar', length: 80, nullable: true })
  bizNo: string | null;

  @Column({ name: 'request_method', type: 'varchar', length: 8, nullable: true })
  requestMethod: string | null;

  @Column({ name: 'request_path', type: 'varchar', length: 256, nullable: true })
  requestPath: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  /** 操作前数据快照（JSON） */
  @Column({ name: 'before_data', type: 'jsonb', nullable: true })
  beforeData: Record<string, any> | null;

  /** 操作后数据快照（JSON） */
  @Column({ name: 'after_data', type: 'jsonb', nullable: true })
  afterData: Record<string, any> | null;

  /** SUCCESS / FAIL / ERROR */
  @Column({ name: 'result_status', type: 'varchar', length: 16, default: 'SUCCESS' })
  resultStatus: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
