import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create Chanjet integration middle-layer foundation.
 *
 * This migration creates only integration metadata/audit tables. It does not
 * seed business data, write ERP business facts, or call Chanjet APIs.
 */
export class CreateChanjetIntegrationFoundation1782740000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_account_books" (
        "book_id" varchar(64) NOT NULL,
        "book_name" varchar(256) NOT NULL,
        "company_code" varchar(64),
        "company_name" varchar(256),
        "enabled" boolean NOT NULL DEFAULT false,
        "raw_data" jsonb,
        "last_probe_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_account_books" PRIMARY KEY ("book_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_master_mapping" (
        "id" bigserial NOT NULL,
        "mapping_type" varchar(40) NOT NULL,
        "book_id" varchar(64) NOT NULL DEFAULT '',
        "erp_code" varchar(128) NOT NULL DEFAULT '',
        "erp_name" varchar(256) NOT NULL DEFAULT '',
        "chanjet_id" varchar(128) NOT NULL DEFAULT '',
        "chanjet_code" varchar(128) NOT NULL DEFAULT '',
        "chanjet_name" varchar(256) NOT NULL DEFAULT '',
        "match_status" varchar(32) NOT NULL DEFAULT 'PENDING',
        "confidence" numeric(5,2) NOT NULL DEFAULT 0,
        "review_status" varchar(32) NOT NULL DEFAULT 'PENDING',
        "reviewed_by" varchar(128),
        "reviewed_at" timestamptz,
        "raw_data" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_master_mapping" PRIMARY KEY ("id"),
        CONSTRAINT "uq_chanjet_master_mapping" UNIQUE ("mapping_type", "erp_code", "chanjet_id"),
        CONSTRAINT "CHK_chanjet_master_mapping_match_status" CHECK ("match_status" IN ('MATCHED','MISSING_IN_ERP','MISSING_IN_CHANJET','CONFLICT','MANUAL','PENDING')),
        CONSTRAINT "CHK_chanjet_master_mapping_review_status" CHECK ("review_status" IN ('PENDING','APPROVED','REJECTED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_api_field_catalog" (
        "id" bigserial NOT NULL,
        "api_domain" varchar(64) NOT NULL,
        "api_path" varchar(256) NOT NULL,
        "method" varchar(12) NOT NULL,
        "field_path" varchar(512) NOT NULL,
        "sample_type" varchar(32) NOT NULL,
        "sample_value_masked" text,
        "observed_count" integer NOT NULL DEFAULT 0,
        "first_seen_at" timestamptz NOT NULL DEFAULT now(),
        "last_seen_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_api_field_catalog" PRIMARY KEY ("id"),
        CONSTRAINT "uq_chanjet_api_field_catalog" UNIQUE ("api_domain", "api_path", "method", "field_path"),
        CONSTRAINT "CHK_chanjet_api_field_catalog_method" CHECK ("method" IN ('GET','POST')),
        CONSTRAINT "CHK_chanjet_api_field_catalog_sample_type" CHECK ("sample_type" IN ('string','number','boolean','array','object','null'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_sync_jobs" (
        "id" bigserial NOT NULL,
        "job_type" varchar(32) NOT NULL,
        "book_id" varchar(64) NOT NULL DEFAULT '',
        "company_code" varchar(64) NOT NULL DEFAULT '',
        "period" varchar(16) NOT NULL DEFAULT '',
        "status" varchar(24) NOT NULL DEFAULT 'RUNNING',
        "request_scope" jsonb,
        "result_summary" jsonb,
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_sync_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_chanjet_sync_jobs_job_type" CHECK ("job_type" IN ('PROBE','SNAPSHOT','RECONCILE','IMPORT','BOOK_REFRESH')),
        CONSTRAINT "CHK_chanjet_sync_jobs_status" CHECK ("status" IN ('RUNNING','SUCCESS','FAIL'))
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_account_books_company" ON "chanjet_account_books" ("company_code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_account_books_enabled" ON "chanjet_account_books" ("enabled")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_master_mapping_type_status" ON "chanjet_master_mapping" ("mapping_type", "match_status", "review_status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_master_mapping_book" ON "chanjet_master_mapping" ("book_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_api_field_catalog_domain" ON "chanjet_api_field_catalog" ("api_domain")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_api_field_catalog_path" ON "chanjet_api_field_catalog" ("api_path")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_sync_jobs_type_status" ON "chanjet_sync_jobs" ("job_type", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_sync_jobs_book_period" ON "chanjet_sync_jobs" ("book_id", "period")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_sync_jobs_book_period"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_sync_jobs_type_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_api_field_catalog_path"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_api_field_catalog_domain"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_master_mapping_book"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_master_mapping_type_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_account_books_enabled"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_account_books_company"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_sync_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_api_field_catalog"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_master_mapping"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_account_books"`);
  }
}
