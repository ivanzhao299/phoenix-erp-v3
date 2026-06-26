import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 注册组织/公司/事业群/数据范围原子菜单码，并从 MENU_SYS_ORG 平滑继承授权
 */
export class SeedOrgDataScopeAtomicMenus1782049418112 implements MigrationInterface {
  name = 'SeedOrgDataScopeAtomicMenus1782049418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
      VALUES
        ('MENU_MD_ORG',             '组织架构',     NULL, 'MASTER_DATA', 'MENU_MASTER_DATA', 15, 'Network',     '/master-data/organizations'),
        ('MENU_MD_BUSINESS_UNIT',   '事业群',       NULL, 'MASTER_DATA', 'MENU_MASTER_DATA', 16, 'Network',     '/master-data/business-units'),
        ('MENU_MD_COMPANY',         '公司档案',     NULL, 'MASTER_DATA', 'MENU_MASTER_DATA', 17, 'Building',    '/master-data/companies'),
        ('MENU_SETTINGS_DATA_SCOPE','数据范围规则', NULL, 'SYSTEM',      'MENU_SETTINGS_USER', 35, 'ShieldCheck','/settings/data-scopes')
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
         WHERE m.menu_code = 'MENU_SYS_ORG'
      ),
      targets(menu_code, allowed_codes) AS (
        VALUES
          ('MENU_MD_ORG',              ARRAY['V','C','E','D']::text[]),
          ('MENU_MD_BUSINESS_UNIT',    ARRAY['V','C','E','D']::text[]),
          ('MENU_MD_COMPANY',          ARRAY['V','C','E','D']::text[]),
          ('MENU_SETTINGS_DATA_SCOPE', ARRAY['V','C','E','D']::text[])
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
          'MENU_MD_ORG',
          'MENU_MD_BUSINESS_UNIT',
          'MENU_MD_COMPANY',
          'MENU_SETTINGS_DATA_SCOPE'
        )
    `);

    await queryRunner.query(`
      DELETE FROM sys_menu
      WHERE menu_code IN (
        'MENU_MD_ORG',
        'MENU_MD_BUSINESS_UNIT',
        'MENU_MD_COMPANY',
        'MENU_SETTINGS_DATA_SCOPE'
      )
    `);
  }
}
