import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add canonical inventory identity columns to inbound detail rows.
 *
 * This migration is intentionally additive. Historical rows only have the
 * legacy product_code field and are reconciled by the issue-549 backfill
 * script after the schema is deployed. No NOT NULL/CHECK constraint is added
 * here so old rows cannot block the migration.
 */
export class AddWmsInboundItemIdentity1794800000000 implements MigrationInterface {
  name = 'AddWmsInboundItemIdentity1794800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('wms_inbound_items'))) return;

    await queryRunner.query(`
      ALTER TABLE "wms_inbound_items"
        ADD COLUMN IF NOT EXISTS "item_type" VARCHAR(24),
        ADD COLUMN IF NOT EXISTS "material_code" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "sku_code" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "material_type" VARCHAR(48),
        ADD COLUMN IF NOT EXISTS "unit" VARCHAR(24),
        ADD COLUMN IF NOT EXISTS "identity_snapshot" JSONB
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wms_inbound_items_material_code"
        ON "wms_inbound_items" ("material_code")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wms_inbound_items_sku_code"
        ON "wms_inbound_items" ("sku_code")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('wms_inbound_items'))) return;

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_wms_inbound_items_sku_code"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_wms_inbound_items_material_code"',
    );
    await queryRunner.query(`
      ALTER TABLE "wms_inbound_items"
        DROP COLUMN IF EXISTS "identity_snapshot",
        DROP COLUMN IF EXISTS "unit",
        DROP COLUMN IF EXISTS "material_type",
        DROP COLUMN IF EXISTS "sku_code",
        DROP COLUMN IF EXISTS "material_code",
        DROP COLUMN IF EXISTS "item_type"
    `);
  }
}
