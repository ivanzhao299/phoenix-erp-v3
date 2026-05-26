import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * 汇率表  fin_exchange_rates
 *
 * Finance V2 Phase 0 Clean Baseline（各 Phase 通用）
 *
 * 多币种核算基础。所有 fin_* 金额表均引用本表进行汇率查询。
 * 支持多种汇率类型（中间价、买入价、卖出价）和公司级自定义汇率。
 */
@Entity('fin_exchange_rates')
export class FinExchangeRateEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'from_currency', type: 'varchar', length: 10 })
  fromCurrency: string;

  @Column({ name: 'to_currency', type: 'varchar', length: 10 })
  toCurrency: string;

  @Column({ name: 'rate_date', type: 'date' })
  rateDate: string;

  @Column({ name: 'rate', type: 'numeric', precision: 20, scale: 8 })
  rate: number;

  /** MIDDLE / BUY / SELL */
  @Column({ name: 'rate_type', type: 'varchar', length: 20, default: 'MIDDLE' })
  rateType: string;

  /** 来源：MANUAL / PBOC / BLOOMBERG 等 */
  @Column({ name: 'source', type: 'varchar', length: 60, nullable: true })
  source: string;

  /** NULL = 全局汇率；有值 = 公司级自定义汇率 */
  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string;

  @Column({ name: 'created_by', type: 'varchar', length: 80, nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
