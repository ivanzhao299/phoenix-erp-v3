import { Entity, Column } from 'typeorm';
import { BaseBizEntity } from '../../../common/entities/base.entity';

/**
 * 财务现金流水表
 * 支持“渣土款 / 鸡蛋款 / 押金 / 零星支出 / 结账解缴”等多场景
 */
@Entity('biz_cash_flow')
export class CashFlowEntity extends BaseBizEntity {
  @Column({ type: 'varchar', length: 32, comment: '资金流向: IN, OUT' })
  flow_type: string;

  @Column({ type: 'varchar', length: 64, comment: '款项类别: DEPOSIT, EXPENSE, SALES_REVENUE, TRASH_SALES 等' })
  category: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, comment: '发生金额' })
  amount: number;

  @Column({ type: 'varchar', length: 8, comment: '币种 (CNY 或 LAK)' })
  currency_code: string;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '付款方' })
  payer: string;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '收款方' })
  payee: string;

  @Column({ type: 'text', nullable: true, comment: '事由备注' })
  remark: string;

  @Column({ type: 'bigint', nullable: true, comment: '关联单据ID（如源销售订单ID，报销申请ID等）' })
  ref_doc_id: number;
}
