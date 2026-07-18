import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The archived v5 SQL was never part of the production migration glob, while
 * the packaging terminal receive endpoint already writes these columns.
 */
export class AddPackagingSourceBatchQuantities1784374615347 implements MigrationInterface {
  name = 'AddPackagingSourceBatchQuantities1784374615347';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.pkg_source_batches') IS NOT NULL THEN
          ALTER TABLE pkg_source_batches
            ADD COLUMN IF NOT EXISTS total_qty INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS dirty_qty INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS cracked_qty INTEGER NOT NULL DEFAULT 0;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.pkg_source_batches') IS NOT NULL THEN
          ALTER TABLE pkg_source_batches
            DROP COLUMN IF EXISTS cracked_qty,
            DROP COLUMN IF EXISTS dirty_qty,
            DROP COLUMN IF EXISTS total_qty;
        END IF;
      END $$;
    `);
  }
}
