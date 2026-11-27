/** @allow-data-dml: Trigger event declarations only. The migration preserves existing grants and opening state. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EggSourceStandardGrants1795658800000 implements MigrationInterface {
  name = 'EggSourceStandardGrants1795658800000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      LOCK TABLE md_egg_source_write_control IN SHARE ROW EXCLUSIVE MODE;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM md_egg_source_write_control WHERE id=1 AND NOT writes_enabled)
        THEN RAISE EXCEPTION 'EGG_SOURCE_STANDARD_MIGRATION_REQUIRES_PAUSE'; END IF;
      END $$;
      CREATE TABLE md_egg_source_standard_grants (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        role_id bigint REFERENCES sys_role(role_id) ON DELETE CASCADE UNIQUE,
        set_id bigint REFERENCES sys_permission_set(set_id) ON DELETE CASCADE UNIQUE,
        actions text[] NOT NULL CHECK (
          actions <@ ARRAY['V','C','E','A']::text[] AND array_position(actions,NULL) IS NULL
        ),
        revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
        CHECK ((role_id IS NOT NULL) <> (set_id IS NOT NULL))
      );

      CREATE VIEW md_egg_source_effective_grants AS
        SELECT g.role_id,g.set_id,g.scope_type,g.scope_code,g.company_code,g.actions
        FROM md_egg_source_organization_grants g
        WHERE NOT EXISTS (SELECT 1 FROM md_egg_source_standard_grants s
          WHERE s.role_id=g.role_id OR s.set_id=g.set_id)
        UNION ALL
        SELECT s.role_id,s.set_id,COALESCE(bound.scope_type,'OWNER'),bound.scope_code,
          bound.company_code,array_agg(DISTINCT action ORDER BY action)
        FROM md_egg_source_standard_grants s
        CROSS JOIN LATERAL unnest(s.actions) action
        LEFT JOIN LATERAL (
          SELECT g.scope_type,g.scope_code,g.company_code
          FROM md_egg_source_organization_grants g
          WHERE (g.role_id=s.role_id OR g.set_id=s.set_id)
            AND (action=ANY(g.actions) OR NOT EXISTS (
              SELECT 1 FROM md_egg_source_organization_grants known
              WHERE (known.role_id=s.role_id OR known.set_id=s.set_id) AND action=ANY(known.actions)
            ))
        ) bound ON true
        GROUP BY s.id,s.role_id,s.set_id,bound.scope_type,bound.scope_code,bound.company_code;

      CREATE FUNCTION guard_egg_source_standard_grants() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='DELETE' AND pg_trigger_depth()>1 THEN RETURN OLD; END IF;
        IF TG_OP='DELETE' OR current_setting('phoenix.egg_source_standard_editor',true) IS DISTINCT FROM '1'
          OR (TG_OP='UPDATE' AND (NEW.role_id,NEW.set_id) IS DISTINCT FROM (OLD.role_id,OLD.set_id))
        THEN RAISE EXCEPTION 'EGG_SOURCE_STANDARD_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_source_standard_grants_managed BEFORE INSERT OR UPDATE OR DELETE
        ON md_egg_source_standard_grants FOR EACH ROW EXECUTE FUNCTION guard_egg_source_standard_grants();

      CREATE FUNCTION protect_converted_egg_source_scope() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE subject_role bigint; subject_set bigint;
      BEGIN
        IF TG_OP='DELETE' AND pg_trigger_depth()>1 THEN RETURN OLD; END IF;
        IF TG_OP<>'INSERT' THEN
          subject_role := OLD.role_id;
          subject_set := OLD.set_id;
          IF EXISTS (SELECT 1 FROM md_egg_source_standard_grants s
            WHERE s.role_id=subject_role OR s.set_id=subject_set)
          THEN RAISE EXCEPTION 'EGG_SOURCE_SCOPE_CONVERTED' USING ERRCODE='42501'; END IF;
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        IF EXISTS (SELECT 1 FROM md_egg_source_standard_grants s
          WHERE s.role_id=NEW.role_id OR s.set_id=NEW.set_id)
        THEN RAISE EXCEPTION 'EGG_SOURCE_SCOPE_CONVERTED' USING ERRCODE='42501'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_source_converted_scope_immutable BEFORE INSERT OR UPDATE OR DELETE
        ON md_egg_source_organization_grants FOR EACH ROW EXECUTE FUNCTION protect_converted_egg_source_scope();

      CREATE FUNCTION require_egg_source_standard_protocol() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE contract smallint;
      BEGIN
        IF TG_TABLE_NAME='md_egg_source_changes' THEN
          contract := NEW.contract_version;
        ELSE
          SELECT contract_version INTO STRICT contract FROM md_egg_source_changes WHERE id=NEW.change_id;
        END IF;
        IF contract=2 AND current_setting('phoenix.egg_source_iam_protocol',true) IS DISTINCT FROM '1'
          AND EXISTS (SELECT 1 FROM md_egg_source_standard_grants)
        THEN RAISE EXCEPTION 'EGG_SOURCE_STANDARD_PROTOCOL_REQUIRED' USING ERRCODE='42501'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_source_change_standard_protocol BEFORE INSERT OR UPDATE
        ON md_egg_source_changes FOR EACH ROW EXECUTE FUNCTION require_egg_source_standard_protocol();
      CREATE TRIGGER egg_source_event_standard_protocol BEFORE INSERT
        ON md_egg_source_change_events FOR EACH ROW EXECUTE FUNCTION require_egg_source_standard_protocol();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      LOCK TABLE md_egg_source_standard_grants IN ACCESS EXCLUSIVE MODE;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM md_egg_source_standard_grants)
          OR EXISTS (SELECT 1 FROM sys_audit_log WHERE action='EGG_SOURCE_STANDARD_GRANT')
        THEN RAISE EXCEPTION 'EGG_SOURCE_STANDARD_GRANTS_USED_KEEP_COMPATIBLE_READER'; END IF;
      END $$;
      DROP TRIGGER egg_source_event_standard_protocol ON md_egg_source_change_events;
      DROP TRIGGER egg_source_change_standard_protocol ON md_egg_source_changes;
      DROP FUNCTION require_egg_source_standard_protocol();
      DROP TRIGGER egg_source_converted_scope_immutable ON md_egg_source_organization_grants;
      DROP FUNCTION protect_converted_egg_source_scope();
      DROP TRIGGER egg_source_standard_grants_managed ON md_egg_source_standard_grants;
      DROP FUNCTION guard_egg_source_standard_grants();
      DROP VIEW md_egg_source_effective_grants;
      DROP TABLE md_egg_source_standard_grants;
    `);
  }
}
