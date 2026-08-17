import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEggInventoryLedgerDimensions1786946700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS log_date DATE`);
    await queryRunner.query(`ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(64)`);
    await queryRunner.query(`ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS location_code VARCHAR(64)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_inv_ledger_log_date ON inv_ledger(log_date)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_inv_ledger_log_date`);
    await queryRunner.query(`ALTER TABLE inv_ledger DROP COLUMN IF EXISTS location_code`);
    await queryRunner.query(`ALTER TABLE inv_ledger DROP COLUMN IF EXISTS warehouse_code`);
    await queryRunner.query(`ALTER TABLE inv_ledger DROP COLUMN IF EXISTS log_date`);
  }
}
