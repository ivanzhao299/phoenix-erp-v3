import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * File Metadata / ACL foundation.
 *
 * Creates protected file metadata only. No seed, no business data DML, no
 * external storage migration, and no destructive change.
 */
export class CreateFileMetadata1782042418112 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "file_metadata" (
        "id" bigserial NOT NULL,
        "file_id" varchar(128) NOT NULL,
        "original_name" varchar(255) NOT NULL,
        "stored_name" varchar(255) NOT NULL,
        "storage_path" text NOT NULL,
        "mime_type" varchar(128) NOT NULL,
        "size_bytes" bigint NOT NULL,
        "checksum" varchar(128) NOT NULL DEFAULT '',
        "module_code" varchar(64) NOT NULL,
        "owner_type" varchar(64) NOT NULL,
        "owner_id" varchar(128) NOT NULL,
        "company_code" varchar(64) NOT NULL DEFAULT '',
        "store_code" varchar(64) NOT NULL DEFAULT '',
        "uploaded_by" varchar(128) NOT NULL DEFAULT '',
        "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
        "visibility" varchar(32) NOT NULL DEFAULT 'PROTECTED',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_file_metadata" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_file_metadata_file_id" UNIQUE ("file_id"),
        CONSTRAINT "CHK_file_metadata_status" CHECK ("status" IN ('ACTIVE', 'PENDING', 'DISABLED')),
        CONSTRAINT "CHK_file_metadata_visibility" CHECK ("visibility" IN ('PROTECTED', 'PRIVATE'))
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_file_metadata_owner" ON "file_metadata" ("module_code", "owner_type", "owner_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_file_metadata_company_store" ON "file_metadata" ("company_code", "store_code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_file_metadata_uploaded_by" ON "file_metadata" ("uploaded_by")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_file_metadata_status" ON "file_metadata" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_file_metadata_deleted_at" ON "file_metadata" ("deleted_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_file_metadata_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_file_metadata_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_file_metadata_uploaded_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_file_metadata_company_store"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_file_metadata_owner"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "file_metadata"`);
  }
}
