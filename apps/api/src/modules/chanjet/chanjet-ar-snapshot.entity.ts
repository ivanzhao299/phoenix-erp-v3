import { Entity, Column, Index, Unique, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

/**
 * chanjet_ar_snapshot — 好业财应收统计表快照(只读好业财→写 PG)
 *
 * 来源:GET /accounting/gl/statistics/receive/{bookid}?period=YYYYMM
 * 唯一性:bookid+period+dept_code+往来单位+科目(同部门覆盖,跨部门并存)
 * DataScope:通过 company_code 字段过滤(集团 isGlobal 看全部,其他按 allowedCompanyCodes)
 * 币种:好业财 endbalance 字段返回的是本币 RMB;原币 LAK 待找好业财对应字段
 */
@Entity('chanjet_ar_snapshot')
@Unique('uq_chanjet_ar_v2', ['bookid', 'period', 'deptCode', 'assistantCustomerCode', 'subjectId'])
@Index('idx_chanjet_ar_book_period', ['bookid', 'period'])
@Index('idx_chanjet_ar_company_period', ['companyCode', 'period'])
@Index('idx_chanjet_ar_synced_at', ['syncedAt'])
export class ChanjetArSnapshotEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'bookid', type: 'varchar', length: 64 })
  bookid: string;

  /** ERP 公司 code(DataScope 字段,通过 chanjet_book_company_map 映射) */
  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string | null;

  /** 部门 code(占位,待好业财部门维度接口) — NOT NULL DEFAULT '' 让唯一约束真生效 */
  @Column({ name: 'dept_code', type: 'varchar', length: 64, default: '' })
  deptCode: string;

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

  @Column({ name: 'currency', type: 'varchar', length: 8, default: 'RMB' })
  currency: string;

  @Column({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'synced_at', type: 'timestamptz' })
  syncedAt: Date;
}
