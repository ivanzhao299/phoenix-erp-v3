import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 应付账款台账  prc2_ap_ledger */
@Entity('prc2_ap_ledger')
@Index('idx_prc2_ap_status', ['status'])
@Index('idx_prc2_ap_supplier', ['supplierCode'], { where: '"supplier_code" IS NOT NULL' })
@Index('idx_prc2_ap_company', ['companyCode'], { where: '"company_code" IS NOT NULL' })
@Index('idx_prc2_ap_due_date', ['dueDate'], { where: '"due_date" IS NOT NULL' })
export class Prc2ApLedgerEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'ap_no', type: 'varchar', length: 80, unique: true })
  apNo: string;

  @Column({ name: 'po_id', type: 'bigint', nullable: true, unique: true })
  poId: string;

  @Column({ name: 'po_no', type: 'varchar', length: 80, nullable: true })
  poNo: string;

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

  @Column({ name: 'currency_code', type: 'varchar', length: 8, nullable: true })
  currencyCode: string;

  @Column({ name: 'amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountOriginal: number;

  @Column({ name: 'paid_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  paidAmountOriginal: number;

  @Column({ name: 'balance_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  balanceAmountOriginal: number;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 8, default: 1 })
  exchangeRate: number;

  @Column({ name: 'amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountBase: number;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'OPEN' })
  status: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
