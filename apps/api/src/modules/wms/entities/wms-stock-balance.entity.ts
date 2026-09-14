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

  @Column({ type: 'int', default: 0, nullable: true })
  qty: number | null;

  @Column({ type: 'int', default: 0, nullable: true })
  locked_qty: number | null;

  @Column({ type: 'varchar', length: 32, default: 'ALL', nullable: true })
  store_code: string | null; // 机构隔离

  // TypeORM save 自动递增版本，但不会自动附加 CAS 条件。
  // InventoryService 使用事务行锁保护读改写；保留现有 VersionColumn 语义。
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
