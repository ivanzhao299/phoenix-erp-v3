import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extend Chanjet integration middle layer with voucher drafts and reconciliation results.
 *
 * This migration creates integration control tables only. It does not seed business data,
 * call Chanjet APIs, push vouchers, or write ERP business facts.
 */
export class CreateChanjetVoucherDraftAndReconciliation1782741000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_voucher_drafts" (
        "id" bigserial NOT NULL,
        "source_biz_type" varchar(64) NOT NULL,
        "source_biz_id" varchar(128) NOT NULL,
        "company_code" varchar(64) NOT NULL DEFAULT '',
        "book_id" varchar(64) NOT NULL DEFAULT '',
        "period" varchar(16) NOT NULL DEFAULT '',
        "title" varchar(256) NOT NULL DEFAULT '',
        "voucher_lines" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
        "push_allowed" boolean NOT NULL DEFAULT false,
        "push_status" varchar(32) NOT NULL DEFAULT 'NOT_PUSHED',
        "created_by" varchar(128) NOT NULL DEFAULT '',
        "reviewed_by" varchar(128),
        "reviewed_at" timestamptz,
        "raw_data" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_voucher_drafts" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_chanjet_voucher_drafts_status" CHECK ("status" IN ('DRAFT','REVIEWED','PUSH_READY','REJECTED')),
        CONSTRAINT "CHK_chanjet_voucher_drafts_push_status" CHECK ("push_status" IN ('NOT_PUSHED','FAILED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_reconciliation_results" (
        "id" bigserial NOT NULL,
        "reconciliation_type" varchar(64) NOT NULL,
        "company_code" varchar(64) NOT NULL DEFAULT '',
        "book_id" varchar(64) NOT NULL DEFAULT '',
        "period" varchar(16) NOT NULL DEFAULT '',
        "status" varchar(32) NOT NULL DEFAULT 'WARN',
        "severity" varchar(32) NOT NULL DEFAULT 'MEDIUM',
        "subject_type" varchar(64) NOT NULL DEFAULT '',
        "subject_key" varchar(128) NOT NULL DEFAULT '',
        "subject_name" varchar(256) NOT NULL DEFAULT '',
        "erp_value" jsonb,
        "chanjet_value" jsonb,
        "diff_summary" text NOT NULL DEFAULT '',
        "action_required" text NOT NULL DEFAULT '',
        "resolved" boolean NOT NULL DEFAULT false,
        "resolved_by" varchar(128),
        "resolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_reconciliation_results" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_chanjet_reconciliation_type" CHECK ("reconciliation_type" IN ('MASTER_MAPPING','AR_LEDGER','AP_LEDGER','VOUCHER_DRAFT','FIELD_CATALOG')),
        CONSTRAINT "CHK_chanjet_reconciliation_status" CHECK ("status" IN ('OK','WARN','MISMATCH','HOLD')),
        CONSTRAINT "CHK_chanjet_reconciliation_severity" CHECK ("severity" IN ('LOW','MEDIUM','HIGH','CRITICAL'))
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_voucher_drafts_status" ON "chanjet_voucher_drafts" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_voucher_drafts_source" ON "chanjet_voucher_drafts" ("source_biz_type", "source_biz_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_voucher_drafts_book_period" ON "chanjet_voucher_drafts" ("book_id", "period")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_reconciliation_type_status" ON "chanjet_reconciliation_results" ("reconciliation_type", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_reconciliation_book_period" ON "chanjet_reconciliation_results" ("book_id", "period")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_reconciliation_subject" ON "chanjet_reconciliation_results" ("subject_type", "subject_key")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_reconciliation_subject"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_reconciliation_book_period"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_reconciliation_type_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_voucher_drafts_book_period"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_voucher_drafts_source"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_voucher_drafts_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_reconciliation_results"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_voucher_drafts"`);
  }
}
