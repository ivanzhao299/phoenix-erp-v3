import { Entity, Column, Index, Unique, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

/**
 * chanjet_ar_snapshot — 好业财应收统计表快照(只读好业财→写 PG)
 *
 * 来源:GET /accounting/gl/statistics/receive/{bookid}?period=YYYYMM
 * 唯一性:同账套+期间+往来单位+科目 = 一行(upsert)
 * 币种:好业财账套基础币种(报告里 baseCurrencyId=100001 三家账套均为 LAK)
 */
@Entity('chanjet_ar_snapshot')
@Unique('uq_chanjet_ar', ['bookid', 'period', 'assistantCustomerCode', 'subjectId'])
@Index('idx_chanjet_ar_book_period', ['bookid', 'period'])
@Index('idx_chanjet_ar_synced_at', ['syncedAt'])
export class ChanjetArSnapshotEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'bookid', type: 'varchar', length: 64 })
  bookid: string;

  @Column({ name: 'period', type: 'varchar', length: 6 })
  period: string;

  @Column({ name: 'assistant_customer_code', type: 'varchar', length: 64, nullable: true })
  assistantCustomerCode: string | null;

  @Column({ name: 'assistant_customer_id', type: 'varchar', length: 64, nullable: true })
  assistantCustomerId: string | null;

  @Column({ name: 'subject_id', type: 'varchar', length: 64, nullable: true })
  subjectId: string | null;

  @Column({ name: 'subject_name', type: 'varchar', length: 256, nullable: true })
  subjectName: string | null;

  @Column({ name: 'init_balance', type: 'numeric', precision: 18, scale: 2, default: 0 })
  initBalance: string;

  @Column({ name: 'current_period_jf', type: 'numeric', precision: 18, scale: 2, default: 0 })
  currentPeriodJf: string;

  @Column({ name: 'current_period_df', type: 'numeric', precision: 18, scale: 2, default: 0 })
  currentPeriodDf: string;

  @Column({ name: 'endbalance', type: 'numeric', precision: 18, scale: 2, default: 0 })
  endbalance: string;

  @Column({ name: 'year_jf_accumulate', type: 'numeric', precision: 18, scale: 2, default: 0 })
  yearJfAccumulate: string;

  @Column({ name: 'year_df_accumulate', type: 'numeric', precision: 18, scale: 2, default: 0 })
  yearDfAccumulate: string;

  @Column({ name: 'currency', type: 'varchar', length: 8, default: 'LAK' })
  currency: string;

  @Column({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'synced_at', type: 'timestamptz' })
  syncedAt: Date;
}
