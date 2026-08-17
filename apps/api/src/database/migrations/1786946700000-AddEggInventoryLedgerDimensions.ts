import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEggInventoryLedgerDimensions1786946700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(`ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS log_date DATE`);
      await queryRunner.query(`ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(64)`);
      await queryRunner.query(`ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS location_code VARCHAR(64)`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_inv_ledger_log_date ON inv_ledger(log_date)`);
      await queryRunner.query(`
        UPDATE inv_ledger l
           SET log_date = b.egg_date,
               warehouse_code = COALESCE(l.warehouse_code, b.warehouse_code),
               location_code = COALESCE(l.location_code, b.location_code)
          FROM inv_batches b
         WHERE b.batch_no = l.batch_no
           AND (l.log_date IS NULL OR l.warehouse_code IS NULL OR l.location_code IS NULL)
      `);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_inv_ledger_log_date`);
    await queryRunner.query(`ALTER TABLE inv_ledger DROP COLUMN IF EXISTS location_code`);
    await queryRunner.query(`ALTER TABLE inv_ledger DROP COLUMN IF EXISTS warehouse_code`);
    await queryRunner.query(`ALTER TABLE inv_ledger DROP COLUMN IF EXISTS log_date`);
  }
}
