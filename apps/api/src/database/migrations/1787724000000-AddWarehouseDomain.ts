import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehouseDomain1787724000000 implements MigrationInterface {
  name = 'AddWarehouseDomain1787724000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wms_warehouses
      ADD COLUMN IF NOT EXISTS domain VARCHAR(32) NOT NULL DEFAULT 'OPERATIONAL'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wms_warehouses
      DROP COLUMN IF EXISTS domain
    `);
  }
}
