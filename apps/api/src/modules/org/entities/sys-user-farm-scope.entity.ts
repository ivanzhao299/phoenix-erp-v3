import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  CreateDateColumn,
} from 'typeorm';

/**
 * G4-E：FarmScope（在 CompanyScope 之下）
 *
 * 用户对场站（brd_farms.farm_code）的额外授权。
 * 镜像 sys_user_warehouse_scopes 的模式：
 * - sys_user_orgs.org → 通过组织树派生主场站
 * - sys_user_farm_scopes → 额外的跨组织场站授权
 *
 * DataScopeService.resolve() 在 allowedFarmCodes 中合并两者。
 */
@Entity('sys_user_farm_scopes')
@Index('idx_user_farm_scope_user', ['userId'])
@Index('idx_user_farm_scope_farm', ['farmCode'])
@Unique('uq_user_farm', ['userId', 'farmCode'])
export class SysUserFarmScopeEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'farm_code', type: 'varchar', length: 64 })
  farmCode: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
