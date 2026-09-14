import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('wf_approval_instance_steps')
@Index('idx_wf_istep_instance_id', ['instanceId'])
@Index('idx_wf_istep_instance_step', ['instanceId', 'stepNo'])
@Index('idx_wf_istep_status', ['status'])
@Index('idx_wf_istep_approver_user', ['approverUserId'], { where: '"approver_user_id" IS NOT NULL' })
@Index('idx_wf_istep_due_at', ['dueAt'], { where: '"due_at" IS NOT NULL' })
@Index('idx_wf_istep_overdue', ['isOverdue'], { where: '"is_overdue" = TRUE' })
@Index('idx_wf_istep_task', ['sourceTaskId'], { where: '"source_task_id" IS NOT NULL' })
export class WfApprovalInstanceStepEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'instance_id', type: 'bigint' })
  instanceId: string;

  @Column({ name: 'step_no' })
  stepNo: number;

  @Column({ name: 'approver_role', type: 'varchar', length: 255, nullable: true })
  approverRole: string;

  @Column({ name: 'approver_user_id', type: 'bigint', nullable: true })
  approverUserId: string | null;

  @Column({ name: 'approver_name', type: 'varchar', length: 255, nullable: true })
  approverName: string;

  @Column({ type: 'varchar', length: 255, default: 'PENDING' })
  status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  action: string;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ name: 'acted_at', type: 'timestamptz', nullable: true })
  actedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // ── 审计日志字段（Phase B 新增）──────────────────────────────────────────
  @Column({ name: 'actor_user_id', type: 'bigint', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'actor_username', type: 'varchar', length: 64, nullable: true })
  actorUsername: string | null;

  @Column({ name: 'required_role', type: 'varchar', length: 64, nullable: true })
  requiredRole: string | null;

  @Column({ name: 'allow_admin_override', default: false })
  allowAdminOverride: boolean;

  @Column({ name: 'approver_type', type: 'varchar', length: 32, default: 'ROLE' })
  approverType: string;

  // ── SLA 追踪（Phase F 新增）──────────────────────────────────────────────
  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  @Column({ name: 'is_overdue', default: false })
  isOverdue: boolean;

  @Column({ name: 'reminder_count', default: 0 })
  reminderCount: number;

  @Column({ name: 'last_reminded_at', type: 'timestamptz', nullable: true })
  lastRemindedAt: Date | null;

  @Column({ name: 'escalation_level', default: 0 })
  escalationLevel: number;

  @Column({ name: 'source_task_id', type: 'bigint', nullable: true })
  sourceTaskId: string | null;
}
