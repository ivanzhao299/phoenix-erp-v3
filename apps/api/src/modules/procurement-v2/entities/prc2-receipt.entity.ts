import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 收货记录头表  prc2_receipts */
@Entity('prc2_receipts')
@Index('idx_prc2_rcpt_status', ['status'])
@Index('idx_prc2_rcpt_po_id', ['poId'])
@Index('idx_prc2_rcpt_company', ['companyCode'], { where: '"company_code" IS NOT NULL' })
export class Prc2ReceiptEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'receipt_no', type: 'varchar', length: 80, unique: true })
  receiptNo: string;

  @Column({ name: 'po_id', type: 'bigint' })
  poId: string;

  @Column({ name: 'po_no', type: 'varchar', length: 80 })
  poNo: string;

  @Column({ name: 'shipment_id', type: 'bigint', nullable: true })
  shipmentId: string;

  @Column({ name: 'shipment_no', type: 'varchar', length: 80, nullable: true })
  shipmentNo: string;

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

  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
  warehouseCode: string;

  @Column({ name: 'receiver_id', type: 'bigint', nullable: true })
  receiverId: string;

  @Column({ name: 'receiver_name', type: 'varchar', length: 128, nullable: true })
  receiverName: string;

  @Column({ name: 'receipt_date', type: 'date', nullable: true })
  receiptDate: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ name: 'confirmed_by', type: 'bigint', nullable: true })
  confirmedBy: string;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date;

  @Column({ name: 'posted_by', type: 'bigint', nullable: true })
  postedBy: string;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt: Date;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
