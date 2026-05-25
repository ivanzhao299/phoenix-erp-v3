import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('wf_approval_rule_steps')
export class WfApprovalRuleStepEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'rule_id', type: 'bigint' })
  ruleId: string;

  @Column({ name: 'step_no' })
  stepNo: number;

  @Column({ name: 'approver_type', default: 'ROLE' })
  approverType: string;

  @Column({ name: 'approver_role', nullable: true })
  approverRole: string;

  @Column({ name: 'approver_user_id', type: 'bigint', nullable: true })
  approverUserId: string | null;

  @Column({ name: 'org_scope', nullable: true })
  orgScope: string;

  @Column({ name: 'required_approval_count', default: 1 })
  requiredApprovalCount: number;

  @Column({ name: 'allow_admin_override', default: false })
  allowAdminOverride: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
