import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('prc2_init_batches')
export class Prc2InitBatchEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'batch_no', type: 'varchar', length: 80, unique: true })
  batchNo: string;

  @Column({ name: 'batch_type', type: 'varchar', length: 64 })
  batchType: string;

  @Column({ name: 'file_name', type: 'varchar', length: 256, nullable: true })
  fileName: string;

  @Column({ name: 'file_url', type: 'text', nullable: true })
  fileUrl: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ name: 'total_rows', type: 'int', default: 0 })
  totalRows: number;

  @Column({ name: 'success_rows', type: 'int', default: 0 })
  successRows: number;

  @Column({ name: 'failed_rows', type: 'int', default: 0 })
  failedRows: number;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string;

  @Column({ name: 'created_by_name', type: 'varchar', length: 64, nullable: true })
  createdByName: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
