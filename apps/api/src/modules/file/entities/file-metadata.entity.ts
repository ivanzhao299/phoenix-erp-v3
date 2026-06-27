import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('file_metadata')
@Unique('UQ_file_metadata_file_id', ['fileId'])
@Check('CHK_file_metadata_status', `"status" IN ('ACTIVE', 'PENDING', 'DISABLED')`)
@Check('CHK_file_metadata_visibility', `"visibility" IN ('PROTECTED', 'PRIVATE')`)
@Index('IDX_file_metadata_owner', ['moduleCode', 'ownerType', 'ownerId'])
@Index('IDX_file_metadata_company_store', ['companyCode', 'storeCode'])
@Index('IDX_file_metadata_uploaded_by', ['uploadedBy'])
@Index('IDX_file_metadata_status', ['status'])
@Index('IDX_file_metadata_deleted_at', ['deletedAt'])
export class FileMetadataEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'file_id', type: 'varchar', length: 128 })
  fileId: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string;

  @Column({ name: 'stored_name', type: 'varchar', length: 255 })
  storedName: string;

  @Column({ name: 'storage_path', type: 'text' })
  storagePath: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 128 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: string;

  @Column({ name: 'checksum', type: 'varchar', length: 128, default: '' })
  checksum: string;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode: string;

  @Column({ name: 'owner_type', type: 'varchar', length: 64 })
  ownerType: string;

  @Column({ name: 'owner_id', type: 'varchar', length: 128 })
  ownerId: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, default: '' })
  companyCode: string;

  @Column({ name: 'store_code', type: 'varchar', length: 64, default: '' })
  storeCode: string;

  @Column({ name: 'uploaded_by', type: 'varchar', length: 128, default: '' })
  uploadedBy: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'visibility', type: 'varchar', length: 32, default: 'PROTECTED' })
  visibility: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
