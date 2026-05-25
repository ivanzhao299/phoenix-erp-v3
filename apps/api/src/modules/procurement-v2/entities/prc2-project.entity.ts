import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm';

/** 采购项目  prc2_projects
 *  唯一约束：(company_code, project_code) — 不同公司可有同编号项目 */
@Unique('uq_prc2_projects_company_project', ['companyCode', 'projectCode'])
@Entity('prc2_projects')
export class Prc2ProjectEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** 归属公司ID（关联公司主档，可空） */
  @Column({ name: 'company_id', type: 'bigint', nullable: true })
  companyId: string;

  /** 归属公司代码（查询/权限过滤字段） */
  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string;

  /** 归属公司名称快照 */
  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string;

  /** 项目编号（在同一公司内唯一） */
  @Column({ name: 'project_code', type: 'varchar', length: 64 })
  projectCode: string;

  @Column({ name: 'project_name', type: 'varchar', length: 256 })
  projectName: string;

  @Column({ name: 'project_type', type: 'varchar', length: 32, nullable: true })
  projectType: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
