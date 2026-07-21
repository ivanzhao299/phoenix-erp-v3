import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-only writeback preparation. This migration does not call or modify Chanjet.
 */
export class AddChanjetWritebackPreparation1784600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chanjet_voucher_drafts" DROP CONSTRAINT IF EXISTS "CHK_chanjet_voucher_drafts_status"`);
    await queryRunner.query(`
      ALTER TABLE "chanjet_voucher_drafts"
        ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(128) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "payload_hash" varchar(64) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "validated_by" varchar(128),
        ADD COLUMN IF NOT EXISTS "validated_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "approved_by" varchar(128),
        ADD COLUMN IF NOT EXISTS "approved_at" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "chanjet_voucher_drafts"
        ADD CONSTRAINT "CHK_chanjet_voucher_drafts_status"
        CHECK ("status" IN ('DRAFT','VALIDATED','REVIEWED','APPROVED','PUSH_READY','REJECTED','CANCELLED'))
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_voucher_drafts_idempotency" ON "chanjet_voucher_drafts" ("idempotency_key")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_writeback_outbox" (
        "id" bigserial NOT NULL,
        "draft_id" bigint NOT NULL,
        "idempotency_key" varchar(128) NOT NULL,
        "payload_hash" varchar(64) NOT NULL,
        "state" varchar(32) NOT NULL DEFAULT 'READY',
        "attempt_count" integer NOT NULL DEFAULT 0,
        "max_attempts" integer NOT NULL DEFAULT 3,
        "next_attempt_at" timestamptz,
        "provider_request_hash" varchar(64) NOT NULL DEFAULT '',
        "provider_response_hash" varchar(64) NOT NULL DEFAULT '',
        "provider_receipt" jsonb,
        "error_message" text,
        "compensation_ref" varchar(128) NOT NULL DEFAULT '',
        "external_write_enabled" boolean NOT NULL DEFAULT false,
        "created_by" varchar(128) NOT NULL DEFAULT '',
        "approved_by" varchar(128) NOT NULL DEFAULT '',
        "state_history" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_writeback_outbox" PRIMARY KEY ("id"),
        CONSTRAINT "uq_chanjet_writeback_outbox_idempotency" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_chanjet_writeback_outbox_draft" FOREIGN KEY ("draft_id") REFERENCES "chanjet_voucher_drafts"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_chanjet_writeback_outbox_state" CHECK ("state" IN ('READY','SENDING','ACKNOWLEDGED','FAILED','RETRYABLE','DEAD_LETTER','CANCELLED','REVERSED')),
        CONSTRAINT "CHK_chanjet_writeback_outbox_external_disabled" CHECK ("external_write_enabled" = false),
        CONSTRAINT "CHK_chanjet_writeback_outbox_attempts" CHECK ("attempt_count" >= 0 AND "max_attempts" BETWEEN 1 AND 10)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_writeback_outbox_state_retry" ON "chanjet_writeback_outbox" ("state", "next_attempt_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_writeback_outbox_draft" ON "chanjet_writeback_outbox" ("draft_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_writeback_outbox_draft"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_writeback_outbox_state_retry"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_writeback_outbox"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_voucher_drafts_idempotency"`);
    await queryRunner.query(`ALTER TABLE "chanjet_voucher_drafts" DROP CONSTRAINT IF EXISTS "CHK_chanjet_voucher_drafts_status"`);
    await queryRunner.query(`
      ALTER TABLE "chanjet_voucher_drafts"
        DROP COLUMN IF EXISTS "approved_at",
        DROP COLUMN IF EXISTS "approved_by",
        DROP COLUMN IF EXISTS "validated_at",
        DROP COLUMN IF EXISTS "validated_by",
        DROP COLUMN IF EXISTS "payload_hash",
        DROP COLUMN IF EXISTS "idempotency_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "chanjet_voucher_drafts"
        ADD CONSTRAINT "CHK_chanjet_voucher_drafts_status"
        CHECK ("status" IN ('DRAFT','REVIEWED','PUSH_READY','REJECTED'))
    `);
  }
}
