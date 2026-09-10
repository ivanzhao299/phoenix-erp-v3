import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive schema only. Historical rows retain their existing business values. */
export class ProtectPackagingVoidAndTestIsolation1789099201000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // These canonical base tables historically came from application bootstrap.
    // Fresh migration-only databases need them before ALTER; production is a no-op.
    await q.query(`CREATE TABLE IF NOT EXISTS pkg_work_shifts (
      id serial PRIMARY KEY, shift_code varchar(50) NOT NULL UNIQUE,
      production_date date NOT NULL, site_id varchar(50) DEFAULT 'site-01',
      line_id varchar(50) DEFAULT 'line-01', operator_id integer,
      operator_name varchar(100), supervisor_name varchar(100),
      status varchar(20) DEFAULT 'OPEN', hygiene_check boolean DEFAULT true,
      device_check boolean DEFAULT true, variance_reason text,
      opened_at timestamp DEFAULT now(), closed_at timestamp,
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), shift_type varchar(20)
    )`);
    await q.query(`CREATE TABLE IF NOT EXISTS pkg_packing_records (
      id serial PRIMARY KEY, code varchar(80) NOT NULL UNIQUE, grading_code varchar(80),
      production_date date, batches_json jsonb DEFAULT '[]'::jsonb,
      total_boxes integer DEFAULT 0, total_eggs integer DEFAULT 0,
      created_at timestamp DEFAULT now()
    )`);
    await q.query(`ALTER TABLE pkg_work_shifts ADD COLUMN IF NOT EXISTS shift_type varchar(20)`);
    await q.query(`ALTER TABLE pkg_packing_records ADD COLUMN IF NOT EXISTS shift_id integer,
      ADD COLUMN IF NOT EXISTS grading_codes_json jsonb NOT NULL DEFAULT '[]'::jsonb`);

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
    // Retain pre-existing base tables/columns, matching the earlier grading migration.
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
