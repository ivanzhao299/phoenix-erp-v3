import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 股东查看范围  shr_shareholder_scopes
 *  股东查看权限按项目/公司/场区授权，不依赖单一 ROLE_SHAREHOLDER 大角色 */
@Entity('shr_shareholder_scopes')
export class ShrShareholderScopeEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'shareholder_code', type: 'varchar', length: 64, nullable: true })
  shareholderCode: string;

  /** GROUP/BU/COMPANY/SITE/PROJECT */
  @Column({ name: 'scope_type', type: 'varchar', length: 32 })
  scopeType: string;

  @Column({ name: 'scope_code', type: 'varchar', length: 64, nullable: true })
  scopeCode: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string;

  @Column({ name: 'can_view_finance', type: 'boolean', default: true })
  canViewFinance: boolean;

  @Column({ name: 'can_view_operation', type: 'boolean', default: true })
  canViewOperation: boolean;

  @Column({ name: 'can_view_dividend', type: 'boolean', default: true })
  canViewDividend: boolean;

  @Column({ name: 'can_approve', type: 'boolean', default: false })
  canApprove: boolean;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
