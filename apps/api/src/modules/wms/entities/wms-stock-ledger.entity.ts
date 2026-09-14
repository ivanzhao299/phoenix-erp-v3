import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('wms_stock_ledger')
export class WmsStockLedgerEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 32 })
  biz_type: string; // INBOUND, OUTBOUND, STOCKTAKE, ADJUSTMENT

  @Column({ type: 'varchar', length: 64 })
  bill_no: string;

  @Column({ type: 'varchar', length: 32 })
  warehouse_code: string;

  @Column({ type: 'varchar', length: 64 })
  location_code: string;

  @Column({ type: 'varchar', length: 64 })
  spec_code: string;

  @Column({ type: 'varchar', length: 64 })
  batch_no: string;

  @Column({ type: 'int', default: 0, nullable: true })
  in_qty: number | null;

  @Column({ type: 'int', default: 0, nullable: true })
  out_qty: number | null;

  @Column({ type: 'int', default: 0, nullable: true })
  balance_qty: number | null; // 结存数量，用于事后审计防篡改

  @Column({ type: 'varchar', length: 32, default: 'ALL', nullable: true })
  store_code: string | null;

  @Column({ type: 'varchar', length: 64 })
  operator: string;

  @CreateDateColumn()
  created_at: Date;
}
