import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { StoreEntity } from './store.entity';

@Entity('store_warehouse_bindings')
@Index('idx_store_binding_active', ['storeId', 'purpose', 'status', 'priority'])
@Check('chk_store_binding_purpose', `"purpose" IN ('SALES','RETURNS')`)
@Check('chk_store_binding_status', `"status" IN ('ACTIVE','INACTIVE')`)
@Check('chk_store_binding_period', `"effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" >= "effective_from"`)
export class StoreWarehouseBindingEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id: string;
  @Column({ name: 'store_id', type: 'bigint' }) storeId: string;
  @Column({ name: 'warehouse_code', length: 64 }) warehouseCode: string;
  @Column({ length: 16 }) purpose: string;
  @Column({ type: 'int', default: 100 }) priority: number;
  @Column({ length: 16, default: 'ACTIVE' }) status: string;
  @Column({ name: 'effective_from', type: 'timestamptz', nullable: true }) effectiveFrom: Date | null;
  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true }) effectiveTo: Date | null;
  @ManyToOne(() => StoreEntity, { onDelete: 'NO ACTION' }) @JoinColumn({ name: 'store_id' }) store: StoreEntity;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
