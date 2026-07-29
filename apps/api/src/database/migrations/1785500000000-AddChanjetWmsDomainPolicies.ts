import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChanjetWmsDomainPolicies1785500000000 implements MigrationInterface {
  name = 'AddChanjetWmsDomainPolicies1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chanjet_wms_house_location_policies (
        id BIGSERIAL PRIMARY KEY,
        book_id VARCHAR(64) NOT NULL,
        company_code VARCHAR(64) NOT NULL,
        source_warehouse_code VARCHAR(128) NOT NULL,
        source_warehouse_name VARCHAR(256) NOT NULL DEFAULT '',
        erp_house_code VARCHAR(64) NOT NULL,
        erp_warehouse_code VARCHAR(64) NOT NULL,
        erp_location_code VARCHAR(64) NOT NULL,
        state VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
        evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
        reviewed_by VARCHAR(128) NOT NULL DEFAULT '',
        reviewed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_chanjet_wms_house_location_source
          UNIQUE (book_id, source_warehouse_code),
        CONSTRAINT ck_chanjet_wms_house_location_state
          CHECK (state IN ('DRAFT', 'APPROVED', 'REJECTED', 'HOLD'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chanjet_wms_house_location_state
      ON chanjet_wms_house_location_policies (state, updated_at)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chanjet_wms_uom_conversion_policies (
        id BIGSERIAL PRIMARY KEY,
        book_id VARCHAR(64) NOT NULL,
        company_code VARCHAR(64) NOT NULL DEFAULT '',
        source_product_code VARCHAR(128) NOT NULL,
        source_product_name VARCHAR(256) NOT NULL DEFAULT '',
        source_uom VARCHAR(64) NOT NULL,
        erp_entity_type VARCHAR(32) NOT NULL,
        erp_product_code VARCHAR(128) NOT NULL,
        erp_base_uom VARCHAR(64) NOT NULL,
        conversion_ratio NUMERIC(20, 8) NOT NULL,
        state VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
        evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
        reviewed_by VARCHAR(128) NOT NULL DEFAULT '',
        reviewed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_chanjet_wms_uom_conversion_source
          UNIQUE (book_id, source_product_code, source_uom),
        CONSTRAINT ck_chanjet_wms_uom_conversion_state
          CHECK (state IN ('DRAFT', 'APPROVED', 'REJECTED', 'HOLD')),
        CONSTRAINT ck_chanjet_wms_uom_conversion_entity
          CHECK (erp_entity_type IN ('PRODUCT', 'SKU', 'MATERIAL')),
        CONSTRAINT ck_chanjet_wms_uom_conversion_ratio
          CHECK (conversion_ratio > 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chanjet_wms_uom_conversion_state
      ON chanjet_wms_uom_conversion_policies (state, updated_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS chanjet_wms_uom_conversion_policies');
    await queryRunner.query('DROP TABLE IF EXISTS chanjet_wms_house_location_policies');
  }
}
