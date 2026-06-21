import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REQ-STORE-PAYMENT-UNIFIED-CODE-001 S1
 *
 * Creates only the MVP-1 schema objects for manual store payment records.
 * No menu seed, dict seed, business data seed, finance posting, POS link, or
 * attachment ACL controller is included in this migration.
 */
export class CreateStorePaymentTables1782041418112 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "store_payment_accounts" (
        "id" bigserial NOT NULL,
        "account_code" varchar(64) NOT NULL,
        "account_name" varchar(160) NOT NULL,
        "company_code" varchar(64) NOT NULL,
        "store_code" varchar(64) NOT NULL,
        "fin_cash_account_id" bigint,
        "currency" varchar(16) NOT NULL,
        "payment_method" varchar(64) NOT NULL,
        "qr_attachment_id" varchar(255),
        "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
        "is_active" boolean NOT NULL DEFAULT true,
        "remark" text,
        "created_by" varchar(128) NOT NULL DEFAULT '',
        "updated_by" varchar(128) NOT NULL DEFAULT '',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_store_payment_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_store_payment_accounts_scope_code" UNIQUE ("company_code", "store_code", "account_code"),
        CONSTRAINT "CHK_store_payment_accounts_status" CHECK ("status" IN ('ACTIVE', 'DISABLED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "store_payment_records" (
        "id" bigserial NOT NULL,
        "payment_no" varchar(64) NOT NULL,
        "store_code" varchar(64) NOT NULL,
        "company_code" varchar(64) NOT NULL,
        "payment_account_id" bigint NOT NULL,
        "amount" numeric(18,2) NOT NULL,
        "currency" varchar(16) NOT NULL,
        "payment_method" varchar(64) NOT NULL,
        "paid_at" timestamptz NOT NULL,
        "proof_attachment_id" varchar(255) NOT NULL,
        "order_no" varchar(64),
        "sale_no" varchar(64),
        "status" varchar(32) NOT NULL DEFAULT 'PENDING',
        "submitted_by" varchar(128) NOT NULL,
        "confirmed_by" varchar(128),
        "confirmed_at" timestamptz,
        "rejected_by" varchar(128),
        "rejected_at" timestamptz,
        "voided_by" varchar(128),
        "voided_at" timestamptz,
        "reason" text,
        "remark" text,
        "created_by" varchar(128) NOT NULL DEFAULT '',
        "updated_by" varchar(128) NOT NULL DEFAULT '',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_store_payment_records" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_store_payment_records_payment_no" UNIQUE ("payment_no"),
        CONSTRAINT "CHK_store_payment_records_amount_nonnegative" CHECK ("amount" >= 0),
        CONSTRAINT "CHK_store_payment_records_status" CHECK ("status" IN ('PENDING', 'CONFIRMED', 'REJECTED', 'VOIDED'))
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_accounts_store" ON "store_payment_accounts" ("store_code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_accounts_company_store_status" ON "store_payment_accounts" ("company_code", "store_code", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_accounts_fin_cash_account" ON "store_payment_accounts" ("fin_cash_account_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_accounts_deleted_at" ON "store_payment_accounts" ("deleted_at")`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_records_store" ON "store_payment_records" ("store_code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_records_status" ON "store_payment_records" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_records_paid_at" ON "store_payment_records" ("paid_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_records_created_by" ON "store_payment_records" ("created_by")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_records_submitted_by" ON "store_payment_records" ("submitted_by")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_records_payment_account" ON "store_payment_records" ("payment_account_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_records_deleted_at" ON "store_payment_records" ("deleted_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_records_store_paid_at" ON "store_payment_records" ("store_code", "paid_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_records_status_paid_at" ON "store_payment_records" ("status", "paid_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_records_status_paid_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_records_store_paid_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_records_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_records_payment_account"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_records_submitted_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_records_created_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_records_paid_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_records_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_records_store"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_accounts_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_accounts_fin_cash_account"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_accounts_company_store_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_payment_accounts_store"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "store_payment_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "store_payment_accounts"`);
  }
}
