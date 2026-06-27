import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 供应商主档  prc2_suppliers
 *  shared_scope: GROUP=集团共享 / COMPANY=单公司专用 / PROJECT=项目专用 */
@Entity('prc2_suppliers')
@Index('idx_prc2_sup_status', ['status'])
@Index('idx_prc2_sup_scope', ['sharedScope'])
@Index('idx_prc2_sup_company', ['ownerCompanyCode'], { where: '"owner_company_code" IS NOT NULL' })
export class Prc2SupplierEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'supplier_code', type: 'varchar', length: 64, unique: true })
  supplierCode: string;

  @Column({ name: 'supplier_name', type: 'varchar', length: 256 })
  supplierName: string;

  @Column({ name: 'supplier_name_en', type: 'varchar', length: 256, nullable: true })
  supplierNameEn: string;

  @Column({ name: 'country_code', type: 'varchar', length: 8, nullable: true })
  countryCode: string;

  @Column({ name: 'supplier_type', type: 'varchar', length: 32, nullable: true })
  supplierType: string;

  @Column({ name: 'default_currency', type: 'varchar', length: 8, nullable: true })
  defaultCurrency: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 64, nullable: true })
  contactName: string;

  @Column({ name: 'contact_phone', type: 'varchar', length: 32, nullable: true })
  contactPhone: string;

  @Column({ name: 'contact_email', type: 'varchar', length: 128, nullable: true })
  contactEmail: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 128, nullable: true })
  bankName: string;

  @Column({ name: 'bank_account_name', type: 'varchar', length: 128, nullable: true })
  bankAccountName: string;

  @Column({ name: 'bank_account_no', type: 'varchar', length: 64, nullable: true })
  bankAccountNo: string;

  @Column({ name: 'bank_swift', type: 'varchar', length: 32, nullable: true })
  bankSwift: string;

  @Column({ name: 'tax_no', type: 'varchar', length: 64, nullable: true })
  taxNo: string;

  @Column({ name: 'address', type: 'text', nullable: true })
  address: string;

  @Column({ name: 'credit_days', type: 'int', default: 30, nullable: true })
  creditDays: number;

  @Column({ name: 'payment_terms', type: 'text', nullable: true })
  paymentTerms: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** 共享范围：GROUP / COMPANY / PROJECT */
  @Column({ name: 'shared_scope', type: 'varchar', length: 32, default: 'GROUP' })
  sharedScope: string;

  /** 归属公司（仅 shared_scope=COMPANY 或 PROJECT 时有效） */
  @Column({ name: 'owner_company_id', type: 'bigint', nullable: true })
  ownerCompanyId: string;

  @Column({ name: 'owner_company_code', type: 'varchar', length: 64, nullable: true })
  ownerCompanyCode: string;

  @Column({ name: 'owner_company_name', type: 'varchar', length: 256, nullable: true })
  ownerCompanyName: string;

  /** 归属项目（仅 shared_scope=PROJECT 时有效） */
  @Column({ name: 'owner_project_id', type: 'bigint', nullable: true })
  ownerProjectId: string;

  @Column({ name: 'owner_project_code', type: 'varchar', length: 64, nullable: true })
  ownerProjectCode: string;

  @Column({ name: 'owner_project_name', type: 'varchar', length: 256, nullable: true })
  ownerProjectName: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
