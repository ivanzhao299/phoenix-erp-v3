import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the inventory-level classification used by the approved eight-grade
 * model. Existing business data is classified by the controlled ops script;
 * this migration is schema-only.
 */
export class AddInventoryClass1794600000000 implements MigrationInterface {
  name = 'AddInventoryClass1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('inv_batches'))) return;

    if (!(await queryRunner.hasColumn('inv_batches', 'inventory_class'))) {
      await queryRunner.query(`
        ALTER TABLE inv_batches
          ADD COLUMN inventory_class VARCHAR(20) NOT NULL DEFAULT 'STANDARD'
      `);
    }

    await queryRunner.query(`
      ALTER TABLE inv_batches
        DROP CONSTRAINT IF EXISTS inv_batches_inventory_class_check
    `);
    await queryRunner.query(`
      ALTER TABLE inv_batches
        ADD CONSTRAINT inv_batches_inventory_class_check
        CHECK (inventory_class IN ('STANDARD', 'DEFECT_SALE'))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_inv_batches_inventory_class_scope
        ON inv_batches (company_code, warehouse_code, inventory_class, status, qty_available)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('inv_batches'))) return;
    await queryRunner.query(`DROP INDEX IF EXISTS idx_inv_batches_inventory_class_scope`);
    await queryRunner.query(`
      ALTER TABLE inv_batches
        DROP CONSTRAINT IF EXISTS inv_batches_inventory_class_check
    `);
    if (await queryRunner.hasColumn('inv_batches', 'inventory_class')) {
      await queryRunner.query(`ALTER TABLE inv_batches DROP COLUMN inventory_class`);
    }
  }
}
