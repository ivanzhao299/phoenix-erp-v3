import { MigrationInterface, QueryRunner } from 'typeorm';

/** ERP-only shareholder accounting reconciliation. No Chanjet call or business-data DML. */
export class AddChanjetShareholderEquityReconciliation1784660000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_shareholder_voucher_links" (
        "id" bigserial NOT NULL,
        "company_code" varchar(64) NOT NULL,
        "book_id" varchar(64) NOT NULL,
        "contribution_id" bigint,
        "contribution_no" varchar(64) NOT NULL,
        "shareholder_code" varchar(64) NOT NULL,
        "voucher_id" varchar(128) NOT NULL,
        "voucher_no" varchar(128) NOT NULL DEFAULT '',
        "voucher_line_id" varchar(128) NOT NULL,
        "voucher_date" date,
        "subject_code" varchar(64) NOT NULL,
        "subject_name" varchar(256) NOT NULL DEFAULT '',
        "currency" varchar(16) NOT NULL DEFAULT 'CNY',
        "amount_original" numeric(18,2) NOT NULL DEFAULT 0,
        "amount_base" numeric(18,2) NOT NULL DEFAULT 0,
        "match_status" varchar(32) NOT NULL DEFAULT 'CANDIDATE',
        "confidence" numeric(5,2) NOT NULL DEFAULT 0,
        "match_basis" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "reviewed_by" varchar(128),
        "reviewed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_shareholder_voucher_links" PRIMARY KEY ("id"),
        CONSTRAINT "uq_chanjet_shareholder_voucher_link" UNIQUE ("book_id", "contribution_no", "voucher_line_id"),
        CONSTRAINT "CHK_chanjet_shareholder_link_status" CHECK ("match_status" IN ('CANDIDATE','MATCHED','NEED_REVIEW','UNMATCHED','CONFLICT'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_shareholder_link_contribution" ON "chanjet_shareholder_voucher_links" ("contribution_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_shareholder_link_status" ON "chanjet_shareholder_voucher_links" ("match_status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_shareholder_close_periods" (
        "id" bigserial NOT NULL,
        "company_code" varchar(64) NOT NULL,
        "book_id" varchar(64) NOT NULL,
        "period" varchar(16) NOT NULL,
        "status" varchar(32) NOT NULL DEFAULT 'OPEN',
        "erp_paid_in" numeric(18,2) NOT NULL DEFAULT 0,
        "chanjet_paid_in" numeric(18,2) NOT NULL DEFAULT 0,
        "difference_amount" numeric(18,2) NOT NULL DEFAULT 0,
        "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "closed_by" varchar(128),
        "closed_at" timestamptz,
        "note" text NOT NULL DEFAULT '',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_shareholder_close_periods" PRIMARY KEY ("id"),
        CONSTRAINT "uq_chanjet_shareholder_close_period" UNIQUE ("company_code", "book_id", "period"),
        CONSTRAINT "CHK_chanjet_shareholder_close_status" CHECK ("status" IN ('OPEN','READY','CLOSED','REOPENED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_shareholder_close_status" ON "chanjet_shareholder_close_periods" ("status")`);

    await queryRunner.query(`ALTER TABLE "chanjet_reconciliation_results" DROP CONSTRAINT IF EXISTS "CHK_chanjet_reconciliation_type"`);
    await queryRunner.query(`
      ALTER TABLE "chanjet_reconciliation_results"
      ADD CONSTRAINT "CHK_chanjet_reconciliation_type"
      CHECK ("reconciliation_type" IN ('MASTER_MAPPING','AR_LEDGER','AP_LEDGER','VOUCHER_DRAFT','FIELD_CATALOG','SHAREHOLDER_EQUITY','SHAREHOLDER_CONTRIBUTION'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "chanjet_reconciliation_results"
           WHERE "reconciliation_type" IN ('SHAREHOLDER_EQUITY','SHAREHOLDER_CONTRIBUTION')
        ) THEN
          RAISE EXCEPTION 'Cannot rollback shareholder reconciliation schema while shareholder reconciliation audit rows exist';
        END IF;
      END $$
    `);
    await queryRunner.query(`ALTER TABLE "chanjet_reconciliation_results" DROP CONSTRAINT IF EXISTS "CHK_chanjet_reconciliation_type"`);
    await queryRunner.query(`
      ALTER TABLE "chanjet_reconciliation_results"
      ADD CONSTRAINT "CHK_chanjet_reconciliation_type"
      CHECK ("reconciliation_type" IN ('MASTER_MAPPING','AR_LEDGER','AP_LEDGER','VOUCHER_DRAFT','FIELD_CATALOG'))
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_shareholder_close_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_shareholder_close_periods"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_shareholder_link_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_shareholder_link_contribution"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_shareholder_voucher_links"`);
  }
}
