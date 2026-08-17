import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow an audit-proven Chanjet source identity to be closed as intentionally
 * not applicable to an ERP master. This is a schema-only change: existing
 * mapping rows are not modified by the migration.
 */
export class AllowChanjetNotApplicableMatchStatus1786000000000 implements MigrationInterface {
  name = 'AllowChanjetNotApplicableMatchStatus1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chanjet_master_mapping"
      DROP CONSTRAINT IF EXISTS "CHK_chanjet_master_mapping_match_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "chanjet_master_mapping"
      ADD CONSTRAINT "CHK_chanjet_master_mapping_match_status"
      CHECK ("match_status" IN (
        'MATCHED',
        'SOURCE_ONLY',
        'NOT_APPLICABLE',
        'MISSING_IN_ERP',
        'MISSING_IN_CHANJET',
        'CONFLICT',
        'MANUAL',
        'PENDING'
      )) NOT VALID
    `);
    await queryRunner.query(`
      ALTER TABLE "chanjet_master_mapping"
      VALIDATE CONSTRAINT "CHK_chanjet_master_mapping_match_status"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "chanjet_master_mapping"
          WHERE "match_status" = 'NOT_APPLICABLE'
        ) THEN
          RAISE EXCEPTION 'Refusing downgrade: NOT_APPLICABLE Chanjet mappings exist';
        END IF;
      END
      $$
    `);
    await queryRunner.query(`
      ALTER TABLE "chanjet_master_mapping"
      DROP CONSTRAINT IF EXISTS "CHK_chanjet_master_mapping_match_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "chanjet_master_mapping"
      ADD CONSTRAINT "CHK_chanjet_master_mapping_match_status"
      CHECK ("match_status" IN (
        'MATCHED',
        'SOURCE_ONLY',
        'MISSING_IN_ERP',
        'MISSING_IN_CHANJET',
        'CONFLICT',
        'MANUAL',
        'PENDING'
      )) NOT VALID
    `);
    await queryRunner.query(`
      ALTER TABLE "chanjet_master_mapping"
      VALIDATE CONSTRAINT "CHK_chanjet_master_mapping_match_status"
    `);
  }
}
