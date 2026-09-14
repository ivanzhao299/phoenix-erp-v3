import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, Unique } from 'typeorm';

@Entity('wf_approval_rules')
@Unique('wf_approval_rules_rule_code_key', ['ruleCode'])
@Index('idx_wf_rule_module_biz', ['moduleCode', 'bizType'])
@Index('idx_wf_rule_enabled', ['enabled'])
@Index('idx_wf_rule_priority', ['priority'])
@Index('idx_wf_rule_company', ['companyCode'], { where: '"company_code" IS NOT NULL' })
export class WfApprovalRuleEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'rule_code', type: 'varchar', length: 255 })
  ruleCode: string;

  @Column({ name: 'module_code', type: 'varchar', length: 255 })
  moduleCode: string;

  @Column({ name: 'biz_type', type: 'varchar', length: 255 })
  bizType: string;

  @Column({ name: 'org_type', type: 'varchar', length: 255, nullable: true })
  orgType: string;

  @Column({ name: 'company_code', type: 'varchar', length: 255, nullable: true })
  companyCode: string;

  @Column({ name: 'project_code', type: 'varchar', length: 255, nullable: true })
  projectCode: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 255, nullable: true })
  currencyCode: string;

  @Column({ name: 'min_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  minAmount: number;

  @Column({ name: 'max_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  maxAmount: number | null;

  @Column({ name: 'condition_json', type: 'jsonb', nullable: true })
  conditionJson: Record<string, any> | null;

  @Column({ name: 'approval_mode', type: 'varchar', length: 255, default: 'SEQUENTIAL' })
  approvalMode: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ default: 100 })
  priority: number;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
