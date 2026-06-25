import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 注册系统设置运营类原子菜单码，并从 MENU_SETTINGS_IT 平滑继承授权
 */
export class SeedSettingsOperationalAtomicMenus1782047418112 implements MigrationInterface {
  name = 'SeedSettingsOperationalAtomicMenus1782047418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
      VALUES
        ('MENU_SETTINGS_SECURITY', '安全策略', NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 40, 'ShieldCheck', '/settings/security'),
        ('MENU_SETTINGS_AUDIT',    '审计日志', NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 50, 'ScrollText',  '/settings/audit-log'),
        ('MENU_SETTINGS_BRAND',    '品牌配置', NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 60, 'Star',        '/settings/brand'),
        ('MENU_SETTINGS_TERMINAL', '终端配置', NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 70, 'Smartphone',  '/settings/pda-terminals'),
        ('MENU_SETTINGS_POS',      '收银配置', NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 80, 'Store',       '/settings/pos-config'),
        ('MENU_SETTINGS_STOCK',    '库存分账', NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 90, 'ToggleRight', '/settings/store-stock'),
        ('MENU_SETTINGS_NOTIFY',   '通知设置', NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 100, 'Bell',       '/settings/notifications')
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
          ('MENU_SETTINGS_SECURITY', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_AUDIT',    ARRAY['V','X']::text[]),
          ('MENU_SETTINGS_BRAND',    ARRAY['V','E']::text[]),
          ('MENU_SETTINGS_TERMINAL', ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_POS',      ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_STOCK',    ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_NOTIFY',   ARRAY['V','C','E','D']::text[])
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
          'MENU_SETTINGS_SECURITY',
          'MENU_SETTINGS_AUDIT',
          'MENU_SETTINGS_BRAND',
          'MENU_SETTINGS_TERMINAL',
          'MENU_SETTINGS_POS',
          'MENU_SETTINGS_STOCK',
          'MENU_SETTINGS_NOTIFY'
        )
    `);

    await queryRunner.query(`
      DELETE FROM sys_menu
      WHERE menu_code IN (
        'MENU_SETTINGS_SECURITY',
        'MENU_SETTINGS_AUDIT',
        'MENU_SETTINGS_BRAND',
        'MENU_SETTINGS_TERMINAL',
        'MENU_SETTINGS_POS',
        'MENU_SETTINGS_STOCK',
        'MENU_SETTINGS_NOTIFY'
      )
    `);
  }
}
