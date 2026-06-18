import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 采购申请头表  prc2_purchase_requests */
@Entity('prc2_purchase_requests')
@Index('idx_prc2_req_status', ['status'])
@Index('idx_prc2_req_company', ['companyCode'], { where: '"company_code" IS NOT NULL' })
@Index('idx_prc2_req_project', ['projectCode'], { where: '"project_code" IS NOT NULL' })
@Index('idx_prc2_req_requester', ['requesterId'], { where: '"requester_id" IS NOT NULL' })
export class Prc2PurchaseRequestEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'req_no', type: 'varchar', length: 80, unique: true })
  reqNo: string;

  @Column({ name: 'subject', type: 'varchar', length: 256 })
  subject: string;

  /** ── 多公司维度 ── */
  @Column({ name: 'company_id', type: 'bigint', nullable: true })
  companyId: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string;

  /** ── 多项目维度 ── */
  @Column({ name: 'project_id', type: 'bigint', nullable: true })
  projectId: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string;

  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
  projectName: string;

  @Column({ name: 'purchase_type', type: 'varchar', length: 32, nullable: true })
  purchaseType: string;

  @Column({ name: 'urgency', type: 'varchar', length: 20, default: 'NORMAL' })
  urgency: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'LAK' })
  currencyCode: string;

  @Column({ name: 'estimated_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  estimatedAmount: number;

  @Column({ name: 'requester_id', type: 'bigint', nullable: true })
  requesterId: string;

  @Column({ name: 'requester_name', type: 'varchar', length: 128, nullable: true })
  requesterName: string;

  @Column({ name: 'dept_code', type: 'varchar', length: 64, nullable: true })
  deptCode: string;

  @Column({ name: 'expected_date', type: 'date', nullable: true })
  expectedDate: string;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ name: 'converted_po_id', type: 'bigint', nullable: true })
  convertedPoId: string;

  @Column({ name: 'converted_po_no', type: 'varchar', length: 80, nullable: true })
  convertedPoNo: string;

  @Column({ name: 'attachment_url', type: 'text', nullable: true })
  attachmentUrl: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
