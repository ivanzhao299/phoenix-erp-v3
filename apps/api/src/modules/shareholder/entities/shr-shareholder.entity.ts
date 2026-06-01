import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** 股东档案  shr_shareholders */
@Entity('shr_shareholders')
export class ShrShareholderEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'shareholder_code', type: 'varchar', length: 64, unique: true })
  shareholderCode: string;

  @Column({ name: 'shareholder_name', type: 'varchar', length: 128 })
  shareholderName: string;

  @Column({ name: 'linked_user_id', type: 'bigint', nullable: true })
  linkedUserId: string;

  @Column({ name: 'phone', type: 'varchar', length: 32, nullable: true })
  phone: string;

  @Column({ name: 'id_no_masked', type: 'varchar', length: 64, nullable: true })
  idNoMasked: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
