import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, Unique, Check } from 'typeorm';

@Entity('wf_approval_instances')
@Check('ck_wf_inst_sales_trigger_codes', `biz_type <> 'SALES_ORDER' OR trigger_codes <@ ARRAY['BELOW_FLOOR_PRICE','CREDIT_OVER_LIMIT']::text[]`)
// Native GIN is owned by AddSalesOrderApprovalContext; retain it, never replace it with a btree.
@Index('idx_wf_inst_trigger_codes', { synchronize: false })
@Unique('wf_approval_instances_instance_no_key', ['instanceNo'])
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

  @Column({ name: 'instance_no', type: 'varchar', length: 255 })
  instanceNo: string;

  @Column({ name: 'module_code', type: 'varchar', length: 255 })
  moduleCode: string;

  @Column({ name: 'biz_type', type: 'varchar', length: 255 })
  bizType: string;

  @Column({ name: 'biz_id', type: 'bigint' })
  bizId: string;

  @Column({ name: 'biz_no', type: 'varchar', length: 255, nullable: true })
  bizNo: string;

  @Column({ name: 'rule_id', type: 'bigint', nullable: true })
  ruleId: string | null;

  @Column({ name: 'total_steps', default: 1 })
  totalSteps: number;

  @Column({ name: 'current_step_no', default: 1 })
  currentStepNo: number;

  @Column({ type: 'varchar', length: 255, default: 'PENDING' })
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

  @Column({ name: 'trigger_codes', type: 'text', array: true, default: () => "'{}'::text[]" })
  triggerCodes: string[];

  @Column({ name: 'context_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
  contextSnapshot: Record<string, unknown>;

  // ── Phase I: 表单提交关联 ──────────────────────────────────────────────────
  @Column({ name: 'form_submission_id', type: 'bigint', nullable: true })
  formSubmissionId: string | null;

  @Column({ name: 'form_code', type: 'varchar', length: 80, nullable: true })
  formCode: string | null;

  @Column({ name: 'form_version_id', type: 'bigint', nullable: true })
  formVersionId: string | null;
}
