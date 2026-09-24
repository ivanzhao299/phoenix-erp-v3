import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvergeInboundTimestamps1789600300000 implements MigrationInterface {
  name = 'ConvergeInboundTimestamps1789600300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('wms_inbound'))) return;
    for (const column of ['created_at', 'updated_at']) {
      if (!(await queryRunner.hasColumn('wms_inbound', column))) continue;
      const [{ data_type: dataType } = {}] = await queryRunner.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'wms_inbound' AND column_name = '${column}'
      `);
      if (dataType === 'timestamp without time zone') {
        await queryRunner.query(`ALTER TABLE wms_inbound ALTER COLUMN ${column} TYPE TIMESTAMPTZ USING ${column} AT TIME ZONE 'UTC'`);
      }
      await queryRunner.query(`ALTER TABLE wms_inbound ALTER COLUMN ${column} SET DEFAULT now()`);
      await queryRunner.query(`ALTER TABLE wms_inbound ALTER COLUMN ${column} SET NOT NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('wms_inbound'))) return;
    for (const column of ['created_at', 'updated_at']) {
      if (!(await queryRunner.hasColumn('wms_inbound', column))) continue;
      await queryRunner.query(`ALTER TABLE wms_inbound ALTER COLUMN ${column} DROP NOT NULL`);
      await queryRunner.query(`ALTER TABLE wms_inbound ALTER COLUMN ${column} TYPE TIMESTAMP USING ${column} AT TIME ZONE 'UTC'`);
      await queryRunner.query(`ALTER TABLE wms_inbound ALTER COLUMN ${column} SET DEFAULT CURRENT_TIMESTAMP`);
    }
  }
}
