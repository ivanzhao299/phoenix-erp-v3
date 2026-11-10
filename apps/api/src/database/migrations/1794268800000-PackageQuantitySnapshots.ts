import { MigrationInterface, QueryRunner } from 'typeorm';

/** Forward only quantity contract. No historical business data is inferred or backfilled. */
export class PackageQuantitySnapshots1794268800000 implements MigrationInterface {
  private readonly tables = ['sal_order_items', 'sal_store_sale_items', 'sal_return_items', 'sal_price_items', 'wms_outbound', 'wms_inbound_items', 'wms_outbound_items'];
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS quantity_snapshot jsonb`);
      await queryRunner.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_${table}_quantity_snapshot' AND conrelid='${table}'::regclass) THEN
          ALTER TABLE "${table}" ADD CONSTRAINT "ck_${table}_quantity_snapshot" CHECK (
            quantity_snapshot IS NULL OR (jsonb_typeof(quantity_snapshot)='object'
              AND quantity_snapshot @> '{"version":1}'::jsonb
              AND quantity_snapshot->>'basis' IN ('BASE','PACKAGE')
              AND jsonb_typeof(quantity_snapshot->'factor')='number'
              AND jsonb_typeof(quantity_snapshot->'baseQty')='number'
              AND jsonb_typeof(quantity_snapshot->'baseUnit')='string'
              AND jsonb_typeof(quantity_snapshot->'tradeUnit')='string') IS TRUE);
        END IF;
      END $$`);
    }
    await queryRunner.query('ALTER TABLE sal_order_items ADD COLUMN IF NOT EXISTS price_snapshot jsonb');
    await queryRunner.query('ALTER TABLE sal_return_items ADD COLUMN IF NOT EXISTS valuation_snapshot jsonb');
    await queryRunner.query('ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS base_quantity_version smallint');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE sal_order_items DROP COLUMN IF EXISTS price_snapshot');
    await queryRunner.query('ALTER TABLE sal_return_items DROP COLUMN IF EXISTS valuation_snapshot');
    await queryRunner.query('ALTER TABLE inv_batches DROP COLUMN IF EXISTS base_quantity_version');
    for (const table of [...this.tables].reverse()) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS quantity_snapshot`);
    }
  }
}
