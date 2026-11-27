import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EggSourceOperationReceipts1795659000000 implements MigrationInterface {
  name = 'EggSourceOperationReceipts1795659000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE md_egg_source_cutover_records
        DROP CONSTRAINT md_egg_source_cutover_records_kind_check,
        ADD CONSTRAINT md_egg_source_cutover_records_kind_check
          CHECK (kind IN ('ARCHIVE','UNARCHIVE','LEGACY_GRANT','VERIFY','SIGN','RETIRE','HOUSE_ROLLOUT','RETIRE_PILOT','OPERATION_CANCELLED'));
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      LOCK TABLE md_egg_source_cutover_records IN ACCESS EXCLUSIVE MODE;
      ALTER TABLE md_egg_source_cutover_records
        DROP CONSTRAINT md_egg_source_cutover_records_kind_check,
        ADD CONSTRAINT md_egg_source_cutover_records_kind_check
          CHECK (kind IN ('ARCHIVE','UNARCHIVE','LEGACY_GRANT','VERIFY','SIGN','RETIRE'));
    `);
  }
}
