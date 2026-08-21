import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * V3 采购单主表 — prc_purchase_orders
 * 与前端 useCrud('prc_purchase_orders') 对齐
 * 状态流: DRAFT → PENDING_APPROVAL → APPROVED → PARTIAL_RECEIVED → COMPLETED | CANCELLED
 */
@Entity('prc_purchase_orders')
export class PurchaseOrderEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  po_no: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  supplier_code: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  supplier_name: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  subject: string;          // 采购主题/摘要

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, nullable: true })
  total_amount: number | null;

  @Column({ type: 'varchar', length: 8, default: 'LAK', nullable: true })
  currency_code: string | null;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT', nullable: true })
  status: string | null;

  @Column({ type: 'int', default: 0, nullable: true })
  plan_qty: number | null;

  @Column({ type: 'int', default: 0, nullable: true })
  received_qty: number | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  store_code: string;

  @Column({ type: 'date', nullable: true })
  expected_date: string;    // 预计到货日期

  @Column({ type: 'varchar', length: 128, nullable: true })
  contract_no: string;        // 合同编号（自动生成，格式 HT-YYYY-NNNNN）

  @Column({ type: 'text', nullable: true })
  contract_note: string;      // 合同关键条款摘要

  @Column({ type: 'date', nullable: true })
  pay_deadline: string;       // 付款截止日

  @Column({ type: 'text', nullable: true })
  contract_url: string;       // 合同/单据文件路径

  @Column({ type: 'int', nullable: true })
  approver_id: number;        // 指定审批人 user_id

  @Column({ type: 'varchar', length: 64, nullable: true })
  approver_name: string;      // 审批人姓名快照

  @Column({ type: 'text', nullable: true })
  remark: string;

  @Column({ type: 'bigint', nullable: true })
  created_by: string;

  @Column({ type: 'bigint', nullable: true })
  approved_by: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
