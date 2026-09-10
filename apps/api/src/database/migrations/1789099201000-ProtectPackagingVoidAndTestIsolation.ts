import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive schema only. Historical rows retain their existing business values. */
export class ProtectPackagingVoidAndTestIsolation1789099201000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    for (const table of ['pkg_work_shifts', 'pkg_source_batches', 'pkg_grading_records', 'pkg_packing_records']) {
      await q.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false`);
    }
    await q.query(`ALTER TABLE pkg_packing_records
      ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'ACTIVE',
      ADD COLUMN IF NOT EXISTS void_reason text,
      ADD COLUMN IF NOT EXISTS voided_at timestamptz,
      ADD COLUMN IF NOT EXISTS voided_by integer,
      ADD COLUMN IF NOT EXISTS idempotency_key varchar(160),
      ADD COLUMN IF NOT EXISTS payload_hash varchar(64)`);
    await q.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_packing_record_status' AND conrelid='pkg_packing_records'::regclass) THEN
        ALTER TABLE pkg_packing_records ADD CONSTRAINT ck_packing_record_status CHECK (status IN ('ACTIVE','VOID'));
      END IF;
    END $$`);
    // Old rows have no key and do not participate in deduplication.
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_packing_idempotency
      ON pkg_packing_records(idempotency_key) WHERE idempotency_key IS NOT NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    // Never silently remove protection from a populated test/VOID chain.
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pkg_work_shifts WHERE is_test)
        OR EXISTS (SELECT 1 FROM pkg_source_batches WHERE is_test)
        OR EXISTS (SELECT 1 FROM pkg_grading_records WHERE is_test)
        OR EXISTS (SELECT 1 FROM pkg_packing_records WHERE is_test OR status='VOID') THEN
        RAISE EXCEPTION 'Packaging protection rollback blocked by retained test/VOID records';
      END IF;
    END $$`);
    await q.query(`DROP INDEX IF EXISTS uq_packing_idempotency`);
    await q.query(`ALTER TABLE pkg_packing_records DROP CONSTRAINT IF EXISTS ck_packing_record_status,
      DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS void_reason,
      DROP COLUMN IF EXISTS voided_at, DROP COLUMN IF EXISTS voided_by,
      DROP COLUMN IF EXISTS idempotency_key, DROP COLUMN IF EXISTS payload_hash`);
    for (const table of ['pkg_work_shifts', 'pkg_source_batches', 'pkg_grading_records', 'pkg_packing_records']) {
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS is_test`);
    }
  }
}
