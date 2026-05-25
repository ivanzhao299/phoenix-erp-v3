import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('wf_approval_rules')
export class WfApprovalRuleEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'rule_code', unique: true })
  ruleCode: string;

  @Column({ name: 'module_code' })
  moduleCode: string;

  @Column({ name: 'biz_type' })
  bizType: string;

  @Column({ name: 'org_type', nullable: true })
  orgType: string;

  @Column({ name: 'company_code', nullable: true })
  companyCode: string;

  @Column({ name: 'project_code', nullable: true })
  projectCode: string;

  @Column({ name: 'currency_code', nullable: true })
  currencyCode: string;

  @Column({ name: 'min_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  minAmount: number;

  @Column({ name: 'max_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  maxAmount: number | null;

  @Column({ name: 'condition_json', type: 'jsonb', nullable: true })
  conditionJson: Record<string, any> | null;

  @Column({ name: 'approval_mode', default: 'SEQUENTIAL' })
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
