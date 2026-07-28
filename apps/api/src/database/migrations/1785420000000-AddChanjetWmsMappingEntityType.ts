import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: backfill deterministic ERP target entity type for existing reviewed WMS mappings
 */
export class AddChanjetWmsMappingEntityType1785420000000 implements MigrationInterface {
  name = 'AddChanjetWmsMappingEntityType1785420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chanjet_master_mapping
      ADD COLUMN IF NOT EXISTS erp_entity_type VARCHAR(32) NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      UPDATE chanjet_master_mapping
      SET erp_entity_type = CASE mapping_type
        WHEN 'WAREHOUSE' THEN 'WAREHOUSE'
        WHEN 'PRODUCT' THEN 'PRODUCT'
        WHEN 'UOM' THEN 'UOM'
        ELSE erp_entity_type
      END
      WHERE erp_code <> ''
        AND mapping_type IN ('WAREHOUSE', 'PRODUCT', 'UOM')
        AND erp_entity_type = ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chanjet_master_mapping
      DROP COLUMN IF EXISTS erp_entity_type
    `);
  }
}
