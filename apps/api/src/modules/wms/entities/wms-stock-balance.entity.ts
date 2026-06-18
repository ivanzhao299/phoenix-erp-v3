import { Entity, Column, PrimaryGeneratedColumn, VersionColumn, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';

@Entity('wms_stock_balance')
@Unique('wms_stock_balance_warehouse_code_location_code_spec_code_ba_key', ['warehouse_code', 'location_code', 'spec_code', 'batch_no'])
export class WmsStockBalanceEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 32 })
  warehouse_code: string;

  @Column({ type: 'varchar', length: 64 })
  location_code: string;

  @Column({ type: 'varchar', length: 64 })
  spec_code: string;

  @Column({ type: 'varchar', length: 64 })
  batch_no: string;

  @Column({ type: 'int', default: 0 })
  qty: number;

  @Column({ type: 'int', default: 0 })
  locked_qty: number;

  @Column({ type: 'varchar', length: 32, default: 'ALL' })
  store_code: string; // 机构隔离

  // 乐观锁核心字段：每次实体更新时，TypeORM 会自动自增该字段
  // 并附加 WHERE version = :version 条件。如果不匹配，抛出 OptimisticLockVersionMismatchError
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
