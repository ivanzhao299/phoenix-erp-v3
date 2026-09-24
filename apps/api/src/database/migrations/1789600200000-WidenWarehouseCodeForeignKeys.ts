import { MigrationInterface, QueryRunner } from 'typeorm';

const links = [
  ['store_warehouse_bindings', 'warehouse_code', 'store_warehouse_bindings_warehouse_code_fkey'],
  ['store_replenishment_requests', 'source_warehouse_code', 'store_replenishment_requests_source_warehouse_code_fkey'],
  ['store_replenishment_requests', 'target_warehouse_code', 'store_replenishment_requests_target_warehouse_code_fkey'],
  ['sal_sales_orders', 'fulfillment_warehouse_code', 'sal_sales_orders_fulfillment_warehouse_code_fkey'],
  ['sal_delivery_orders', 'fulfillment_warehouse_code', 'sal_delivery_orders_fulfillment_warehouse_code_fkey'],
  ['sal_return_orders', 'target_warehouse_code', 'sal_return_orders_target_warehouse_code_fkey'],
] as const;

export class WidenWarehouseCodeForeignKeys1789600200000 implements MigrationInterface {
  name = 'WidenWarehouseCodeForeignKeys1789600200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('wms_warehouses')) || !(await queryRunner.hasColumn('wms_warehouses', 'warehouse_code'))) return;
    if (await queryRunner.hasTable('store_warehouse_bindings')) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS trg_store_operational_warehouse ON store_warehouse_bindings`);
    }
    for (const [table, , constraint] of links) {
      if (await queryRunner.hasTable(table)) await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
    }
    await queryRunner.query(`ALTER TABLE wms_warehouses ALTER COLUMN warehouse_code TYPE VARCHAR(64)`);
    for (const [table, column] of links) {
      if (await queryRunner.hasTable(table) && await queryRunner.hasColumn(table, column)) {
        await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE VARCHAR(64)`);
      }
    }
    for (const [table, column, constraint] of links) {
      if (!(await queryRunner.hasTable(table)) || !(await queryRunner.hasColumn(table, column))) continue;
      await queryRunner.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}') THEN
            ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (${column}) REFERENCES wms_warehouses(warehouse_code);
          END IF;
        END $$
      `);
    }
    if (await queryRunner.hasTable('store_warehouse_bindings')) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF to_regprocedure('enforce_store_operational_warehouse()') IS NOT NULL THEN
            CREATE TRIGGER trg_store_operational_warehouse
            BEFORE INSERT OR UPDATE OF warehouse_code, status ON store_warehouse_bindings
            FOR EACH ROW WHEN (NEW.status = 'ACTIVE')
            EXECUTE FUNCTION enforce_store_operational_warehouse();
          END IF;
        END $$
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('wms_warehouses')) || !(await queryRunner.hasColumn('wms_warehouses', 'warehouse_code'))) return;
    const [{ max_length: parentMax } = {}] = await queryRunner.query(`SELECT max(length(warehouse_code)) AS max_length FROM wms_warehouses`);
    if (parentMax !== null && parentMax !== undefined && Number(parentMax) > 32) throw new Error('Cannot safely narrow warehouse_code parent');
    if (await queryRunner.hasTable('store_warehouse_bindings')) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS trg_store_operational_warehouse ON store_warehouse_bindings`);
    }
    for (const [table, column] of links) {
      if (await queryRunner.hasTable(table) && await queryRunner.hasColumn(table, column)) {
        const [{ max_length: childMax } = {}] = await queryRunner.query(`SELECT max(length(${column})) AS max_length FROM ${table}`);
        if (childMax !== null && childMax !== undefined && Number(childMax) > 32) throw new Error(`Cannot safely narrow ${table}.${column}`);
      }
    }
    for (const [table, , constraint] of links) {
      if (await queryRunner.hasTable(table)) await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
    }
    for (const [table, column] of links) {
      if (await queryRunner.hasTable(table) && await queryRunner.hasColumn(table, column)) await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE VARCHAR(32)`);
    }
    await queryRunner.query(`ALTER TABLE wms_warehouses ALTER COLUMN warehouse_code TYPE VARCHAR(32)`);
    if (await queryRunner.hasTable('store_warehouse_bindings')) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF to_regprocedure('enforce_store_operational_warehouse()') IS NOT NULL THEN
            CREATE TRIGGER trg_store_operational_warehouse
            BEFORE INSERT OR UPDATE OF warehouse_code, status ON store_warehouse_bindings
            FOR EACH ROW WHEN (NEW.status = 'ACTIVE')
            EXECUTE FUNCTION enforce_store_operational_warehouse();
          END IF;
        END $$
      `);
    }
  }

}
