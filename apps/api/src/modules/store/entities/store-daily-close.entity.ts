import { Entity, Column } from 'typeorm';
import { BaseBizEntity } from '../../../common/entities/base.entity';

/**
 * 门店日结表 (推断自 V2 业务逻辑)
 */
@Entity('biz_store_daily_close')
export class StoreDailyCloseEntity extends BaseBizEntity {
  @Column({ type: 'date', comment: '结账日期' })
  close_date: Date;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, comment: '当日现金收入总额' })
  total_cash_amount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, comment: '当日微信/支付宝收入' })
  total_digital_amount: number;

  @Column({ type: 'int', default: 0, comment: '当日交易笔数' })
  transaction_count: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, comment: '实际盘点现金' })
  actual_cash_on_hand: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, comment: '上缴财务现金' })
  deposited_amount: number;

  @Column({ type: 'varchar', length: 8, default: 'LAK', comment: '结算币种 (老挝门店默认为老币)' })
  currency_code: string;

  @Column({ type: 'text', nullable: true, comment: '长短款备注说明' })
  discrepancy_note: string;
}
