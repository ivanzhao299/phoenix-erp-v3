import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Database-level deduplication for pending-ledger notifications.
 *
 * The daily-report FARM_IN skip path (product verdict A) persists one
 * FARM_LEDGER_PENDING notice per recipient. Without a unique constraint the
 * SELECT-then-INSERT race could duplicate notices under concurrency; the
 * service relies on this partial unique index for ON CONFLICT DO NOTHING.
 * The index is partial so pre-existing notification history is untouched.
 */
export class FarmLedgerPendingNotificationDedup1793000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sys_notifications'))) return;
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_notifications_farm_ledger_pending
        ON sys_notifications (user_id, biz_type, biz_no)
       WHERE biz_type = 'FARM_LEDGER_PENDING' AND biz_no IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS uq_sys_notifications_farm_ledger_pending');
  }
}
