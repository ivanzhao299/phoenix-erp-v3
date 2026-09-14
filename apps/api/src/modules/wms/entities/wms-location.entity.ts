import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('wms_locations')
export class WmsLocationEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  location_code: string;

  @Column({ type: 'varchar', length: 32 })
  warehouse_code: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  zone_code: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  location_name: string;

  @Column({ type: 'int', default: 0, nullable: true })
  capacity_qty: number | null;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE', nullable: true })
  status: string | null;

  @Column({ type: 'varchar', length: 32, default: 'ALL', nullable: true })
  store_code: string | null; // 机构隔离

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
