import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Check,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sys_organizations')
@Check('chk_org_type', `org_type IN ('GROUP','COMPANY','FACTORY','PROJECT','WAREHOUSE','STORE','DEPARTMENT','BU','SITE','VIRTUAL_ORGANIZATION')`)
@Index('idx_orgs_parent', ['parentId'])
@Index('idx_orgs_type', ['orgType'])
@Index('idx_orgs_status', ['status'])
@Index('idx_orgs_company', ['companyCode'], { where: '"company_code" IS NOT NULL' })
@Index('idx_orgs_code', ['orgCode'])
@Index('idx_orgs_parent_code', ['parentCode'], { where: '"parent_code" IS NOT NULL' })
@Index('idx_orgs_site_code', ['siteCode'], { where: '"site_code" IS NOT NULL' })
@Index('idx_orgs_business_type', ['siteBusinessType'])
@Index('idx_orgs_sort', ['sortOrder', 'orgCode'])
export class SysOrganizationEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'org_code', type: 'varchar', length: 64, unique: true })
  orgCode: string;

  @Column({ name: 'org_name', type: 'varchar', length: 128 })
  orgName: string;

  @Column({ name: 'parent_id', type: 'bigint', nullable: true })
  parentId: number | null;

  // g197-D 探针: FK 装饰器,createForeignKeyConstraints:false 让 typeorm
  // 不自动创建/重建 FK,只是识别现有 PG FK(sys_organizations_parent_id_fkey)
  @ManyToOne(() => SysOrganizationEntity, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'parent_id', referencedColumnName: 'id' })
  parent?: SysOrganizationEntity;

  @Column({ name: 'org_type', type: 'varchar', length: 32 })
  orgType: 'GROUP' | 'BU' | 'COMPANY' | 'SITE' | 'FACTORY' | 'PROJECT' | 'WAREHOUSE' | 'STORE' | 'DEPARTMENT';

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

  @Column({ name: 'org_name_cn', type: 'varchar', length: 256, nullable: true })
  orgNameCn: string | null;

  @Column({ name: 'org_short_name', type: 'varchar', length: 64, nullable: true })
  orgShortName: string | null;

  @Column({ name: 'parent_code', type: 'varchar', length: 64, nullable: true })
  parentCode: string | null;

  @Column({ name: 'site_code', type: 'varchar', length: 64, nullable: true })
  siteCode: string | null;

  @Column({ name: 'site_business_type', type: 'varchar', length: 64, nullable: true })
  siteBusinessType: string | null;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
