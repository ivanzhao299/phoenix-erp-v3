import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('wf_approval_instance_steps')
export class WfApprovalInstanceStepEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'instance_id', type: 'bigint' })
  instanceId: string;

  @Column({ name: 'step_no' })
  stepNo: number;

  @Column({ name: 'approver_role', nullable: true })
  approverRole: string;

  @Column({ name: 'approver_user_id', type: 'bigint', nullable: true })
  approverUserId: string | null;

  @Column({ name: 'approver_name', nullable: true })
  approverName: string;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({ nullable: true })
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
