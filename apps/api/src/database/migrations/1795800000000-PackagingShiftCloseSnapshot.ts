/** @allow-data-dml: UPDATE OR DELETE defines a DDL trigger only. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PackagingShiftCloseSnapshot1795800000000 implements MigrationInterface {
  name = 'PackagingShiftCloseSnapshot1795800000000';

  async up(runner: QueryRunner): Promise<void> {
    // Older installations already have the audit table. The migration-only chain
    // must also provide it before attaching the snapshot trigger and reference.
    await runner.query(`
      CREATE TABLE IF NOT EXISTS pkg_audit_logs (
        id serial PRIMARY KEY,
        entity_type varchar(50), entity_id varchar(100), action varchar(50),
        before_data text, after_data text, reason text, operator_id integer,
        terminal_id varchar(80), created_at timestamp DEFAULT now()
      );
      ALTER TABLE pkg_work_shifts ADD COLUMN close_snapshot_id bigint;
      ALTER TABLE pkg_exceptions ADD COLUMN shift_id bigint,
        ADD COLUMN related_kind text, ADD COLUMN related_id text;
      CREATE INDEX ix_pkg_exceptions_shift ON pkg_exceptions(shift_id) WHERE shift_id IS NOT NULL;
      CREATE FUNCTION guard_pkg_shift_close_snapshot() RETURNS trigger LANGUAGE plpgsql AS $guard$
      BEGIN
        IF OLD.action='CLOSE_SNAPSHOT' AND OLD.entity_type='WORK_SHIFT' THEN
          RAISE EXCEPTION 'PACKAGING_SHIFT_CLOSE_SNAPSHOT_IMMUTABLE' USING ERRCODE='23514';
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $guard$;
      CREATE TRIGGER trg_pkg_shift_close_snapshot BEFORE UPDATE OR DELETE ON pkg_audit_logs
        FOR EACH ROW EXECUTE FUNCTION guard_pkg_shift_close_snapshot();
      CREATE UNIQUE INDEX uq_pkg_work_shifts_close_snapshot ON pkg_work_shifts(close_snapshot_id)
        WHERE close_snapshot_id IS NOT NULL;
      ALTER TABLE pkg_work_shifts ADD CONSTRAINT fk_pkg_work_shifts_close_snapshot
        FOREIGN KEY(close_snapshot_id) REFERENCES pkg_audit_logs(id) ON DELETE RESTRICT;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    // Retain audit rows and their base table on a schema rollback.
    await runner.query(`
      DROP TRIGGER trg_pkg_shift_close_snapshot ON pkg_audit_logs;
      DROP FUNCTION guard_pkg_shift_close_snapshot();
      DROP INDEX ix_pkg_exceptions_shift;
      ALTER TABLE pkg_exceptions DROP COLUMN related_id, DROP COLUMN related_kind, DROP COLUMN shift_id;
      ALTER TABLE pkg_work_shifts DROP CONSTRAINT fk_pkg_work_shifts_close_snapshot;
      DROP INDEX uq_pkg_work_shifts_close_snapshot;
      ALTER TABLE pkg_work_shifts DROP COLUMN close_snapshot_id;
    `);
  }
}
