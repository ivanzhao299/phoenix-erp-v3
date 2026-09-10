import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 为历史分级记录补唯一幂等占位键与载荷摘要，随后收紧为 NOT NULL。
 */
export class GovernPackagingGradingSubmissions1789012800000 implements MigrationInterface {
  name = 'GovernPackagingGradingSubmissions1789012800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pkg_grading_records
        ADD COLUMN IF NOT EXISTS idempotency_key varchar(120),
        ADD COLUMN IF NOT EXISTS payload_hash varchar(64)
    `);
    await queryRunner.query(`
      UPDATE pkg_grading_records
         SET idempotency_key = 'legacy-grading-' || id::text
       WHERE idempotency_key IS NULL OR BTRIM(idempotency_key) = ''
    `);
    await queryRunner.query(`
      UPDATE pkg_grading_records
         SET payload_hash = md5(COALESCE(outputs_json::text, '{}') || ':' || COALESCE(total_output, 0)::text)
       WHERE payload_hash IS NULL OR BTRIM(payload_hash) = ''
    `);
    await queryRunner.query(`
      ALTER TABLE pkg_grading_records
        ALTER COLUMN idempotency_key SET NOT NULL,
        ALTER COLUMN payload_hash SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_pkg_grading_records_idempotency_key
        ON pkg_grading_records (idempotency_key)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pkg_grading_source_links (
        grading_id integer NOT NULL REFERENCES pkg_grading_records(id) ON DELETE RESTRICT,
        source_batch_id integer NOT NULL REFERENCES pkg_source_batches(id) ON DELETE RESTRICT,
        input_qty integer NOT NULL,
        created_at timestamp without time zone NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_pkg_grading_source_links PRIMARY KEY (grading_id, source_batch_id),
        CONSTRAINT ck_pkg_grading_source_links_input_qty_positive CHECK (input_qty > 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pkg_grading_source_links_source_batch
        ON pkg_grading_source_links (source_batch_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_pkg_grading_source_links_source_batch');
    await queryRunner.query('DROP TABLE IF EXISTS pkg_grading_source_links');
    await queryRunner.query('DROP INDEX IF EXISTS uq_pkg_grading_records_idempotency_key');
    await queryRunner.query(`
      ALTER TABLE pkg_grading_records
        DROP COLUMN IF EXISTS payload_hash,
        DROP COLUMN IF EXISTS idempotency_key
    `);
  }
}
