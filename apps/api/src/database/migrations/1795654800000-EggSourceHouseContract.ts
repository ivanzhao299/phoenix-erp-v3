import { MigrationInterface, QueryRunner } from 'typeorm';

export class EggSourceHouseContract1795654800000 implements MigrationInterface {
  name = 'EggSourceHouseContract1795654800000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE md_egg_source_changes ADD COLUMN contract_version smallint NOT NULL DEFAULT 1
        CHECK (contract_version IN (1,2));
      ALTER TABLE md_egg_source_write_control
        ADD COLUMN house_writes_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN house_writes_ever_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN house_changed_at timestamptz,
        ADD COLUMN house_changed_by text,
        ADD COLUMN house_change_reason text;

      CREATE TABLE md_egg_source_house_rollouts (
        company_code text NOT NULL,
        house_code text NOT NULL,
        enabled boolean NOT NULL,
        changed_by bigint NOT NULL,
        change_reason text NOT NULL,
        changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(company_code,house_code)
      );

      CREATE TABLE md_egg_source_organization_grants (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        role_id bigint REFERENCES sys_role(role_id) ON DELETE CASCADE,
        set_id bigint REFERENCES sys_permission_set(set_id) ON DELETE CASCADE,
        scope_type text NOT NULL CHECK (scope_type IN ('COMPANY','FARM','SITE','HOUSE')),
        company_code text NOT NULL CHECK (company_code <> '' AND company_code=btrim(company_code)),
        scope_code text NOT NULL CHECK (scope_code <> '' AND scope_code=btrim(scope_code)),
        actions text[] NOT NULL CHECK (cardinality(actions)>0 AND
          actions <@ ARRAY['V','C','E','A']::text[] AND array_position(actions,NULL) IS NULL),
        CHECK ((role_id IS NOT NULL) <> (set_id IS NOT NULL))
      );
      CREATE UNIQUE INDEX uq_egg_source_org_role_grant ON md_egg_source_organization_grants(role_id,scope_type,scope_code)
        WHERE role_id IS NOT NULL;
      CREATE UNIQUE INDEX uq_egg_source_org_set_grant ON md_egg_source_organization_grants(set_id,scope_type,scope_code)
        WHERE set_id IS NOT NULL;

      CREATE FUNCTION guard_egg_source_organization_grants() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('phoenix.egg_source_organization_editor',true) IS DISTINCT FROM '1'
          AND NOT (TG_OP='DELETE' AND pg_trigger_depth()>1)
        THEN RAISE EXCEPTION 'EGG_SOURCE_ORGANIZATION_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_source_organization_grants_managed
        BEFORE INSERT OR UPDATE OR DELETE ON md_egg_source_organization_grants
        FOR EACH ROW EXECUTE FUNCTION guard_egg_source_organization_grants();

      CREATE FUNCTION guard_egg_source_house_rollout() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('phoenix.egg_source_rollout_editor',true) IS DISTINCT FROM '1'
          OR TG_OP='DELETE' OR (TG_OP='UPDATE' AND
            (NEW.company_code,NEW.house_code) IS DISTINCT FROM (OLD.company_code,OLD.house_code))
        THEN RAISE EXCEPTION 'EGG_SOURCE_HOUSE_ROLLOUT_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_source_house_rollout_managed
        BEFORE INSERT OR UPDATE OR DELETE ON md_egg_source_house_rollouts
        FOR EACH ROW EXECUTE FUNCTION guard_egg_source_house_rollout();

      CREATE FUNCTION require_egg_source_house_protocol() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE contract smallint;
      BEGIN
        IF TG_TABLE_NAME='md_egg_source_changes' THEN
          contract := NEW.contract_version;
          IF TG_OP='UPDATE' AND (OLD.contract_version<>contract OR contract=2 AND
            (NEW.company_code,NEW.farm_code,NEW.site_code,NEW.house_code) IS DISTINCT FROM
            (OLD.company_code,OLD.farm_code,OLD.site_code,OLD.house_code))
          THEN RAISE EXCEPTION 'EGG_SOURCE_CONTRACT_IMMUTABLE' USING ERRCODE='42501'; END IF;
          IF TG_OP='INSERT' AND EXISTS (SELECT 1 FROM md_egg_source_house_rollouts
            WHERE company_code=NEW.company_code AND house_code=NEW.house_code FOR SHARE) AND contract=1
          THEN RAISE EXCEPTION 'EGG_SOURCE_HOUSE_CONTRACT_REQUIRED' USING ERRCODE='42501'; END IF;
          IF TG_OP='INSERT' AND contract=2 AND NOT EXISTS (SELECT 1 FROM md_egg_source_house_rollouts
            WHERE company_code=NEW.company_code AND house_code=NEW.house_code AND enabled FOR SHARE)
          THEN RAISE EXCEPTION 'EGG_SOURCE_HOUSE_ROLLOUT_CLOSED' USING ERRCODE='42501'; END IF;
          IF contract=2 AND NEW.payload ? 'warehouseCode'
          THEN RAISE EXCEPTION 'EGG_SOURCE_HOUSE_PAYLOAD_HAS_WAREHOUSE' USING ERRCODE='23514'; END IF;
        ELSE
          SELECT contract_version INTO STRICT contract FROM md_egg_source_changes WHERE id=NEW.change_id;
        END IF;
        IF contract=2 AND (
          current_setting('phoenix.egg_source_contract',true) IS DISTINCT FROM '2'
          OR NOT EXISTS (SELECT 1 FROM md_egg_source_write_control
            WHERE id=1 AND writes_enabled AND house_writes_enabled FOR SHARE)
        ) THEN RAISE EXCEPTION 'EGG_SOURCE_HOUSE_WRITES_CLOSED_OR_PROTOCOL_REQUIRED' USING ERRCODE='42501'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_source_require_house_protocol BEFORE INSERT OR UPDATE ON md_egg_source_changes
        FOR EACH ROW EXECUTE FUNCTION require_egg_source_house_protocol();
      CREATE TRIGGER egg_source_event_require_house_protocol BEFORE INSERT ON md_egg_source_change_events
        FOR EACH ROW EXECUTE FUNCTION require_egg_source_house_protocol();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      LOCK TABLE md_egg_source_write_control, md_egg_source_changes,
        md_egg_source_change_events, md_egg_source_organization_grants, md_egg_source_house_rollouts IN SHARE ROW EXCLUSIVE MODE;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM md_egg_source_write_control WHERE house_writes_ever_enabled OR house_writes_enabled)
          OR EXISTS (SELECT 1 FROM md_egg_source_changes WHERE contract_version=2)
          OR EXISTS (SELECT 1 FROM md_egg_source_organization_grants)
          OR EXISTS (SELECT 1 FROM md_egg_source_house_rollouts)
        THEN RAISE EXCEPTION 'EGG_SOURCE_HOUSE_CONTRACT_USED_KEEP_COMPATIBLE_READER'; END IF;
      END $$;
      DROP TRIGGER egg_source_event_require_house_protocol ON md_egg_source_change_events;
      DROP TRIGGER egg_source_require_house_protocol ON md_egg_source_changes;
      DROP FUNCTION require_egg_source_house_protocol();
      DROP TRIGGER egg_source_organization_grants_managed ON md_egg_source_organization_grants;
      DROP FUNCTION guard_egg_source_organization_grants();
      DROP TABLE md_egg_source_organization_grants;
      DROP TABLE md_egg_source_house_rollouts;
      DROP FUNCTION guard_egg_source_house_rollout();
      ALTER TABLE md_egg_source_changes DROP COLUMN contract_version;
      ALTER TABLE md_egg_source_write_control DROP COLUMN house_writes_enabled,
        DROP COLUMN house_writes_ever_enabled, DROP COLUMN house_changed_at,
        DROP COLUMN house_changed_by, DROP COLUMN house_change_reason;
    `);
  }
}
