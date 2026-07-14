import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow a Chanjet counterparty to remain a verified read-only source identity
 * when the ERP has no matching customer/supplier business master yet.
 *
 * @allow-data-dml: down() converts SOURCE_ONLY rows back to PENDING before restoring the legacy constraint.
 */
export class AllowChanjetSourceOnlyMatchStatus1784042679000 implements MigrationInterface {
  name = 'AllowChanjetSourceOnlyMatchStatus1784042679000';

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
        'MISSING_IN_ERP',
        'MISSING_IN_CHANJET',
        'CONFLICT',
        'MANUAL',
        'PENDING'
      ))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "chanjet_master_mapping"
      SET "match_status" = 'PENDING',
          "review_status" = 'PENDING',
          "reviewed_by" = NULL,
          "reviewed_at" = NULL,
          "updated_at" = now()
      WHERE "match_status" = 'SOURCE_ONLY'
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
        'MISSING_IN_ERP',
        'MISSING_IN_CHANJET',
        'CONFLICT',
        'MANUAL',
        'PENDING'
      ))
    `);
  }
}
