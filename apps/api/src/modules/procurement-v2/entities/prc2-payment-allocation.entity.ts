import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 付款分摊  prc2_payment_allocations
 *  说明：一笔付款可分摊到多张PO、多个项目 */
@Entity('prc2_payment_allocations')
@Index('idx_prc2_palloc_payment', ['paymentId'])
@Index('idx_prc2_palloc_po', ['poId'], { where: '"po_id" IS NOT NULL' })
@Index('idx_prc2_palloc_ap', ['apId'], { where: '"ap_id" IS NOT NULL' })
export class Prc2PaymentAllocationEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'payment_id', type: 'bigint' })
  paymentId: string;

  @Column({ name: 'po_id', type: 'bigint', nullable: true })
  poId: string;

  @Column({ name: 'po_no', type: 'varchar', length: 80, nullable: true })
  poNo: string;

  @Column({ name: 'ap_id', type: 'bigint', nullable: true })
  apId: string;

  @Column({ name: 'ap_no', type: 'varchar', length: 80, nullable: true })
  apNo: string;

  /** ── 多公司维度 ── */
  @Column({ name: 'company_id', type: 'bigint', nullable: true })
  companyId: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string;

  /** ── 多项目维度（行级快照，支持跨项目分摊） ── */
  @Column({ name: 'project_id', type: 'bigint', nullable: true })
  projectId: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string;

  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
  projectName: string;

  @Column({ name: 'allocated_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
  allocatedAmountOriginal: number;

  @Column({ name: 'allocated_amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  allocatedAmountBase: number;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
