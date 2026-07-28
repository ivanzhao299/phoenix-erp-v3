import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: archive and remove only deterministic pending duplicates before enforcing source identity
 */
export class EnforceChanjetMappingSourceIdentity1785410000000 implements MigrationInterface {
  name = 'EnforceChanjetMappingSourceIdentity1785410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chanjet_master_mapping_dedup_archive (
        original_id BIGINT PRIMARY KEY,
        source_identity VARCHAR(320) NOT NULL,
        archived_row JSONB NOT NULL,
        archive_reason VARCHAR(128) NOT NULL,
        archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      WITH safe_losers AS (
        SELECT pending.id
        FROM chanjet_master_mapping pending
        WHERE pending.chanjet_id <> ''
          AND pending.erp_code = ''
          AND pending.review_status = 'PENDING'
          AND pending.match_status = 'PENDING'
          AND (
            SELECT COUNT(*)
            FROM chanjet_master_mapping approved
            WHERE approved.mapping_type = pending.mapping_type
              AND approved.book_id = pending.book_id
              AND approved.chanjet_id = pending.chanjet_id
              AND approved.review_status = 'APPROVED'
              AND approved.erp_code <> ''
          ) = 1
      )
      INSERT INTO chanjet_master_mapping_dedup_archive
        (original_id, source_identity, archived_row, archive_reason)
      SELECT
        mapping.id,
        mapping.mapping_type || ':' || mapping.book_id || ':' || mapping.chanjet_id,
        to_jsonb(mapping),
        'PENDING_SOURCE_DUPLICATE_OF_SINGLE_APPROVED_MAPPING'
      FROM chanjet_master_mapping mapping
      JOIN safe_losers ON safe_losers.id = mapping.id
      ON CONFLICT (original_id) DO NOTHING
    `);

    await queryRunner.query(`
      DELETE FROM chanjet_master_mapping mapping
      USING chanjet_master_mapping_dedup_archive archive
      WHERE mapping.id = archive.original_id
        AND archive.archive_reason = 'PENDING_SOURCE_DUPLICATE_OF_SINGLE_APPROVED_MAPPING'
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_chanjet_master_mapping_source_identity
        ON chanjet_master_mapping(mapping_type, book_id, chanjet_id)
        WHERE chanjet_id <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_chanjet_master_mapping_source_identity
    `);
    await queryRunner.query(`
      INSERT INTO chanjet_master_mapping (
        id, mapping_type, book_id, erp_code, erp_name, chanjet_id, chanjet_code,
        chanjet_name, match_status, confidence, review_status, reviewed_by,
        reviewed_at, raw_data, created_at, updated_at
      )
      SELECT
        original_id,
        archived_row->>'mapping_type',
        archived_row->>'book_id',
        archived_row->>'erp_code',
        archived_row->>'erp_name',
        archived_row->>'chanjet_id',
        archived_row->>'chanjet_code',
        archived_row->>'chanjet_name',
        archived_row->>'match_status',
        COALESCE((archived_row->>'confidence')::numeric, 0),
        archived_row->>'review_status',
        NULLIF(archived_row->>'reviewed_by', ''),
        NULLIF(archived_row->>'reviewed_at', '')::timestamptz,
        archived_row->'raw_data',
        COALESCE((archived_row->>'created_at')::timestamptz, now()),
        COALESCE((archived_row->>'updated_at')::timestamptz, now())
      FROM chanjet_master_mapping_dedup_archive
      ON CONFLICT (id) DO NOTHING
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS chanjet_master_mapping_dedup_archive
    `);
  }
}
