import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** 司机档案  sal_drivers — Sales V2 Phase 4 */
@Entity('sal_drivers')
@Index('idx_sal_drivers_company', ['companyCode'])
@Index('idx_sal_drivers_status', ['status'])
export class SalDriverEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'driver_code', type: 'varchar', length: 64, unique: true }) driverCode: string;
  @Column({ name: 'driver_name', type: 'varchar', length: 256 }) driverName: string;
  @Column({ name: 'phone', type: 'varchar', length: 32, nullable: true }) phone: string | null;
  @Column({ name: 'license_no', type: 'varchar', length: 64, nullable: true }) licenseNo: string | null;
  @Column({ name: 'company_code', type: 'varchar', length: 64 }) companyCode: string;
  @Column({ name: 'status', type: 'varchar', length: 16, default: 'ACTIVE' }) status: string;
  @Column({ name: 'remark', type: 'text', nullable: true }) remark: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
