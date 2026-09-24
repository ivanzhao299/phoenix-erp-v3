import { MigrationInterface, QueryRunner } from 'typeorm';

export class WidenAccLedgerStoreCode1789600100000 implements MigrationInterface {
  name = 'WidenAccLedgerStoreCode1789600100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('acc_ledger')) || !(await queryRunner.hasColumn('acc_ledger', 'store_code'))) return;
    const [{ character_maximum_length: length } = {}] = await queryRunner.query(`
      SELECT character_maximum_length FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'acc_ledger' AND column_name = 'store_code'
    `);
    if (length !== null && length !== undefined && Number(length) < 64) {
      await queryRunner.query(`ALTER TABLE acc_ledger ALTER COLUMN store_code TYPE VARCHAR(64)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('acc_ledger')) || !(await queryRunner.hasColumn('acc_ledger', 'store_code'))) return;
    const [{ max_length: maxLength } = {}] = await queryRunner.query(`SELECT max(length(store_code)) AS max_length FROM acc_ledger`);
    if (maxLength !== null && maxLength !== undefined && Number(maxLength) > 32) {
      throw new Error('Cannot safely narrow acc_ledger.store_code to VARCHAR(32)');
    }
    await queryRunner.query(`ALTER TABLE acc_ledger ALTER COLUMN store_code TYPE VARCHAR(32)`);
  }
}
