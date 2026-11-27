/** @allow-data-dml: Trigger event declarations only. The migration adds empty control records. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EggSourceCutoverEvidence1795658900000 implements MigrationInterface {
  name = 'EggSourceCutoverEvidence1795658900000';

  async up(runner:QueryRunner):Promise<void> {
    await runner.query(`
      CREATE TABLE md_egg_source_cutover_records (
        request_id uuid PRIMARY KEY,
        kind text NOT NULL CHECK (kind IN ('ARCHIVE','UNARCHIVE','LEGACY_GRANT','VERIFY','SIGN','RETIRE')),
        actor_id varchar(128) NOT NULL,
        parent_id uuid REFERENCES md_egg_source_cutover_records(request_id),
        input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[a-f0-9]{64}$'),
        receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt)='object'),
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        CHECK ((kind IN ('SIGN','RETIRE'))=(parent_id IS NOT NULL))
      );
      CREATE UNIQUE INDEX ix_egg_source_cutover_sign_once
        ON md_egg_source_cutover_records(parent_id,actor_id) WHERE kind='SIGN';
      CREATE UNIQUE INDEX ix_egg_source_cutover_retire_once
        ON md_egg_source_cutover_records(parent_id) WHERE kind='RETIRE';
      CREATE TABLE md_egg_source_archive_marks (
        change_id uuid NOT NULL REFERENCES md_egg_source_changes(id),
        batch_id uuid NOT NULL REFERENCES md_egg_source_cutover_records(request_id),
        archived boolean NOT NULL,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        PRIMARY KEY(change_id,batch_id),
        UNIQUE(seq)
      );
      CREATE INDEX ix_egg_source_archive_latest ON md_egg_source_archive_marks(change_id,seq DESC);
      CREATE FUNCTION guard_egg_source_cutover_record() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP <> 'INSERT' OR current_setting('phoenix.egg_source_cutover_writer',true) IS DISTINCT FROM '1'
        THEN RAISE EXCEPTION 'EGG_SOURCE_CUTOVER_RECORD_PROTECTED' USING ERRCODE='42501'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_source_cutover_record_protected BEFORE INSERT OR UPDATE OR DELETE ON md_egg_source_cutover_records
        FOR EACH ROW EXECUTE FUNCTION guard_egg_source_cutover_record();
      CREATE TRIGGER egg_source_archive_mark_protected BEFORE INSERT OR UPDATE OR DELETE ON md_egg_source_archive_marks
        FOR EACH ROW EXECUTE FUNCTION guard_egg_source_cutover_record();
      CREATE TRIGGER egg_source_cutover_record_no_truncate BEFORE TRUNCATE ON md_egg_source_cutover_records
        FOR EACH STATEMENT EXECUTE FUNCTION guard_egg_source_cutover_record();
      CREATE TRIGGER egg_source_archive_mark_no_truncate BEFORE TRUNCATE ON md_egg_source_archive_marks
        FOR EACH STATEMENT EXECUTE FUNCTION guard_egg_source_cutover_record();
    `);
  }

  async down(runner:QueryRunner):Promise<void> {
    await runner.query(`
      LOCK TABLE md_egg_source_cutover_records,md_egg_source_archive_marks IN ACCESS EXCLUSIVE MODE;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM md_egg_source_cutover_records)
        THEN RAISE EXCEPTION 'EGG_SOURCE_CUTOVER_EVIDENCE_IN_USE'; END IF;
      END $$;
      DROP TABLE md_egg_source_archive_marks,md_egg_source_cutover_records;
      DROP FUNCTION guard_egg_source_cutover_record();
    `);
  }
}
