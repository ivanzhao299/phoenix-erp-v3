import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 注册在线用户原子菜单码，并从 MENU_SYS_MONITOR 平滑继承 V 权限
 */
export class SeedOnlineUsersAtomicMenu1782051418112 implements MigrationInterface {
  name = 'SeedOnlineUsersAtomicMenu1782051418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
      VALUES
        ('MENU_SETTINGS_ONLINE_USER', '在线用户', NULL, 'SYSTEM', 'MENU_SETTINGS_USER', 140, 'Users', '/settings/online-users')
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
        SELECT p.role_id
          FROM sys_role_menu_permission p
          JOIN sys_menu m ON m.menu_id = p.menu_id
         WHERE m.menu_code = 'MENU_SYS_MONITOR'
           AND 'V' = ANY(string_to_array(COALESCE(p.perm_codes, ''), ','))
      ),
      target AS (
        SELECT menu_id FROM sys_menu WHERE menu_code = 'MENU_SETTINGS_ONLINE_USER'
      )
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT legacy.role_id, target.menu_id, 'V'
        FROM legacy
        CROSS JOIN target
      ON CONFLICT (role_id, menu_id) DO UPDATE SET
        perm_codes = EXCLUDED.perm_codes
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_menu m
      WHERE p.menu_id = m.menu_id
        AND m.menu_code = 'MENU_SETTINGS_ONLINE_USER'
    `);

    await queryRunner.query(`
      DELETE FROM sys_menu
      WHERE menu_code = 'MENU_SETTINGS_ONLINE_USER'
    `);
  }
}
