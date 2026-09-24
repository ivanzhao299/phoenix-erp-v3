import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvergePhase1CanonicalSchema1789600000000 implements MigrationInterface {
  name = 'ConvergePhase1CanonicalSchema1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('acc_ledger')) {
      await queryRunner.query(`ALTER TABLE acc_ledger ALTER COLUMN ref_no TYPE VARCHAR(128)`);
      await queryRunner.query(`ALTER TABLE acc_ledger ALTER COLUMN ledger_type TYPE VARCHAR(64)`);
    }
    if (await queryRunner.hasTable('wms_stocktake')) {
      await queryRunner.query(`ALTER TABLE wms_stocktake ALTER COLUMN status TYPE VARCHAR(32)`);
    }
    if (await queryRunner.hasTable('pda_sync_log') && await queryRunner.hasColumn('pda_sync_log', 'payload')) {
      const [{ data_type: dataType } = {}] = await queryRunner.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pda_sync_log' AND column_name = 'payload'
      `);
      if (dataType !== 'jsonb') {
        // Invalid non-empty JSON deliberately fails the migration; no coercion or data loss is allowed.
        await queryRunner.query(`
          ALTER TABLE pda_sync_log
          ALTER COLUMN payload TYPE JSONB
          USING CASE
            WHEN payload IS NULL OR btrim(payload) = '' THEN NULL
            ELSE payload::jsonb
          END
        `);
      }
    }

    for (const [table, constraint] of [
      ['mon_device_realtime_snapshot', 'mon_device_realtime_snapshot_property_code_fkey'],
      ['mon_device_property_history', 'mon_device_property_history_property_code_fkey'],
      ['mon_device_alert_event', 'mon_device_alert_event_property_code_fkey'],
    ]) {
      if (await queryRunner.hasTable(table)) {
        await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('pda_sync_log') && await queryRunner.hasColumn('pda_sync_log', 'payload')) {
      const [{ data_type: dataType } = {}] = await queryRunner.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pda_sync_log' AND column_name = 'payload'
      `);
      if (dataType === 'jsonb') await queryRunner.query(`ALTER TABLE pda_sync_log ALTER COLUMN payload TYPE TEXT USING payload::text`);
    }
    if (await queryRunner.hasTable('wms_stocktake')) {
      await queryRunner.query(`ALTER TABLE wms_stocktake ALTER COLUMN status TYPE VARCHAR(20)`);
    }
    if (await queryRunner.hasTable('acc_ledger')) {
      await queryRunner.query(`ALTER TABLE acc_ledger ALTER COLUMN ledger_type TYPE VARCHAR(32)`);
      await queryRunner.query(`ALTER TABLE acc_ledger ALTER COLUMN ref_no TYPE VARCHAR(64)`);
    }
  }
}
