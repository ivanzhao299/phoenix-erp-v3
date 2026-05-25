import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/** 审批日志  prc2_approvals */
@Entity('prc2_approvals')
export class Prc2ApprovalEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'biz_type', type: 'varchar', length: 32 })
  bizType: string;

  @Column({ name: 'biz_id', type: 'bigint' })
  bizId: string;

  @Column({ name: 'biz_no', type: 'varchar', length: 80, nullable: true })
  bizNo: string;

  @Column({ name: 'approval_node', type: 'varchar', length: 64, nullable: true })
  approvalNode: string;

  @Column({ name: 'approver_id', type: 'bigint', nullable: true })
  approverId: string;

  @Column({ name: 'approver_name', type: 'varchar', length: 128, nullable: true })
  approverName: string;

  @Column({ name: 'action', type: 'varchar', length: 32, nullable: true })
  action: string;

  @Column({ name: 'comment', type: 'text', nullable: true })
  comment: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
