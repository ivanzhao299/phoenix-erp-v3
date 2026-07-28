import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWmsChanjetEquivalentFields1785300000000 implements MigrationInterface {
  name = 'AddWmsChanjetEquivalentFields1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS wms_inbound
        ADD COLUMN IF NOT EXISTS source_system VARCHAR(24) NOT NULL DEFAULT 'ERP',
        ADD COLUMN IF NOT EXISTS external_book_id VARCHAR(64),
        ADD COLUMN IF NOT EXISTS external_document_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS external_document_no VARCHAR(128),
        ADD COLUMN IF NOT EXISTS external_status VARCHAR(32),
        ADD COLUMN IF NOT EXISTS external_source VARCHAR(32),
        ADD COLUMN IF NOT EXISTS source_order_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS source_order_no VARCHAR(128),
        ADD COLUMN IF NOT EXISTS counterparty_code VARCHAR(128),
        ADD COLUMN IF NOT EXISTS counterparty_name VARCHAR(256),
        ADD COLUMN IF NOT EXISTS department_code VARCHAR(128),
        ADD COLUMN IF NOT EXISTS department_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS warehouse_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS biz_employee_code VARCHAR(128),
        ADD COLUMN IF NOT EXISTS biz_employee_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS currency_id VARCHAR(64),
        ADD COLUMN IF NOT EXISTS currency_name VARCHAR(64),
        ADD COLUMN IF NOT EXISTS red_blue_flag VARCHAR(32),
        ADD COLUMN IF NOT EXISTS expense_note_type VARCHAR(64),
        ADD COLUMN IF NOT EXISTS invoice_no VARCHAR(128),
        ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS comments TEXT,
        ADD COLUMN IF NOT EXISTS external_payload_hash CHAR(64),
        ADD COLUMN IF NOT EXISTS sync_status VARCHAR(32) NOT NULL DEFAULT 'ERP_ONLY',
        ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS wms_outbound
        ADD COLUMN IF NOT EXISTS source_system VARCHAR(24) NOT NULL DEFAULT 'ERP',
        ADD COLUMN IF NOT EXISTS external_book_id VARCHAR(64),
        ADD COLUMN IF NOT EXISTS external_document_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS external_document_no VARCHAR(128),
        ADD COLUMN IF NOT EXISTS external_status VARCHAR(32),
        ADD COLUMN IF NOT EXISTS external_source VARCHAR(32),
        ADD COLUMN IF NOT EXISTS source_order_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS source_order_no VARCHAR(128),
        ADD COLUMN IF NOT EXISTS sold_to_customer_code VARCHAR(128),
        ADD COLUMN IF NOT EXISTS sold_to_customer_name VARCHAR(256),
        ADD COLUMN IF NOT EXISTS bill_to_customer_code VARCHAR(128),
        ADD COLUMN IF NOT EXISTS bill_to_customer_name VARCHAR(256),
        ADD COLUMN IF NOT EXISTS department_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS biz_employee_code VARCHAR(128),
        ADD COLUMN IF NOT EXISTS biz_employee_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS project_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS warehouse_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS currency_id VARCHAR(64),
        ADD COLUMN IF NOT EXISTS currency_name VARCHAR(64),
        ADD COLUMN IF NOT EXISTS red_blue_flag VARCHAR(32),
        ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
        ADD COLUMN IF NOT EXISTS delivery_address VARCHAR(500),
        ADD COLUMN IF NOT EXISTS contact_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(64),
        ADD COLUMN IF NOT EXISTS ship_method VARCHAR(64),
        ADD COLUMN IF NOT EXISTS pickup_person VARCHAR(160),
        ADD COLUMN IF NOT EXISTS pickup_phone VARCHAR(64),
        ADD COLUMN IF NOT EXISTS tracking_no VARCHAR(128),
        ADD COLUMN IF NOT EXISTS driver_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS truck_no VARCHAR(64),
        ADD COLUMN IF NOT EXISTS carrier_code VARCHAR(128),
        ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(256),
        ADD COLUMN IF NOT EXISTS comments TEXT,
        ADD COLUMN IF NOT EXISTS external_payload_hash CHAR(64),
        ADD COLUMN IF NOT EXISTS sync_status VARCHAR(32) NOT NULL DEFAULT 'ERP_ONLY',
        ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS wms_inbound_items
        ADD COLUMN IF NOT EXISTS external_line_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS external_line_code VARCHAR(128),
        ADD COLUMN IF NOT EXISTS product_name VARCHAR(256),
        ADD COLUMN IF NOT EXISTS product_spec_no VARCHAR(256),
        ADD COLUMN IF NOT EXISTS item_barcode VARCHAR(128),
        ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS warehouse_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS inventory_lot_no VARCHAR(128),
        ADD COLUMN IF NOT EXISTS trans_qty NUMERIC(18,6),
        ADD COLUMN IF NOT EXISTS trans_uom_name VARCHAR(64),
        ADD COLUMN IF NOT EXISTS trans2_qty NUMERIC(18,6),
        ADD COLUMN IF NOT EXISTS trans2_uom_name VARCHAR(64),
        ADD COLUMN IF NOT EXISTS list_price NUMERIC(18,8),
        ADD COLUMN IF NOT EXISTS net_price_with_tax NUMERIC(18,8),
        ADD COLUMN IF NOT EXISTS net_price_without_tax NUMERIC(18,8),
        ADD COLUMN IF NOT EXISTS net_amount_with_tax NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS net_amount_without_tax NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(9,6),
        ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS cost_price NUMERIC(18,8),
        ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS allocated_expense_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS is_free_gift BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS source_order_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS source_order_no VARCHAR(128),
        ADD COLUMN IF NOT EXISTS serial_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS external_raw JSONB NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS wms_outbound_items
        ADD COLUMN IF NOT EXISTS external_line_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS external_line_code VARCHAR(128),
        ADD COLUMN IF NOT EXISTS product_name VARCHAR(256),
        ADD COLUMN IF NOT EXISTS product_spec_no VARCHAR(256),
        ADD COLUMN IF NOT EXISTS item_barcode VARCHAR(128),
        ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS warehouse_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS inventory_lot_no VARCHAR(128),
        ADD COLUMN IF NOT EXISTS trans_qty NUMERIC(18,6),
        ADD COLUMN IF NOT EXISTS trans_uom_name VARCHAR(64),
        ADD COLUMN IF NOT EXISTS trans2_qty NUMERIC(18,6),
        ADD COLUMN IF NOT EXISTS trans2_uom_name VARCHAR(64),
        ADD COLUMN IF NOT EXISTS list_price NUMERIC(18,8),
        ADD COLUMN IF NOT EXISTS net_price_with_tax NUMERIC(18,8),
        ADD COLUMN IF NOT EXISTS net_price_without_tax NUMERIC(18,8),
        ADD COLUMN IF NOT EXISTS net_amount_with_tax NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS net_amount_without_tax NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(9,6),
        ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS is_free_gift BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS source_order_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS source_order_no VARCHAR(128),
        ADD COLUMN IF NOT EXISTS serial_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS external_raw JSONB NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS UX_wms_inbound_chanjet_document
        ON wms_inbound(source_system, external_book_id, external_document_id)
        WHERE source_system = 'CHANJET' AND external_document_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS UX_wms_outbound_chanjet_document
        ON wms_outbound(source_system, external_book_id, external_document_id)
        WHERE source_system = 'CHANJET' AND external_document_id IS NOT NULL
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_wms_inbound_source_order ON wms_inbound(source_order_no)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_wms_outbound_source_order ON wms_outbound(source_order_no)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_wms_outbound_source_order`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_wms_inbound_source_order`);
    await queryRunner.query(`DROP INDEX IF EXISTS UX_wms_outbound_chanjet_document`);
    await queryRunner.query(`DROP INDEX IF EXISTS UX_wms_inbound_chanjet_document`);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS wms_outbound_items
        DROP COLUMN IF EXISTS external_raw,
        DROP COLUMN IF EXISTS serial_numbers,
        DROP COLUMN IF EXISTS source_order_no,
        DROP COLUMN IF EXISTS source_order_id,
        DROP COLUMN IF EXISTS is_free_gift,
        DROP COLUMN IF EXISTS discount_amount,
        DROP COLUMN IF EXISTS tax_amount,
        DROP COLUMN IF EXISTS tax_rate,
        DROP COLUMN IF EXISTS net_amount_without_tax,
        DROP COLUMN IF EXISTS net_amount_with_tax,
        DROP COLUMN IF EXISTS net_price_without_tax,
        DROP COLUMN IF EXISTS net_price_with_tax,
        DROP COLUMN IF EXISTS list_price,
        DROP COLUMN IF EXISTS trans2_uom_name,
        DROP COLUMN IF EXISTS trans2_qty,
        DROP COLUMN IF EXISTS trans_uom_name,
        DROP COLUMN IF EXISTS trans_qty,
        DROP COLUMN IF EXISTS inventory_lot_no,
        DROP COLUMN IF EXISTS warehouse_name,
        DROP COLUMN IF EXISTS warehouse_code,
        DROP COLUMN IF EXISTS item_barcode,
        DROP COLUMN IF EXISTS product_spec_no,
        DROP COLUMN IF EXISTS product_name,
        DROP COLUMN IF EXISTS external_line_code,
        DROP COLUMN IF EXISTS external_line_id
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS wms_inbound_items
        DROP COLUMN IF EXISTS external_raw,
        DROP COLUMN IF EXISTS serial_numbers,
        DROP COLUMN IF EXISTS source_order_no,
        DROP COLUMN IF EXISTS source_order_id,
        DROP COLUMN IF EXISTS is_free_gift,
        DROP COLUMN IF EXISTS allocated_expense_amount,
        DROP COLUMN IF EXISTS discount_amount,
        DROP COLUMN IF EXISTS cost_amount,
        DROP COLUMN IF EXISTS cost_price,
        DROP COLUMN IF EXISTS tax_amount,
        DROP COLUMN IF EXISTS tax_rate,
        DROP COLUMN IF EXISTS net_amount_without_tax,
        DROP COLUMN IF EXISTS net_amount_with_tax,
        DROP COLUMN IF EXISTS net_price_without_tax,
        DROP COLUMN IF EXISTS net_price_with_tax,
        DROP COLUMN IF EXISTS list_price,
        DROP COLUMN IF EXISTS trans2_uom_name,
        DROP COLUMN IF EXISTS trans2_qty,
        DROP COLUMN IF EXISTS trans_uom_name,
        DROP COLUMN IF EXISTS trans_qty,
        DROP COLUMN IF EXISTS inventory_lot_no,
        DROP COLUMN IF EXISTS warehouse_name,
        DROP COLUMN IF EXISTS warehouse_code,
        DROP COLUMN IF EXISTS item_barcode,
        DROP COLUMN IF EXISTS product_spec_no,
        DROP COLUMN IF EXISTS product_name,
        DROP COLUMN IF EXISTS external_line_code,
        DROP COLUMN IF EXISTS external_line_id
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS wms_outbound
        DROP COLUMN IF EXISTS synced_at,
        DROP COLUMN IF EXISTS sync_status,
        DROP COLUMN IF EXISTS external_payload_hash,
        DROP COLUMN IF EXISTS comments,
        DROP COLUMN IF EXISTS carrier_name,
        DROP COLUMN IF EXISTS carrier_code,
        DROP COLUMN IF EXISTS truck_no,
        DROP COLUMN IF EXISTS driver_name,
        DROP COLUMN IF EXISTS tracking_no,
        DROP COLUMN IF EXISTS pickup_phone,
        DROP COLUMN IF EXISTS pickup_person,
        DROP COLUMN IF EXISTS ship_method,
        DROP COLUMN IF EXISTS contact_phone,
        DROP COLUMN IF EXISTS contact_name,
        DROP COLUMN IF EXISTS delivery_address,
        DROP COLUMN IF EXISTS expected_delivery_date,
        DROP COLUMN IF EXISTS red_blue_flag,
        DROP COLUMN IF EXISTS currency_name,
        DROP COLUMN IF EXISTS currency_id,
        DROP COLUMN IF EXISTS project_name,
        DROP COLUMN IF EXISTS warehouse_name,
        DROP COLUMN IF EXISTS biz_employee_name,
        DROP COLUMN IF EXISTS biz_employee_code,
        DROP COLUMN IF EXISTS department_name,
        DROP COLUMN IF EXISTS bill_to_customer_name,
        DROP COLUMN IF EXISTS bill_to_customer_code,
        DROP COLUMN IF EXISTS sold_to_customer_name,
        DROP COLUMN IF EXISTS sold_to_customer_code,
        DROP COLUMN IF EXISTS source_order_no,
        DROP COLUMN IF EXISTS source_order_id,
        DROP COLUMN IF EXISTS external_source,
        DROP COLUMN IF EXISTS external_status,
        DROP COLUMN IF EXISTS external_document_no,
        DROP COLUMN IF EXISTS external_document_id,
        DROP COLUMN IF EXISTS external_book_id,
        DROP COLUMN IF EXISTS source_system
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS wms_inbound
        DROP COLUMN IF EXISTS synced_at,
        DROP COLUMN IF EXISTS sync_status,
        DROP COLUMN IF EXISTS external_payload_hash,
        DROP COLUMN IF EXISTS comments,
        DROP COLUMN IF EXISTS invoice_amount,
        DROP COLUMN IF EXISTS invoice_no,
        DROP COLUMN IF EXISTS expense_note_type,
        DROP COLUMN IF EXISTS red_blue_flag,
        DROP COLUMN IF EXISTS currency_name,
        DROP COLUMN IF EXISTS currency_id,
        DROP COLUMN IF EXISTS biz_employee_name,
        DROP COLUMN IF EXISTS biz_employee_code,
        DROP COLUMN IF EXISTS department_name,
        DROP COLUMN IF EXISTS department_code,
        DROP COLUMN IF EXISTS warehouse_name,
        DROP COLUMN IF EXISTS counterparty_name,
        DROP COLUMN IF EXISTS counterparty_code,
        DROP COLUMN IF EXISTS source_order_no,
        DROP COLUMN IF EXISTS source_order_id,
        DROP COLUMN IF EXISTS external_source,
        DROP COLUMN IF EXISTS external_status,
        DROP COLUMN IF EXISTS external_document_no,
        DROP COLUMN IF EXISTS external_document_id,
        DROP COLUMN IF EXISTS external_book_id,
        DROP COLUMN IF EXISTS source_system
    `);
  }
}
