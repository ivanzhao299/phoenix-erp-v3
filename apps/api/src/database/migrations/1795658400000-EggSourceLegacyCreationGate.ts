/** @allow-data-dml: UPDATE and DELETE are trigger event declarations; this migration only changes schema. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EggSourceLegacyCreationGate1795658400000 implements MigrationInterface {
  name = 'EggSourceLegacyCreationGate1795658400000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      LOCK TABLE md_egg_source_changes, md_egg_source_write_control IN ACCESS EXCLUSIVE MODE;
      ALTER TABLE md_egg_source_write_control ADD COLUMN legacy_creates_enabled boolean NOT NULL DEFAULT true;

      CREATE FUNCTION guard_egg_source_legacy_creation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.contract_version=1 AND NOT EXISTS (
          SELECT 1 FROM md_egg_source_write_control WHERE id=1 AND legacy_creates_enabled FOR SHARE
        ) THEN
          RAISE EXCEPTION 'EGG_SOURCE_LEGACY_CREATION_RETIRED' USING ERRCODE='42501';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_source_legacy_creation_guard BEFORE INSERT ON md_egg_source_changes
        FOR EACH ROW EXECUTE FUNCTION guard_egg_source_legacy_creation();

      CREATE FUNCTION prevent_egg_source_legacy_reopening() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP IN ('DELETE','TRUNCATE') THEN
          RAISE EXCEPTION 'EGG_SOURCE_WRITE_CONTROL_REQUIRED' USING ERRCODE='42501';
        END IF;
        IF NOT OLD.legacy_creates_enabled AND NEW.legacy_creates_enabled THEN
          RAISE EXCEPTION 'EGG_SOURCE_LEGACY_CREATION_RETIRED' USING ERRCODE='42501';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_source_legacy_creation_permanent
        BEFORE UPDATE OF legacy_creates_enabled OR DELETE ON md_egg_source_write_control
        FOR EACH ROW EXECUTE FUNCTION prevent_egg_source_legacy_reopening();
      CREATE TRIGGER egg_source_write_control_no_truncate
        BEFORE TRUNCATE ON md_egg_source_write_control
        FOR EACH STATEMENT EXECUTE FUNCTION prevent_egg_source_legacy_reopening();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      LOCK TABLE md_egg_source_changes, md_egg_source_write_control IN ACCESS EXCLUSIVE MODE;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM md_egg_source_write_control WHERE NOT legacy_creates_enabled)
        THEN RAISE EXCEPTION 'EGG_SOURCE_LEGACY_CREATION_RETIRED_KEEP_COMPATIBLE_READER'; END IF;
      END $$;
      DROP TRIGGER egg_source_write_control_no_truncate ON md_egg_source_write_control;
      DROP TRIGGER egg_source_legacy_creation_permanent ON md_egg_source_write_control;
      DROP FUNCTION prevent_egg_source_legacy_reopening();
      DROP TRIGGER egg_source_legacy_creation_guard ON md_egg_source_changes;
      DROP FUNCTION guard_egg_source_legacy_creation();
      ALTER TABLE md_egg_source_write_control DROP COLUMN legacy_creates_enabled;
    `);
  }
}
