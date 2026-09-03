import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryExceptionAndReturnRestockTargets1788415200000 implements MigrationInterface {
  name = 'AddDeliveryExceptionAndReturnRestockTargets1788415200000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS sal_delivery_exceptions (
      id BIGSERIAL PRIMARY KEY,receipt_id BIGINT NOT NULL UNIQUE REFERENCES sal_receipts(id),
      delivery_order_id BIGINT NOT NULL REFERENCES sal_delivery_orders(id),delivery_item_id BIGINT NOT NULL REFERENCES sal_delivery_order_items(id),
      sales_order_id BIGINT NOT NULL REFERENCES sal_sales_orders(id),exception_type VARCHAR(32) NOT NULL,
      return_order_id BIGINT REFERENCES sal_return_orders(id),
      exception_qty NUMERIC(18,2) NOT NULL CHECK(exception_qty>0),resolution_status VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),resolved_at TIMESTAMPTZ
    )`);
    await queryRunner.query(`ALTER TABLE sal_return_orders ADD COLUMN IF NOT EXISTS target_warehouse_code VARCHAR(64) REFERENCES wms_warehouses(warehouse_code)`);
    // Minimal CI baseline may not materialize WMS lookup tables; runtime validates the full hierarchy.
    await queryRunner.query(`ALTER TABLE sal_return_orders ADD COLUMN IF NOT EXISTS target_zone_code VARCHAR(64)`);
    await queryRunner.query(`ALTER TABLE sal_return_orders ADD COLUMN IF NOT EXISTS target_location_code VARCHAR(64)`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sal_return_orders DROP COLUMN IF EXISTS target_location_code`);
    await queryRunner.query(`ALTER TABLE sal_return_orders DROP COLUMN IF EXISTS target_zone_code`);
    await queryRunner.query(`ALTER TABLE sal_return_orders DROP COLUMN IF EXISTS target_warehouse_code`);
    await queryRunner.query(`DROP TABLE IF EXISTS sal_delivery_exceptions`);
  }
}
