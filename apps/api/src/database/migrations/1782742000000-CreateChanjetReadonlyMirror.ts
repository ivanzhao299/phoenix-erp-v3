import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create Chanjet read-only mirror tables.
 *
 * This migration only creates ERP-side middle-layer tables. It does not call
 * Chanjet APIs, write Chanjet data, seed business data, or touch ERP business
 * fact tables.
 */
export class CreateChanjetReadonlyMirror1782742000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_read_snapshots" (
        "id" bigserial NOT NULL,
        "book_id" varchar(64) NOT NULL DEFAULT '',
        "endpoint_key" varchar(64) NOT NULL,
        "api_domain" varchar(64) NOT NULL,
        "api_path" varchar(512) NOT NULL,
        "method" varchar(12) NOT NULL,
        "period" varchar(16) NOT NULL DEFAULT '',
        "page_no" integer NOT NULL DEFAULT 1,
        "payload_hash" varchar(64) NOT NULL,
        "row_count" integer NOT NULL DEFAULT 0,
        "raw_payload" jsonb NOT NULL,
        "pulled_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_read_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "uq_chanjet_read_snapshot_payload" UNIQUE ("book_id", "endpoint_key", "payload_hash"),
        CONSTRAINT "CHK_chanjet_read_snapshots_method" CHECK ("method" IN ('GET','POST'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_entity_snapshots" (
        "id" bigserial NOT NULL,
        "book_id" varchar(64) NOT NULL DEFAULT '',
        "endpoint_key" varchar(64) NOT NULL,
        "entity_type" varchar(64) NOT NULL,
        "external_id" varchar(128) NOT NULL DEFAULT '',
        "external_code" varchar(128) NOT NULL DEFAULT '',
        "external_name" varchar(256) NOT NULL DEFAULT '',
        "period" varchar(16) NOT NULL DEFAULT '',
        "status" varchar(64) NOT NULL DEFAULT '',
        "amount" numeric(18,2) NOT NULL DEFAULT 0,
        "currency" varchar(16) NOT NULL DEFAULT '',
        "raw_data" jsonb NOT NULL,
        "last_seen_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_entity_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "uq_chanjet_entity_snapshot" UNIQUE ("book_id", "entity_type", "external_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_erp_field_mapping" (
        "id" bigserial NOT NULL,
        "chanjet_endpoint" varchar(512) NOT NULL,
        "chanjet_field_path" varchar(512) NOT NULL,
        "chanjet_type" varchar(32) NOT NULL DEFAULT '',
        "chanjet_sample_masked" text,
        "erp_domain" varchar(64) NOT NULL DEFAULT '',
        "erp_table" varchar(128) NOT NULL DEFAULT '',
        "erp_field" varchar(128) NOT NULL DEFAULT '',
        "erp_type" varchar(64) NOT NULL DEFAULT '',
        "transform_rule" text NOT NULL DEFAULT '',
        "match_status" varchar(32) NOT NULL DEFAULT 'PENDING',
        "risk_level" varchar(24) NOT NULL DEFAULT 'MEDIUM',
        "decision_status" varchar(32) NOT NULL DEFAULT 'PENDING',
        "analysis_note" text NOT NULL DEFAULT '',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_erp_field_mapping" PRIMARY KEY ("id"),
        CONSTRAINT "uq_chanjet_erp_field_mapping" UNIQUE ("chanjet_endpoint", "chanjet_field_path", "erp_domain", "erp_field"),
        CONSTRAINT "CHK_chanjet_erp_field_mapping_match_status" CHECK ("match_status" IN ('MATCHED','TYPE_MISMATCH','MISSING_IN_ERP','MISSING_IN_CHANJET','TRANSFORM_REQUIRED','PENDING')),
        CONSTRAINT "CHK_chanjet_erp_field_mapping_risk" CHECK ("risk_level" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
        CONSTRAINT "CHK_chanjet_erp_field_mapping_decision" CHECK ("decision_status" IN ('PENDING','APPROVED','REJECTED','HOLD'))
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_read_snapshots_endpoint" ON "chanjet_read_snapshots" ("endpoint_key")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_read_snapshots_book_endpoint" ON "chanjet_read_snapshots" ("book_id", "endpoint_key")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_read_snapshots_pulled_at" ON "chanjet_read_snapshots" ("pulled_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_entity_snapshots_type_status" ON "chanjet_entity_snapshots" ("entity_type", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_entity_snapshots_book_type" ON "chanjet_entity_snapshots" ("book_id", "entity_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_entity_snapshots_code" ON "chanjet_entity_snapshots" ("external_code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_erp_field_mapping_status" ON "chanjet_erp_field_mapping" ("match_status", "decision_status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_erp_field_mapping_domain" ON "chanjet_erp_field_mapping" ("erp_domain")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_erp_field_mapping_domain"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_erp_field_mapping_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_entity_snapshots_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_entity_snapshots_book_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_entity_snapshots_type_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_read_snapshots_pulled_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_read_snapshots_book_endpoint"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_read_snapshots_endpoint"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_erp_field_mapping"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_entity_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_read_snapshots"`);
  }
}
