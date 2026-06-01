import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 实益出资结构  shr_beneficial_equity
 *  记录登记股东(nominee) 与 实际出资人(beneficial) 的代持关系。
 *  与法定股权结构(shr_project_equity.equity_ratio) 分离，不互相覆盖。 */
@Entity('shr_beneficial_equity')
export class ShrBeneficialEquityEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64 })
  projectCode: string;

  @Column({ name: 'nominee_shareholder_code', type: 'varchar', length: 64 })
  nomineeShareholderCode: string;

  @Column({ name: 'beneficial_shareholder_code', type: 'varchar', length: 64 })
  beneficialShareholderCode: string;

  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  amount: string;

  @Column({ name: 'ownership_ratio', type: 'numeric', precision: 10, scale: 4, nullable: true })
  ownershipRatio: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
