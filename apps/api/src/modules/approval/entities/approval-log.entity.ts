import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

/**
 * 审批流转日志表
 */
@Entity('sys_approval_log')
export class ApprovalLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 64, comment: '单据类型' })
  doc_type: string;

  @Column({ type: 'bigint', comment: '单据ID' })
  doc_id: number;

  @Column({ type: 'varchar', length: 64, comment: '当前审批层级角色' })
  approver_role: string;

  @Column({ type: 'bigint', comment: '实际审批人ID' })
  approver_id: number;

  @Column({ type: 'varchar', length: 16, comment: '动作: APPROVED, REJECTED' })
  action: string;

  @Column({ type: 'text', nullable: true, comment: '审批意见' })
  comment: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
