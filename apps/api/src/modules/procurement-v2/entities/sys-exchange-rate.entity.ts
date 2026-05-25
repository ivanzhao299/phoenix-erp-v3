import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 汇率表  sys_exchange_rates */
@Entity('sys_exchange_rates')
export class SysExchangeRateEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'rate_date', type: 'date' })
  rateDate: string;

  @Column({ name: 'from_currency', type: 'varchar', length: 8 })
  fromCurrency: string;

  @Column({ name: 'to_currency', type: 'varchar', length: 8 })
  toCurrency: string;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 8 })
  exchangeRate: number;

  @Column({ name: 'source', type: 'varchar', length: 32, default: 'MANUAL' })
  source: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
