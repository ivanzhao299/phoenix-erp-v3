import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('sys_user_warehouse_scopes')
export class SysUserWarehouseScopeEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'warehouse_code', type: 'varchar', length: 64 })
  warehouseCode: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
