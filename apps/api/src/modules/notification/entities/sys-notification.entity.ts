import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('sys_notifications')
export class SysNotificationEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  /** 收件用户 ID；NULL 表示公司级/系统级通知（信用预警、库存临期等） */
  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId: string | null;

  @Column({ name: 'notification_type', length: 32, default: 'WORKFLOW_TASK' })
  notificationType: string;

  @Column({ length: 256 })
  title: string;

  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ name: 'link_type', type: 'varchar', length: 32, nullable: true })
  linkType: string | null;

  @Column({ name: 'link_id', type: 'varchar', length: 64, nullable: true })
  linkId: string | null;

  @Column({ name: 'biz_type', type: 'varchar', length: 32, nullable: true })
  bizType: string | null;

  @Column({ name: 'biz_id', type: 'varchar', length: 64, nullable: true })
  bizId: string | null;

  @Column({ name: 'biz_no', type: 'varchar', length: 80, nullable: true })
  bizNo: string | null;

  /** 公司级通知的过滤键（信用/库存调度器写入，用于管理员按公司查看） */
  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string | null;

  @Column({ length: 16, default: 'UNREAD' })
  status: string;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
