import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('bug_reports')
@Unique('UQ_bug_reports_bug_no', ['bugNo'])
@Check('CHK_bug_reports_status', `"status" IN ('OPEN','TRIAGED','IN_PROGRESS','RESOLVED','CLOSED','REJECTED')`)
@Check('CHK_bug_reports_severity', `"severity" IN ('LOW','MEDIUM','HIGH','CRITICAL')`)
@Check('CHK_bug_reports_priority', `"priority" IN ('P0','P1','P2','P3')`)
@Index('IDX_bug_reports_status_created', ['status', 'createdAt'])
@Index('IDX_bug_reports_reporter', ['reporterUsername'])
@Index('IDX_bug_reports_priority_status', ['priority', 'status'])
@Index('IDX_bug_reports_assignee', ['assigneeUsername'])
export class BugReportEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'bug_no', type: 'varchar', length: 32 })
  bugNo: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 16, default: 'MEDIUM' })
  severity: string;

  @Column({ type: 'varchar', length: 24, default: 'OPEN' })
  status: string;

  @Column({ type: 'varchar', length: 16, default: 'P2' })
  priority: string;

  @Column({ name: 'module_code', type: 'varchar', length: 64, default: '' })
  moduleCode: string;

  @Column({ name: 'assignee_username', type: 'varchar', length: 128, default: '' })
  assigneeUsername: string;

  @Column({ name: 'assignee_name', type: 'varchar', length: 128, default: '' })
  assigneeName: string;

  @Column({ name: 'repair_task_no', type: 'varchar', length: 48, default: '' })
  repairTaskNo: string;

  @Column({ name: 'repair_task_status', type: 'varchar', length: 24, default: '' })
  repairTaskStatus: string;

  @Column({ name: 'repair_task_payload', type: 'jsonb', default: () => "'{}'::jsonb" })
  repairTaskPayload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, default: '' })
  route: string;

  @Column({ type: 'text', default: '' })
  url: string;

  @Column({ name: 'reporter_user_id', type: 'varchar', length: 64, default: '' })
  reporterUserId: string;

  @Column({ name: 'reporter_username', type: 'varchar', length: 128, default: '' })
  reporterUsername: string;

  @Column({ name: 'reporter_name', type: 'varchar', length: 128, default: '' })
  reporterName: string;

  @Column({ name: 'roles', type: 'jsonb', default: () => "'[]'::jsonb" })
  roles: string[];

  @Column({ name: 'company_code', type: 'varchar', length: 64, default: '' })
  companyCode: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64, default: '' })
  projectCode: string;

  @Column({ name: 'console_errors', type: 'jsonb', default: () => "'[]'::jsonb" })
  consoleErrors: unknown[];

  @Column({ name: 'failed_requests', type: 'jsonb', default: () => "'[]'::jsonb" })
  failedRequests: unknown[];

  @Column({ name: 'attachments', type: 'jsonb', default: () => "'[]'::jsonb" })
  attachments: unknown[];

  @Column({ name: 'client_context', type: 'jsonb', default: () => "'{}'::jsonb" })
  clientContext: Record<string, unknown>;

  @Column({ name: 'resolution_note', type: 'text', default: '' })
  resolutionNote: string;

  @Column({ name: 'updated_by', type: 'varchar', length: 128, default: '' })
  updatedBy: string;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
