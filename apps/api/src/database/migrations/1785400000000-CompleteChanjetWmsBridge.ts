import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteChanjetWmsBridge1785400000000 implements MigrationInterface {
  name = 'CompleteChanjetWmsBridge1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('wms_outbound')) {
      await queryRunner.query(`
        ALTER TABLE wms_outbound
          ADD COLUMN IF NOT EXISTS currency_code VARCHAR(16)
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chanjet_wms_promotion_candidates (
        id BIGSERIAL PRIMARY KEY,
        book_id VARCHAR(64) NOT NULL,
        entity_type VARCHAR(64) NOT NULL,
        external_document_id VARCHAR(128) NOT NULL,
        external_document_no VARCHAR(128) NOT NULL DEFAULT '',
        company_code VARCHAR(64) NOT NULL DEFAULT '',
        erp_direction VARCHAR(16) NOT NULL,
        erp_document_type VARCHAR(64) NOT NULL,
        state VARCHAR(32) NOT NULL DEFAULT 'CANDIDATE',
        source_hash VARCHAR(64) NOT NULL,
        mapping_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
        canonical_payload JSONB NOT NULL,
        blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
        conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
        approved_by VARCHAR(128) NOT NULL DEFAULT '',
        approved_at TIMESTAMPTZ,
        promoted_document_no VARCHAR(128) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_chanjet_wms_promotion_source
          UNIQUE (book_id, entity_type, external_document_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chanjet_wms_promotion_state
        ON chanjet_wms_promotion_candidates(state, updated_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chanjet_wms_writeback_outbox (
        id BIGSERIAL PRIMARY KEY,
        book_id VARCHAR(64) NOT NULL,
        company_code VARCHAR(64) NOT NULL,
        document_type VARCHAR(64) NOT NULL,
        erp_document_no VARCHAR(128) NOT NULL,
        idempotency_key VARCHAR(160) NOT NULL,
        payload_hash VARCHAR(64) NOT NULL,
        canonical_payload JSONB NOT NULL,
        state VARCHAR(32) NOT NULL DEFAULT 'READY',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        next_attempt_at TIMESTAMPTZ,
        provider_receipt JSONB,
        readback_evidence JSONB,
        error_message TEXT,
        compensation_ref VARCHAR(128) NOT NULL DEFAULT '',
        external_write_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_by VARCHAR(128) NOT NULL DEFAULT '',
        approved_by VARCHAR(128) NOT NULL DEFAULT '',
        state_history JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_chanjet_wms_outbox_idempotency UNIQUE (idempotency_key)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chanjet_wms_outbox_state_retry
        ON chanjet_wms_writeback_outbox(state, next_attempt_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chanjet_wms_outbox_document
        ON chanjet_wms_writeback_outbox(document_type, erp_document_no)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chanjet_wms_outbox_document`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chanjet_wms_outbox_state_retry`);
    await queryRunner.query(`DROP TABLE IF EXISTS chanjet_wms_writeback_outbox`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chanjet_wms_promotion_state`);
    await queryRunner.query(`DROP TABLE IF EXISTS chanjet_wms_promotion_candidates`);
    if (await queryRunner.hasTable('wms_outbound')) {
      await queryRunner.query(`
        ALTER TABLE wms_outbound
          DROP COLUMN IF EXISTS currency_code
      `);
    }
  }
}
