import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 物流/运单  prc2_shipments */
@Entity('prc2_shipments')
@Index('idx_prc2_ship_status', ['status'])
@Index('idx_prc2_ship_po_id', ['poId'], { where: '"po_id" IS NOT NULL' })
@Index('idx_prc2_ship_tracking', ['trackingNo'], { where: '"tracking_no" IS NOT NULL' })
export class Prc2ShipmentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'shipment_no', type: 'varchar', length: 80, unique: true })
  shipmentNo: string;

  @Column({ name: 'po_id', type: 'bigint', nullable: true })
  poId: string;

  @Column({ name: 'po_no', type: 'varchar', length: 80, nullable: true })
  poNo: string;

  /** ── 多公司维度 ── */
  @Column({ name: 'company_id', type: 'bigint', nullable: true })
  companyId: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string;

  /** ── 多项目维度 ── */
  @Column({ name: 'project_id', type: 'bigint', nullable: true })
  projectId: string;

  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
  projectCode: string;

  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
  projectName: string;

  @Column({ name: 'shipment_type', type: 'varchar', length: 32, nullable: true })
  shipmentType: string;

  @Column({ name: 'carrier_name', type: 'varchar', length: 128, nullable: true })
  carrierName: string;

  @Column({ name: 'tracking_no', type: 'varchar', length: 128, nullable: true })
  trackingNo: string;

  @Column({ name: 'origin_country', type: 'varchar', length: 8, nullable: true })
  originCountry: string;

  @Column({ name: 'origin_address', type: 'text', nullable: true })
  originAddress: string;

  @Column({ name: 'destination_country', type: 'varchar', length: 8, nullable: true })
  destinationCountry: string;

  @Column({ name: 'destination_address', type: 'text', nullable: true })
  destinationAddress: string;

  @Column({ name: 'customs_required', type: 'boolean', default: false })
  customsRequired: boolean;

  @Column({ name: 'customs_status', type: 'varchar', length: 32, nullable: true })
  customsStatus: string;

  @Column({ name: 'customs_decl_no', type: 'varchar', length: 128, nullable: true })
  customsDeclNo: string;

  @Column({ name: 'departure_date', type: 'date', nullable: true })
  departureDate: string;

  @Column({ name: 'arrival_date', type: 'date', nullable: true })
  arrivalDate: string;

  @Column({ name: 'freight_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  freightAmount: number;

  @Column({ name: 'freight_currency', type: 'varchar', length: 8, nullable: true })
  freightCurrency: string;

  @Column({ name: 'customs_duty', type: 'numeric', precision: 18, scale: 2, nullable: true })
  customsDuty: number;

  @Column({ name: 'customs_currency', type: 'varchar', length: 8, nullable: true })
  customsCurrency: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
