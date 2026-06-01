import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 股东项目  shr_projects */
@Entity('shr_projects')
export class ShrProjectEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64, unique: true })
  projectCode: string;

  @Column({ name: 'project_name', type: 'varchar', length: 256 })
  projectName: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string;

  @Column({ name: 'site_code', type: 'varchar', length: 64, nullable: true })
  siteCode: string;

  /** LAYER_FARM/BROILER_FARM/SLAUGHTER/FOOD_FACTORY/ORGANIC_FERTILIZER/OTHER */
  @Column({ name: 'project_type', type: 'varchar', length: 32, default: 'OTHER' })
  projectType: string;

  /** PAID_IN_FULL/PARTIALLY_PAID/PENDING_CONFIRMATION */
  @Column({ name: 'capital_status', type: 'varchar', length: 32, default: 'PENDING_CONFIRMATION' })
  capitalStatus: string;

  /** 股权状态（Phase 2A）：CONFIRMED=已确认股权 / PROVISIONAL=暂定股权 */
  @Column({ name: 'equity_status', type: 'varchar', length: 32, default: 'PROVISIONAL' })
  equityStatus: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
