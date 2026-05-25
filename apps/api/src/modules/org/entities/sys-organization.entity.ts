import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sys_organizations')
export class SysOrganizationEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'org_code', type: 'varchar', length: 64, unique: true })
  orgCode: string;

  @Column({ name: 'org_name', type: 'varchar', length: 128 })
  orgName: string;

  @Column({ name: 'parent_id', type: 'bigint', nullable: true })
  parentId: number | null;

  @Column({ name: 'org_type', type: 'varchar', length: 32 })
  orgType: 'GROUP' | 'COMPANY' | 'FACTORY' | 'PROJECT' | 'WAREHOUSE' | 'STORE' | 'DEPARTMENT';

  @Column({ name: 'level', type: 'integer' })
  level: number;

  @Column({ name: 'path', type: 'text', nullable: true })
  path: string | null;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  status: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string | null;

  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string | null;

  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
  warehouseCode: string | null;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  @Column({ name: 'manager_user_id', type: 'bigint', nullable: true })
  managerUserId: number | null;

  @Column({ name: 'manager_name', type: 'varchar', length: 128, nullable: true })
  managerName: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
