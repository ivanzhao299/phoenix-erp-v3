import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normalize legacy inventory ledger event times.
 *
 * inv_ledger was created with TIMESTAMP (without time zone), while the API and
 * operators treat CURRENT_TIMESTAMP values as UTC. Convert existing wall-clock
 * values as UTC and keep future writes as timestamptz so clients can render in
 * their own device time zones.
 */
export class ConvergeInventoryLedgerTimestamps1789990000000 implements MigrationInterface {
  name = 'ConvergeInventoryLedgerTimestamps1789990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('inv_ledger'))) return;
    if (!(await queryRunner.hasColumn('inv_ledger', 'created_at'))) return;

    const [{ data_type: dataType } = {}] = await queryRunner.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'inv_ledger'
        AND column_name = 'created_at'
    `);
    if (dataType === 'timestamp without time zone') {
      await queryRunner.query(
        `ALTER TABLE inv_ledger ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'`,
      );
    }
    await queryRunner.query(`ALTER TABLE inv_ledger ALTER COLUMN created_at SET DEFAULT now()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('inv_ledger'))) return;
    if (!(await queryRunner.hasColumn('inv_ledger', 'created_at'))) return;

    await queryRunner.query(
      `ALTER TABLE inv_ledger ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(`ALTER TABLE inv_ledger ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`);
  }
}
