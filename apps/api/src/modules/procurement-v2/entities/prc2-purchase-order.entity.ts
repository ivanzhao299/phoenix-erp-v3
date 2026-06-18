import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 采购订单头表  prc2_purchase_orders */
@Entity('prc2_purchase_orders')
@Index('idx_prc2_po_status', ['status'])
@Index('idx_prc2_po_company', ['companyCode'], { where: '"company_code" IS NOT NULL' })
@Index('idx_prc2_po_project', ['projectCode'], { where: '"project_code" IS NOT NULL' })
@Index('idx_prc2_po_supplier', ['supplierCode'], { where: '"supplier_code" IS NOT NULL' })
@Index('idx_prc2_po_approval_status', ['approvalStatus'])
@Index('idx_prc2_po_source_req', ['sourceRequestId'], { where: '"source_request_id" IS NOT NULL' })
@Index('idx_prc2_po_contract_no', ['contractNo'])
export class Prc2PurchaseOrderEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'po_no', type: 'varchar', length: 80, unique: true })
  poNo: string;

  @Column({ name: 'source_request_id', type: 'bigint', nullable: true })
  sourceRequestId: string;

  @Column({ name: 'source_req_no', type: 'varchar', length: 80, nullable: true })
  sourceReqNo: string;

  // G135：contract_no **不**唯一——一份合同可拆多张采购订单（分公司承担/分期付款等）。
  //   原 unique 约束使"万象装修一份合同两公司各半"的第二张 PO 撞 23505→"数据已存在"保存失败。
  @Column({ name: 'contract_no', type: 'varchar', length: 128, nullable: true })
  contractNo: string;

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

  @Column({ name: 'supplier_id', type: 'bigint', nullable: true })
  supplierId: string;

  @Column({ name: 'supplier_code', type: 'varchar', length: 64, nullable: true })
  supplierCode: string;

  @Column({ name: 'supplier_name', type: 'varchar', length: 256, nullable: true })
  supplierName: string;

  @Column({ name: 'purchase_type', type: 'varchar', length: 32, nullable: true })
  purchaseType: string;

  @Column({ name: 'cross_border_flag', type: 'boolean', default: false })
  crossBorderFlag: boolean;

  @Column({ name: 'origin_country', type: 'varchar', length: 8, nullable: true })
  originCountry: string;

  @Column({ name: 'destination_country', type: 'varchar', length: 8, nullable: true })
  destinationCountry: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'LAK' })
  currencyCode: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'plan_qty', type: 'numeric', precision: 18, scale: 4, default: 0 })
  planQty: number;

  @Column({ name: 'received_qty', type: 'numeric', precision: 18, scale: 4, default: 0 })
  receivedQty: number;

  @Column({ name: 'paid_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ name: 'expected_date', type: 'date', nullable: true })
  expectedDate: string;

  @Column({ name: 'pay_deadline', type: 'date', nullable: true })
  payDeadline: string;

  @Column({ name: 'pay_terms', type: 'text', nullable: true })
  payTerms: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ name: 'approval_status', type: 'varchar', length: 32, default: 'NONE' })
  approvalStatus: string;

  @Column({ name: 'approver_id', type: 'bigint', nullable: true })
  approverId: string;

  @Column({ name: 'approver_name', type: 'varchar', length: 128, nullable: true })
  approverName: string;

  @Column({ name: 'approved_by', type: 'bigint', nullable: true })
  approvedBy: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date;

  @Column({ name: 'contract_url', type: 'text', nullable: true })
  contractUrl: string;

  @Column({ name: 'contract_note', type: 'text', nullable: true })
  contractNote: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
