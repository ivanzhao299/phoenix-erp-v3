import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { StoreEntity } from './store.entity';

@Entity('store_aliases')
@Index('uq_store_alias_type_code', ['aliasType', 'aliasCode'], { unique: true })
@Index('uq_store_alias_active_store_site_by_store', ['storeId'], { unique: true, where: `"alias_type"='STORE_SITE' AND "status"='ACTIVE'` })
@Index('uq_store_alias_active_store_site_by_site', ['aliasCode'], { unique: true, where: `"alias_type"='STORE_SITE' AND "status"='ACTIVE'` })
@Check('chk_store_alias_type', `"alias_type" IN ('STORE_SITE','LEGACY_STORE_CODE')`)
@Check('chk_store_alias_status', `"status" IN ('ACTIVE','INACTIVE')`)
export class StoreAliasEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id: string;
  @Index() @Column({ name: 'store_id', type: 'bigint' }) storeId: string;
  @Column({ name: 'alias_type', length: 32 }) aliasType: string;
  @Column({ name: 'alias_code', length: 128 }) aliasCode: string;
  @Column({ length: 16, default: 'ACTIVE' }) status: string;
  @ManyToOne(() => StoreEntity, { onDelete: 'NO ACTION' }) @JoinColumn({ name: 'store_id' }) store: StoreEntity;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
