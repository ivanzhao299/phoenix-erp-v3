import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #532: make inventory policy explicit on the grade master.
 *
 * The legacy is_saleable/is_storable columns remain in place for old readers.
 * New columns are nullable on purpose: a freshly migrated database must fall
 * back to the already trusted legacy flags until the reviewed seed has run.
 * This prevents a defect row from becoming saleable during the migration/seed
 * window. No business data DML belongs in the TypeORM migration chain.
 */
export class AddGradeInventoryPolicy1794403000000 implements MigrationInterface {
  name = 'AddGradeInventoryPolicy1794403000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_grades"
        ADD COLUMN IF NOT EXISTS "stock_managed" boolean,
        ADD COLUMN IF NOT EXISTS "sale_enabled" boolean,
        ADD COLUMN IF NOT EXISTS "default_stock_status" varchar(16)
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = 'ck_product_grades_default_stock_status'
             AND conrelid = 'product_grades'::regclass
        ) THEN
          ALTER TABLE "product_grades"
            ADD CONSTRAINT "ck_product_grades_default_stock_status"
            CHECK ("default_stock_status" IS NULL OR "default_stock_status" IN ('AVAILABLE', 'RESERVED', 'QUARANTINE', 'DAMAGED', 'FROZEN'));
        END IF;
      END $$
    `);
    await queryRunner.query(`COMMENT ON COLUMN "product_grades"."stock_managed" IS 'Issue #532: all nine egg grades enter inventory management; scope stock_enabled remains company authorization'`);
    await queryRunner.query(`COMMENT ON COLUMN "product_grades"."sale_enabled" IS 'Issue #532: sale-layer permission inherited by SKU; defects remain inventory-only'`);
    await queryRunner.query(`COMMENT ON COLUMN "product_grades"."default_stock_status" IS 'Issue #532: initial inv_batches status for this grade; defect grades default to QUARANTINE or DAMAGED'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_grades" DROP CONSTRAINT IF EXISTS "ck_product_grades_default_stock_status"`);
    await queryRunner.query(`ALTER TABLE "product_grades" DROP COLUMN IF EXISTS "default_stock_status", DROP COLUMN IF EXISTS "sale_enabled", DROP COLUMN IF EXISTS "stock_managed"`);
  }
}
