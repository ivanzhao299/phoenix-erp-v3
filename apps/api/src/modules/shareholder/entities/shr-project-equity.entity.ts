import {
  Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 项目股权结构  shr_project_equity
 *  equity_ratio 按百分比保存（如 59.8）；unpaid_capital 为数据库计算列 */
@Entity('shr_project_equity')
@Index('idx_shr_equity_project', ['projectCode'])
export class ShrProjectEquityEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64 })
  projectCode: string;

  @Column({ name: 'shareholder_code', type: 'varchar', length: 64 })
  shareholderCode: string;

  @Column({ name: 'equity_ratio', type: 'numeric', precision: 10, scale: 4 })
  equityRatio: string;

  @Column({ name: 'subscribed_capital', type: 'numeric', precision: 18, scale: 2, nullable: true })
  subscribedCapital: string;

  @Column({ name: 'paid_in_capital', type: 'numeric', precision: 18, scale: 2, default: 0 })
  paidInCapital: string;

  /** 计算列（GENERATED）：应缴 - 实缴。只读，插入/更新由 DB 维护 */
  @Column({ name: 'unpaid_capital', type: 'numeric', precision: 18, scale: 2, insert: false, update: false, nullable: true })
  unpaidCapital: string;

  @Column({ name: 'capital_status', type: 'varchar', length: 32, default: 'PENDING_CONFIRMATION' })
  capitalStatus: string;

  /** 股权状态（Phase 2A）：与所属项目一致 CONFIRMED/PROVISIONAL */
  @Column({ name: 'equity_status', type: 'varchar', length: 32, default: 'PROVISIONAL' })
  equityStatus: string;

  /** 实缴资本占比%（Phase 2B-R2）= paid_in_capital / 项目总实缴资本 */
  @Column({ name: 'capital_ratio', type: 'numeric', precision: 10, scale: 4, nullable: true })
  capitalRatio: string;

  /** 实缴来源（Phase 2B-R2）：LEDGER=逐笔台账 / CAPITAL_SUMMARY_IMPORT=资本汇总表 */
  @Column({ name: 'paid_in_source', type: 'varchar', length: 64, nullable: true })
  paidInSource: string;

  @Column({ name: 'is_voting_shareholder', type: 'boolean', default: true })
  isVotingShareholder: boolean;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
