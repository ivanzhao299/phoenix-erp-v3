import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make TEMP_PRODUCTION batches durable and idempotent at the database edge.
 *
 * The service already serializes retries with an advisory lock. This index is
 * the final guard against a second writer bypassing that service or a future
 * code path accidentally creating a duplicate source batch.
 */
export class EnforceTempProductionSourceIdentity1792000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('inv_batches'))) return;

    const duplicates = await queryRunner.query(`
      SELECT company_code, source_no, COALESCE(sku_code, '') AS sku_code,
             COALESCE(grade_code_std, quality_grade, '') AS grade_code,
             COALESCE(spec_code, packaging_spec, '') AS spec_code,
             COUNT(*)::int AS duplicate_count
        FROM inv_batches
       WHERE source_type = 'TEMP_PRODUCTION'
         AND source_no IS NOT NULL
       GROUP BY company_code, source_no,
                COALESCE(sku_code, ''),
                COALESCE(grade_code_std, quality_grade, ''),
                COALESCE(spec_code, packaging_spec, '')
      HAVING COUNT(*) > 1
       LIMIT 1
    `);
    if (duplicates.length > 0) {
      throw new Error(
        'TEMP_PRODUCTION_SOURCE_DUPLICATES_EXIST: run scripts/ops/audit-daily-egg-inbound.mjs and resolve the reported groups before applying this migration',
      );
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_batches_temp_production_source_identity
        ON inv_batches (
          company_code,
          source_type,
          source_no,
          COALESCE(sku_code, ''),
          COALESCE(grade_code_std, quality_grade, ''),
          COALESCE(spec_code, packaging_spec, '')
        )
       WHERE source_type = 'TEMP_PRODUCTION' AND source_no IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS uq_inv_batches_temp_production_source_identity');
  }
}
