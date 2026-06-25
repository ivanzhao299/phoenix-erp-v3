import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 注册系统设置下角色权限/权限集原子菜单码，并从 MENU_SETTINGS_IT 平滑继承授权
 */
export class SeedSettingsAtomicPermissionMenus1782046418112 implements MigrationInterface {
  name = 'SeedSettingsAtomicPermissionMenus1782046418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
      VALUES
        ('MENU_SETTINGS_ROLE',           '角色与权限', NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 20, 'Shield', '/settings/roles'),
        ('MENU_SETTINGS_PERMISSION_SET', '权限集',     NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 30, 'Layers', '/settings/permission-sets')
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
         WHERE m.menu_code = 'MENU_SETTINGS_IT'
      ),
      targets(menu_code, allowed_codes) AS (
        VALUES
          ('MENU_SETTINGS_ROLE', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_PERMISSION_SET', ARRAY['V','C','E','D']::text[])
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
        AND m.menu_code IN ('MENU_SETTINGS_ROLE', 'MENU_SETTINGS_PERMISSION_SET')
    `);

    await queryRunner.query(`
      DELETE FROM sys_menu
      WHERE menu_code IN ('MENU_SETTINGS_ROLE', 'MENU_SETTINGS_PERMISSION_SET')
    `);
  }
}
