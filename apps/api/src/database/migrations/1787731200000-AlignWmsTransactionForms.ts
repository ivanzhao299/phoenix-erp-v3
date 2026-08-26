import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignWmsTransactionForms1787731200000 implements MigrationInterface {
  name = 'AlignWmsTransactionForms1787731200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 空库 CI 的冻结 baseline 不创建 wms_transfer；生产已有该表。这里先补最小骨架，
    // 随后的 IF NOT EXISTS 列扩展对两种环境保持同一末态。
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wms_transfer (
        id bigserial PRIMARY KEY,
        transfer_no varchar(64) UNIQUE,
        from_warehouse varchar(64),
        to_warehouse varchar(64),
        from_zone varchar(64),
        to_zone varchar(64),
        product_code varchar(64),
        qty numeric(18,3),
        status varchar(32) DEFAULT 'PENDING',
        operator_id integer,
        reason text,
        store_code text DEFAULT 'ALL',
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await queryRunner.query(`
      ALTER TABLE wms_stocktake
        ADD COLUMN IF NOT EXISTS zone_code varchar(64),
        ADD COLUMN IF NOT EXISTS location_code varchar(64),
        ADD COLUMN IF NOT EXISTS batch_no varchar(64),
        ADD COLUMN IF NOT EXISTS item_name varchar(256),
        ADD COLUMN IF NOT EXISTS spec_code varchar(64),
        ADD COLUMN IF NOT EXISTS grade_code varchar(64),
        ADD COLUMN IF NOT EXISTS attachment_url text,
        ADD COLUMN IF NOT EXISTS reason text,
        ADD COLUMN IF NOT EXISTS operator varchar(128),
        ADD COLUMN IF NOT EXISTS book_qty numeric(18,3),
        ADD COLUMN IF NOT EXISTS actual_qty numeric(18,3)
    `);
    await queryRunner.query(`
      ALTER TABLE wms_transfer
        ADD COLUMN IF NOT EXISTS from_location varchar(64),
        ADD COLUMN IF NOT EXISTS to_location varchar(64),
        ADD COLUMN IF NOT EXISTS batch_no varchar(64),
        ADD COLUMN IF NOT EXISTS attachment_url text,
        ADD COLUMN IF NOT EXISTS operator varchar(128)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wms_transfer
        DROP COLUMN IF EXISTS operator,
        DROP COLUMN IF EXISTS attachment_url,
        DROP COLUMN IF EXISTS batch_no,
        DROP COLUMN IF EXISTS to_location,
        DROP COLUMN IF EXISTS from_location
    `);
    await queryRunner.query(`
      ALTER TABLE wms_stocktake
        DROP COLUMN IF EXISTS actual_qty,
        DROP COLUMN IF EXISTS book_qty,
        DROP COLUMN IF EXISTS operator,
        DROP COLUMN IF EXISTS reason,
        DROP COLUMN IF EXISTS attachment_url,
        DROP COLUMN IF EXISTS grade_code,
        DROP COLUMN IF EXISTS spec_code,
        DROP COLUMN IF EXISTS item_name,
        DROP COLUMN IF EXISTS batch_no,
        DROP COLUMN IF EXISTS location_code,
        DROP COLUMN IF EXISTS zone_code
    `);
  }
}
