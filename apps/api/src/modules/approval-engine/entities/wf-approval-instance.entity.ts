import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('wf_approval_instances')
@Index('idx_wf_inst_biz', ['bizType', 'bizId'])
@Index('idx_wf_inst_status', ['status'])
@Index('idx_wf_inst_module', ['moduleCode'])
@Index('idx_wf_inst_started_by', ['startedBy'], { where: '"started_by" IS NOT NULL' })
@Index('idx_wf_inst_rule_id', ['ruleId'], { where: '"rule_id" IS NOT NULL' })
@Index('idx_wf_inst_company', ['companyCode'], { where: '"company_code" IS NOT NULL' })
@Index('idx_wf_inst_form', ['formSubmissionId'], { where: '"form_submission_id" IS NOT NULL' })
export class WfApprovalInstanceEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'instance_no', unique: true })
  instanceNo: string;

  @Column({ name: 'module_code' })
  moduleCode: string;

  @Column({ name: 'biz_type' })
  bizType: string;

  @Column({ name: 'biz_id', type: 'bigint' })
  bizId: string;

  @Column({ name: 'biz_no', nullable: true })
  bizNo: string;

  @Column({ name: 'rule_id', type: 'bigint', nullable: true })
  ruleId: string | null;

  @Column({ name: 'total_steps', default: 1 })
  totalSteps: number;

  @Column({ name: 'current_step_no', default: 1 })
  currentStepNo: number;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({ name: 'started_by', type: 'bigint', nullable: true })
  startedBy: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'NOW()' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  // ── 业务摘要快照（Phase B 新增）────────────────────────────────────────
  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  amount: number | null;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, nullable: true })
  currencyCode: string | null;

  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string | null;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string | null;

  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string | null;

  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
  projectName: string | null;

  @Column({ name: 'subject', type: 'varchar', length: 256, nullable: true })
  subject: string | null;

  // ── Phase I: 表单提交关联 ──────────────────────────────────────────────────
  @Column({ name: 'form_submission_id', type: 'bigint', nullable: true })
  formSubmissionId: string | null;

  @Column({ name: 'form_code', type: 'varchar', length: 80, nullable: true })
  formCode: string | null;

  @Column({ name: 'form_version_id', type: 'bigint', nullable: true })
  formVersionId: string | null;
}
