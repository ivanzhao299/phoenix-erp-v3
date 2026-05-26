import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
} from 'typeorm';

/**
 * 收款核销分摊  fin_ar_receipt_allocations
 *
 * Finance V2 Phase 2 — AR Runtime
 *
 * 约束：
 *   - 一笔收款可分摊到多个 AR
 *   - 一个 AR 可被多次部分收款
 *   - allocated_amount_original 必须 > 0
 *   - 不允许超额核销（Service 层校验 + balance_nonneg DDL 兜底）
 */
@Entity('fin_ar_receipt_allocations')
export class FinArReceiptAllocationEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  // ── 收款单 ────────────────────────────────────────────────────────────────
  @Column({ name: 'receipt_id', type: 'bigint' })
  receiptId: string;

  @Column({ name: 'receipt_no', type: 'varchar', length: 60 })
  receiptNo: string;

  // ── AR 发票 ───────────────────────────────────────────────────────────────
  @Column({ name: 'ar_invoice_id', type: 'bigint' })
  arInvoiceId: string;

  @Column({ name: 'ar_no', type: 'varchar', length: 60 })
  arNo: string;

  // ── 分摊金额 ──────────────────────────────────────────────────────────────
  @Column({ name: 'allocated_amount_original', type: 'numeric', precision: 18, scale: 2 })
  allocatedAmountOriginal: number;

  @Column({ name: 'allocated_amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
  allocatedAmountBase: number;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'CNY' })
  currencyCode: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
