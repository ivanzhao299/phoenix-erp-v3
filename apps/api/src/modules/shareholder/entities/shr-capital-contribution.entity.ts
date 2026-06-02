import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 出资台账  shr_capital_contributions */
@Entity('shr_capital_contributions')
export class ShrCapitalContributionEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'contribution_no', type: 'varchar', length: 64, unique: true })
  contributionNo: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64 })
  projectCode: string;

  @Column({ name: 'shareholder_code', type: 'varchar', length: 64 })
  shareholderCode: string;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  @Column({ name: 'currency', type: 'varchar', length: 8, default: 'CNY' })
  currency: string;

  @Column({ name: 'contribution_date', type: 'date', nullable: true })
  contributionDate: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 64, nullable: true })
  paymentMethod: string;

  /** BANK_TRANSFER/CASH/DIVIDEND_OFFSET/SHAREHOLDER_ADVANCE/OTHER */
  @Column({ name: 'source_type', type: 'varchar', length: 32, default: 'BANK_TRANSFER' })
  sourceType: string;

  @Column({ name: 'source_reference', type: 'varchar', length: 256, nullable: true })
  sourceReference: string;

  @Column({ name: 'bank_account', type: 'varchar', length: 128, nullable: true })
  bankAccount: string;

  /** 资本流状态机：DRAFT/SUBMITTED/APPROVED/CONFIRMED/CANCELLED/REVERSED（仅 CONFIRMED 参与汇总） */
  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  /** 资本流编号 CAP-YYYYMMDD-NNNNN（Phase 3 新增流；历史台账用 contribution_no） */
  @Column({ name: 'capital_flow_no', type: 'varchar', length: 64, nullable: true })
  capitalFlowNo: string;

  @Column({ name: 'attachment_count', type: 'int', default: 0 })
  attachmentCount: number;

  /** 附件 URL 列表（jsonb，复用 /api/upload/contract 上传通道；草稿期可增删，审批后只读） */
  @Column({ name: 'attachment_urls', type: 'jsonb', nullable: true })
  attachmentUrls: string[] | null;

  @Column({ name: 'wf_instance_id', type: 'bigint', nullable: true })
  wfInstanceId: string;

  @Column({ name: 'confirmed_by', type: 'bigint', nullable: true })
  confirmedBy: string;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date;

  /** Finance V2 桥接状态：READ_ONLY(默认) / MAPPED */
  @Column({ name: 'finance_bridge_status', type: 'varchar', length: 32, default: 'READ_ONLY' })
  financeBridgeStatus: string;

  /** 冲销指向被冲销记录 id（保留审计轨迹，不删历史） */
  @Column({ name: 'reversal_of_id', type: 'bigint', nullable: true })
  reversalOfId: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
