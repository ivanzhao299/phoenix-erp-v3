import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

/**
 * 审批流规则配置表
 * 落实 V3.0 §13.3 规范，并支持用户指定的三级审批链
 */
@Entity('sys_approval_rule')
export class ApprovalRuleEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  rule_id: number;

  @Column({ type: 'varchar', length: 64, comment: '单据类型，如 CASH_EXPENSE' })
  doc_type: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, comment: '最小触发金额' })
  amount_min: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true, comment: '最大触发金额（NULL代表无上限）' })
  amount_max: number;

  @Column({ type: 'varchar', length: 8, default: 'CNY', comment: '阈值设定的币种' })
  currency_code: string;

  @Column({ 
    type: 'jsonb', 
    comment: '审批角色链，例: ["ROLE_FARM_MGR", "ROLE_COMPANY_GM", "ROLE_GROUP_PRESIDENT"]' 
  })
  approver_chain: string[];

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
