import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 注册质检标准/移动配送原子菜单码，并从旧质检/配送权限最小继承授权
 */
export class SeedQualityMobileAtomicMenus1782050418112 implements MigrationInterface {
  name = 'SeedQualityMobileAtomicMenus1782050418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
      VALUES
        ('MENU_QA_MASTER',       '质量标准', NULL, 'QUALITY', 'MENU_FARM_DATA',      370, 'FlaskConical', '/quality/standards'),
        ('MENU_MOBILE_DELIVERY', '移动配送', NULL, 'SALES',   'MENU_SALES2_DELIVERY', 55, 'Truck',        '/mobile/delivery')
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
      WITH source_permissions AS (
        SELECT p.role_id, m.menu_code AS source_menu, p.perm_codes
          FROM sys_role_menu_permission p
          JOIN sys_menu m ON m.menu_id = p.menu_id
         WHERE m.menu_code IN ('MENU_QA_MGR', 'MENU_QA', 'MENU_SALES2_DELIVERY', 'MENU_LOGISTICS')
      ),
      targets(menu_code, source_menus, allowed_codes) AS (
        VALUES
          ('MENU_QA_MASTER',       ARRAY['MENU_QA_MGR','MENU_QA']::text[],                 ARRAY['V']::text[]),
          ('MENU_MOBILE_DELIVERY', ARRAY['MENU_SALES2_DELIVERY','MENU_LOGISTICS']::text[], ARRAY['V','C','E']::text[])
      ),
      expanded AS (
        SELECT
          sp.role_id,
          targets.menu_code,
          (
            SELECT string_agg(code, ',' ORDER BY array_position(ARRAY['V','C','E','D','A','X']::text[], code))
              FROM unnest(string_to_array(sp.perm_codes, ',')) AS code
             WHERE code = ANY(targets.allowed_codes)
          ) AS perm_codes
        FROM source_permissions sp
        JOIN targets ON sp.source_menu = ANY(targets.source_menus)
      ),
      merged AS (
        SELECT role_id, menu_code, string_agg(DISTINCT code, ',' ORDER BY code) AS raw_codes
          FROM expanded
          CROSS JOIN LATERAL unnest(string_to_array(expanded.perm_codes, ',')) AS code
         WHERE expanded.perm_codes IS NOT NULL
           AND expanded.perm_codes <> ''
         GROUP BY role_id, menu_code
      ),
      ordered AS (
        SELECT
          role_id,
          menu_code,
          (
            SELECT string_agg(code, ',' ORDER BY array_position(ARRAY['V','C','E','D','A','X']::text[], code))
              FROM unnest(string_to_array(raw_codes, ',')) AS code
          ) AS perm_codes
        FROM merged
      )
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT ordered.role_id, menu.menu_id, ordered.perm_codes
        FROM ordered
        JOIN sys_menu menu ON menu.menu_code = ordered.menu_code
       WHERE ordered.perm_codes IS NOT NULL
         AND ordered.perm_codes <> ''
      ON CONFLICT (role_id, menu_id) DO UPDATE SET
        perm_codes = EXCLUDED.perm_codes
    `);

    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT role.role_id, menu.menu_id, 'V,C,E'
        FROM sys_role role
        JOIN sys_menu menu ON menu.menu_code = 'MENU_MOBILE_DELIVERY'
       WHERE role.role_code = 'ROLE_DRIVER'
      ON CONFLICT (role_id, menu_id) DO UPDATE SET
        perm_codes = EXCLUDED.perm_codes
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_menu m
      WHERE p.menu_id = m.menu_id
        AND m.menu_code IN ('MENU_QA_MASTER', 'MENU_MOBILE_DELIVERY')
    `);

    await queryRunner.query(`
      DELETE FROM sys_menu
      WHERE menu_code IN ('MENU_QA_MASTER', 'MENU_MOBILE_DELIVERY')
    `);
  }
}
