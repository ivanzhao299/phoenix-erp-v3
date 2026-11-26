import { MigrationInterface, QueryRunner } from 'typeorm';

/** @allow-data-dml: 登记蛋品来源独立权限目录并初始化来源变更发布开关，无自动角色授权。 */
export class EggSourceIndependentPermissions1795651200000 implements MigrationInterface {
  name = 'EggSourceIndependentPermissions1795651200000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      LOCK TABLE sys_menu IN SHARE ROW EXCLUSIVE MODE;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='MENU_MASTER_DATA')
          OR EXISTS (SELECT 1 FROM sys_menu WHERE route='/master-data/egg-sources' AND menu_code<>'MENU_MD_EGG_SOURCE')
          OR EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='MENU_MD_EGG_SOURCE' AND
            (route,domain,parent_code,menu_name_zh) IS DISTINCT FROM
            ('/master-data/egg-sources','MASTER','MENU_MASTER_DATA','蛋品来源档案'))
        THEN RAISE EXCEPTION 'Egg source menu registration conflict'; END IF;
      END $$;
      CREATE TABLE md_egg_source_write_control (
        id smallint PRIMARY KEY CHECK (id=1),
        writes_enabled boolean NOT NULL DEFAULT false,
        changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        changed_by text,
        change_reason text,
        ever_enabled boolean NOT NULL DEFAULT false,
        menu_inserted boolean NOT NULL
      );
      WITH installed AS (
        INSERT INTO sys_menu (menu_code,menu_name_zh,menu_name_lo,domain,parent_code,sort_order,icon,route)
        VALUES ('MENU_MD_EGG_SOURCE','蛋品来源档案','ໂປຣໄຟລ໌ແຫຼ່ງໄຂ່','MASTER','MENU_MASTER_DATA',754,'Egg','/master-data/egg-sources')
        ON CONFLICT (menu_code) DO NOTHING RETURNING menu_id
      )
      INSERT INTO md_egg_source_write_control (id,menu_inserted) VALUES (1,EXISTS (SELECT 1 FROM installed));
      CREATE FUNCTION guard_egg_source_permission_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        old_row jsonb := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
        new_row jsonb := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
      BEGIN
        IF TG_TABLE_NAME='sys_menu' THEN
          IF 'MENU_MD_EGG_SOURCE' IN (old_row->>'menu_code',new_row->>'menu_code')
            OR '/master-data/egg-sources' IN (old_row->>'route',new_row->>'route')
          THEN RAISE EXCEPTION 'EGG_SOURCE_MENU_MANAGED' USING ERRCODE='42501'; END IF;
        ELSIF current_setting('phoenix.egg_source_role_editor',true) IS DISTINCT FROM '1'
          AND NOT (TG_OP='DELETE' AND pg_trigger_depth()>1)
          AND EXISTS (
            SELECT 1 FROM sys_menu WHERE menu_code='MENU_MD_EGG_SOURCE'
              AND menu_id IN ((old_row->>'menu_id')::bigint,(new_row->>'menu_id')::bigint)
          )
        THEN RAISE EXCEPTION 'EGG_SOURCE_ROLE_CONFIG_REQUIRED' USING ERRCODE='42501'; END IF;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_source_menu_managed BEFORE INSERT OR UPDATE OR DELETE ON sys_menu
        FOR EACH ROW EXECUTE FUNCTION guard_egg_source_permission_configuration();
      CREATE TRIGGER egg_source_role_grants_managed BEFORE INSERT OR UPDATE OR DELETE ON sys_role_menu_permission
        FOR EACH ROW EXECUTE FUNCTION guard_egg_source_permission_configuration();
      CREATE FUNCTION require_independent_egg_source_writer() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NULLIF(current_setting('phoenix.egg_source_writer',true),'') IS NULL
          OR NOT EXISTS (SELECT 1 FROM md_egg_source_write_control WHERE id=1 AND writes_enabled FOR SHARE)
        THEN RAISE EXCEPTION 'Egg source mutations are closed or require independent permission' USING ERRCODE='42501'; END IF;
        IF (TG_TABLE_NAME='md_egg_source_changes' AND current_setting('phoenix.egg_source_writer') <> to_jsonb(NEW)->>'last_editor')
          OR (TG_TABLE_NAME='md_egg_source_change_events' AND current_setting('phoenix.egg_source_writer') <> to_jsonb(NEW)->>'actor_id')
        THEN RAISE EXCEPTION 'Egg source writer does not match the registered actor' USING ERRCODE='42501'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_source_require_independent_writer BEFORE INSERT OR UPDATE ON md_egg_source_changes
        FOR EACH ROW EXECUTE FUNCTION require_independent_egg_source_writer();
      CREATE TRIGGER egg_source_event_require_independent_writer BEFORE INSERT ON md_egg_source_change_events
        FOR EACH ROW EXECUTE FUNCTION require_independent_egg_source_writer();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      LOCK TABLE sys_menu IN SHARE ROW EXCLUSIVE MODE;
      LOCK TABLE md_egg_source_write_control IN SHARE ROW EXCLUSIVE MODE;
      LOCK TABLE sys_role_menu_permission, sys_permission_set_item, sys_data_scopes
        IN SHARE ROW EXCLUSIVE MODE;
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM md_egg_source_write_control WHERE ever_enabled OR writes_enabled OR changed_by IS NOT NULL)
          OR EXISTS (SELECT 1 FROM sys_role_menu_permission JOIN sys_menu USING (menu_id) WHERE menu_code='MENU_MD_EGG_SOURCE')
          OR EXISTS (SELECT 1 FROM sys_permission_set_item JOIN sys_menu USING (menu_id) WHERE menu_code='MENU_MD_EGG_SOURCE')
          OR EXISTS (SELECT 1 FROM sys_data_scopes WHERE module_code='MENU_MD_EGG_SOURCE')
        THEN RAISE EXCEPTION 'Egg source permission cutover has been used; keep the write fence and recover forward'; END IF;
      END $$;
      DROP TRIGGER egg_source_role_grants_managed ON sys_role_menu_permission;
      DROP TRIGGER egg_source_menu_managed ON sys_menu;
      DROP FUNCTION guard_egg_source_permission_configuration();
      DROP TRIGGER egg_source_event_require_independent_writer ON md_egg_source_change_events;
      DROP TRIGGER egg_source_require_independent_writer ON md_egg_source_changes;
      DROP FUNCTION require_independent_egg_source_writer();
      DELETE FROM sys_menu WHERE menu_code='MENU_MD_EGG_SOURCE'
        AND EXISTS (SELECT 1 FROM md_egg_source_write_control WHERE id=1 AND menu_inserted);
      DROP TABLE md_egg_source_write_control;
    `);
  }
}
