import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 统一客户主档  sal_customers
 *
 * Sales V2 Phase 0 — Clean Baseline
 *
 * 取代旧表（均已冻结为 READ_ONLY）：
 *   ord_customers  — 散客/B2B 混用，无 company_code，幽灵字段
 *   b2b_customers  — 经销商专用，字段重复，无统一主档
 *
 * customer_type:
 *   DIRECT_STORE  直营店
 *   DISTRIBUTOR   经销商
 *   AGENT         代理商
 *   KEY_ACCOUNT   大客户
 *   RETAIL        散客零售
 *
 * risk_level: NORMAL / WATCH / BLACKLIST
 * status:     ACTIVE / FROZEN / BLACKLIST
 */
@Entity('sal_customers')
export class SalCustomerEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'customer_no', type: 'varchar', length: 64, unique: true })
  customerNo: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 128 })
  customerName: string;

  @Column({ name: 'customer_type', type: 'varchar', length: 32, default: 'RETAIL' })
  customerType: string;

  @Column({ name: 'channel_code', type: 'varchar', length: 64, nullable: true })
  channelCode: string | null;

  @Column({ name: 'company_code', type: 'varchar', length: 64 })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string | null;

  @Column({ name: 'region_code', type: 'varchar', length: 64, nullable: true })
  regionCode: string | null;

  @Column({ name: 'credit_limit', type: 'numeric', precision: 18, scale: 2, default: 0 })
  creditLimit: number;

  @Column({ name: 'credit_used', type: 'numeric', precision: 18, scale: 2, default: 0 })
  creditUsed: number;

  @Column({ name: 'payment_terms', type: 'integer', default: 0 })
  paymentTerms: number;

  @Column({ name: 'risk_level', type: 'varchar', length: 32, default: 'NORMAL' })
  riskLevel: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'sales_rep_id', type: 'bigint', nullable: true })
  salesRepId: string | null;

  @Column({ name: 'sales_rep_name', type: 'varchar', length: 128, nullable: true })
  salesRepName: string | null;

  @Column({ name: 'contact_name', type: 'varchar', length: 128, nullable: true })
  contactName: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 64, nullable: true })
  contactPhone: string | null;

  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress: string | null;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
