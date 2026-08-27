import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('store_master')
@Check('chk_store_master_status', `"status" IN ('ACTIVE','INACTIVE')`)
@Unique('uq_store_master_code', ['storeCode'])
export class StoreEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id: string;
  @Column({ name: 'store_code', length: 64 }) storeCode: string;
  @Column({ name: 'store_name', length: 128 }) storeName: string;
  @Index('idx_store_master_company') @Column({ name: 'company_code', length: 64 }) companyCode: string;
  @Column({ length: 16, default: 'ACTIVE' }) status: string;
  @Column({ length: 64, default: 'Asia/Shanghai' }) timezone: string;
  @Column({ name: 'business_day_cutoff', type: 'time', default: '00:00:00' }) businessDayCutoff: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
