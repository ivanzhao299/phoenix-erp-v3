import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Canonical daily-report migration gate for issues 498/499.
 *
 * Historical rows may carry fields and inventory references that cannot be
 * losslessly merged in a schema migration. This migration therefore fails
 * closed when consolidation is required and performs no business-row DELETE or
 * UPDATE. A reviewed repair receipt must establish a safe, scoped result first.
 */
export class ConsolidateBreedingDailyLogs1790000000000 implements MigrationInterface {
  name = 'ConsolidateBreedingDailyLogs1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();
    try {
      const invalid = await queryRunner.query(`
        SELECT COUNT(*)::int AS count
        FROM brd_daily_logs
        WHERE log_date IS NULL OR house_code IS NULL OR BTRIM(house_code) = ''
      `);
      if (Number(invalid[0]?.count || 0) > 0) {
        throw new Error('BREEDING_DAILY_MIGRATION_HOLD_INVALID_IDENTITY');
      }

      const duplicateGroups = await queryRunner.query(`
        SELECT log_date, house_code, COUNT(*)::int AS row_count
        FROM brd_daily_logs
        GROUP BY log_date, house_code
        HAVING COUNT(*) > 1
        LIMIT 1
      `);
      if (duplicateGroups.length > 0) {
        throw new Error(
          `BREEDING_DAILY_MIGRATION_HOLD_REVIEW_REQUIRED:${duplicateGroups[0].log_date}:${duplicateGroups[0].house_code}`,
        );
      }

      // No data mutation is required when every date/house has one row. Keep
      // the migration transactional and idempotent; reviewed repair tooling is
      // the only path allowed to merge historical business rows.
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // up() creates no schema or business data. Execute a harmless transactional
    // probe so the migration contract remains genuinely reversible without
    // restoring snapshots over post-deployment edits.
    await queryRunner.query('SELECT 1');
  }
}
