import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { StoreEntity } from './store.entity';
import { SysUserEntity } from '../../../auth/entities/sys-user.entity';

@Entity('store_memberships')
@Index('idx_store_membership_user_active', ['userId', 'status'])
@Check('chk_store_membership_status', `"status" IN ('ACTIVE','INACTIVE')`)
@Check('chk_store_membership_role', `"role" IN ('CASHIER','STORE_MANAGER','ADMIN')`)
@Check('chk_store_membership_period', `"effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" >= "effective_from"`)
export class StoreMembershipEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id: string;
  @Column({ name: 'user_id', type: 'bigint' }) userId: string;
  @Column({ name: 'store_id', type: 'bigint' }) storeId: string;
  @Column({ length: 32 }) role: string;
  @Column({ name: 'effective_from', type: 'timestamptz', nullable: true }) effectiveFrom: Date | null;
  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true }) effectiveTo: Date | null;
  @Column({ length: 16, default: 'ACTIVE' }) status: string;
  @ManyToOne(() => SysUserEntity, { onDelete: 'NO ACTION' }) @JoinColumn({ name: 'user_id' }) user: SysUserEntity;
  @ManyToOne(() => StoreEntity, { onDelete: 'NO ACTION' }) @JoinColumn({ name: 'store_id' }) store: StoreEntity;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
