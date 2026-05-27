import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * 配送单  sal_delivery_orders — Sales V2 Phase 4
 *
 * 状态机：
 *   PLANNED → LOADING → LOADED → DEPARTED → ARRIVED
 *   → PARTIALLY_SIGNED → COMPLETED | CANCELLED
 */
@Entity('sal_delivery_orders')
export class SalDeliveryOrderEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'delivery_no', type: 'varchar', length: 64, unique: true }) deliveryNo: string;
  @Column({ name: 'company_code', type: 'varchar', length: 64 }) companyCode: string;
  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true }) companyName: string | null;
  @Column({ name: 'route_code', type: 'varchar', length: 64, nullable: true }) routeCode: string | null;
  @Column({ name: 'route_name', type: 'varchar', length: 256, nullable: true }) routeName: string | null;
  @Column({ name: 'vehicle_id', type: 'bigint', nullable: true }) vehicleId: string | null;
  @Column({ name: 'vehicle_no', type: 'varchar', length: 64, nullable: true }) vehicleNo: string | null;
  @Column({ name: 'driver_id', type: 'bigint', nullable: true }) driverId: string | null;
  @Column({ name: 'driver_name', type: 'varchar', length: 256, nullable: true }) driverName: string | null;
  @Column({ name: 'wave_date', type: 'date', nullable: true }) waveDate: string | null;
  @Column({ name: 'status', type: 'varchar', length: 32, default: 'PLANNED' }) status: string;
  @Column({ name: 'loading_start_at', type: 'timestamptz', nullable: true }) loadingStartAt: Date | null;
  @Column({ name: 'loading_end_at', type: 'timestamptz', nullable: true }) loadingEndAt: Date | null;
  @Column({ name: 'departure_at', type: 'timestamptz', nullable: true }) departureAt: Date | null;
  @Column({ name: 'expected_arrival_at', type: 'timestamptz', nullable: true }) expectedArrivalAt: Date | null;
  @Column({ name: 'actual_arrival_at', type: 'timestamptz', nullable: true }) actualArrivalAt: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @Column({ name: 'total_orders', type: 'integer', default: 0 }) totalOrders: number;
  @Column({ name: 'total_qty', type: 'numeric', precision: 18, scale: 2, default: 0 }) totalQty: number;
  @Column({ name: 'remark', type: 'text', nullable: true }) remark: string | null;
  @Column({ name: 'created_by', type: 'varchar', length: 128, nullable: true }) createdBy: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
