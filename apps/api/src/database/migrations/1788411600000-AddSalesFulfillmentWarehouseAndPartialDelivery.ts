/** @allow-data-dml: mark historical open orders without a fulfillment warehouse for explicit governance */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSalesFulfillmentWarehouseAndPartialDelivery1788411600000 implements MigrationInterface {
  name = 'AddSalesFulfillmentWarehouseAndPartialDelivery1788411600000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sal_sales_orders ADD COLUMN IF NOT EXISTS fulfillment_warehouse_code VARCHAR(64) REFERENCES wms_warehouses(warehouse_code)`);
    await queryRunner.query(`ALTER TABLE sal_sales_orders ADD COLUMN IF NOT EXISTS warehouse_governance_pending BOOLEAN NOT NULL DEFAULT FALSE`);
    await queryRunner.query(`UPDATE sal_sales_orders SET warehouse_governance_pending=TRUE WHERE fulfillment_warehouse_code IS NULL AND status NOT IN ('CANCELLED','REJECTED','RECEIVED','RECONCILED')`);
    await queryRunner.query(`ALTER TABLE sal_delivery_orders ADD COLUMN IF NOT EXISTS fulfillment_warehouse_code VARCHAR(64) REFERENCES wms_warehouses(warehouse_code)`);
    await queryRunner.query(`ALTER TABLE sal_delivery_order_items ADD COLUMN IF NOT EXISTS outbound_qty NUMERIC(18,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sal_delivery_active_order ON sal_delivery_order_items(sales_order_id) WHERE status NOT IN ('SIGNED','EXCEPTION','RETURNED')`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_sal_delivery_active_order`);
    await queryRunner.query(`ALTER TABLE sal_delivery_order_items DROP COLUMN IF EXISTS outbound_qty`);
    await queryRunner.query(`ALTER TABLE sal_delivery_orders DROP COLUMN IF EXISTS fulfillment_warehouse_code`);
    await queryRunner.query(`ALTER TABLE sal_sales_orders DROP COLUMN IF EXISTS warehouse_governance_pending`);
    await queryRunner.query(`ALTER TABLE sal_sales_orders DROP COLUMN IF EXISTS fulfillment_warehouse_code`);
  }
}
