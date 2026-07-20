import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chanjet master-data IDs are account-book-local, not globally unique.
 * For example, cash account ID 12 can denote unrelated accounts in two books.
 */
export class ScopeChanjetMasterMappingByBook1784552282000 implements MigrationInterface {
  name = 'ScopeChanjetMasterMappingByBook1784552282000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chanjet_master_mapping"
      DROP CONSTRAINT IF EXISTS "uq_chanjet_master_mapping"
    `);
    await queryRunner.query(`
      ALTER TABLE "chanjet_master_mapping"
      ADD CONSTRAINT "uq_chanjet_master_mapping"
      UNIQUE ("mapping_type", "book_id", "erp_code", "chanjet_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "chanjet_master_mapping"
          GROUP BY "mapping_type", "erp_code", "chanjet_id"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION
            'Cannot restore global Chanjet mapping uniqueness while cross-book mappings exist';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "chanjet_master_mapping"
      DROP CONSTRAINT IF EXISTS "uq_chanjet_master_mapping"
    `);
    await queryRunner.query(`
      ALTER TABLE "chanjet_master_mapping"
      ADD CONSTRAINT "uq_chanjet_master_mapping"
      UNIQUE ("mapping_type", "erp_code", "chanjet_id")
    `);
  }
}
