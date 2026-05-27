import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** 车辆档案  sal_vehicles — Sales V2 Phase 4 */
@Entity('sal_vehicles')
export class SalVehicleEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'vehicle_no', type: 'varchar', length: 64, unique: true }) vehicleNo: string;
  @Column({ name: 'plate_no', type: 'varchar', length: 32, nullable: true }) plateNo: string | null;
  @Column({ name: 'vehicle_type', type: 'varchar', length: 64, nullable: true }) vehicleType: string | null;
  @Column({ name: 'capacity', type: 'numeric', precision: 18, scale: 2, nullable: true }) capacity: number | null;
  @Column({ name: 'company_code', type: 'varchar', length: 64 }) companyCode: string;
  @Column({ name: 'status', type: 'varchar', length: 16, default: 'ACTIVE' }) status: string;
  @Column({ name: 'remark', type: 'text', nullable: true }) remark: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
