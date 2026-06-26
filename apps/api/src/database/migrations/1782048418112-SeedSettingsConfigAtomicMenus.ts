import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 注册系统配置/菜单注册/好业财配置原子菜单码，并从 MENU_SYS_CONFIG 平滑继承授权
 */
export class SeedSettingsConfigAtomicMenus1782048418112 implements MigrationInterface {
  name = 'SeedSettingsConfigAtomicMenus1782048418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
      VALUES
        ('MENU_SETTINGS_CONFIG',        '系统参数',       NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 110, 'Settings2', '/settings/master-data'),
        ('MENU_SETTINGS_MENU_REGISTRY', '菜单注册表',     NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 120, 'ListTree',  '/system/menu-registry'),
        ('MENU_SETTINGS_CHANJET',       '好业财配置诊断', NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 130, 'PlugZap',   '/system/chanjet')
      ON CONFLICT (menu_code) DO UPDATE SET
        menu_name_zh = EXCLUDED.menu_name_zh,
        menu_name_lo = EXCLUDED.menu_name_lo,
        domain = EXCLUDED.domain,
        parent_code = EXCLUDED.parent_code,
        sort_order = EXCLUDED.sort_order,
        icon = EXCLUDED.icon,
        route = EXCLUDED.route
    `);

    await queryRunner.query(`
      WITH legacy AS (
        SELECT p.role_id, p.perm_codes
          FROM sys_role_menu_permission p
          JOIN sys_menu m ON m.menu_id = p.menu_id
         WHERE m.menu_code = 'MENU_SYS_CONFIG'
      ),
      targets(menu_code, allowed_codes) AS (
        VALUES
          ('MENU_SETTINGS_CONFIG',        ARRAY['V','E']::text[]),
          ('MENU_SETTINGS_MENU_REGISTRY', ARRAY['V','E']::text[]),
          ('MENU_SETTINGS_CHANJET',       ARRAY['V','E']::text[])
      ),
      expanded AS (
        SELECT
          legacy.role_id,
          targets.menu_code,
          (
            SELECT string_agg(code, ',' ORDER BY array_position(ARRAY['V','C','E','D','A','X']::text[], code))
              FROM unnest(string_to_array(legacy.perm_codes, ',')) AS code
             WHERE code = ANY(targets.allowed_codes)
          ) AS perm_codes
        FROM legacy
        CROSS JOIN targets
      )
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT expanded.role_id, menu.menu_id, expanded.perm_codes
        FROM expanded
        JOIN sys_menu menu ON menu.menu_code = expanded.menu_code
       WHERE expanded.perm_codes IS NOT NULL
         AND expanded.perm_codes <> ''
      ON CONFLICT (role_id, menu_id) DO UPDATE SET
        perm_codes = EXCLUDED.perm_codes
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_menu m
      WHERE p.menu_id = m.menu_id
        AND m.menu_code IN (
          'MENU_SETTINGS_CONFIG',
          'MENU_SETTINGS_MENU_REGISTRY',
          'MENU_SETTINGS_CHANJET'
        )
    `);

    await queryRunner.query(`
      DELETE FROM sys_menu
      WHERE menu_code IN (
        'MENU_SETTINGS_CONFIG',
        'MENU_SETTINGS_MENU_REGISTRY',
        'MENU_SETTINGS_CHANJET'
      )
    `);
  }
}
