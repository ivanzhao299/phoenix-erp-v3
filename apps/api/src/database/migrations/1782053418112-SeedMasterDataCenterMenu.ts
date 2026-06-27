import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 补 seed 漏掉的 MENU_MD_CENTER(sys_menu)+ 对应角色授权,修复部署后主数据中心 403
 *
 * 背景(2026-06-27 部署后回归根因):
 *   主数据中枢/运营/治理/质量页 + master-data-center.controller 全部按 `MENU_MD_CENTER:V` 判权,
 *   但 1782052 迁移 INSERT 了 MENU_MASTER_DATA + 全部 MENU_MD_*,唯独漏了 MENU_MD_CENTER。
 *   启动期 hydrateMenuRegistry 用 sys_menu 实表整体替换注册表;部署后 sys_menu 非空但缺该码 →
 *   isMenuRegistered('MENU_MD_CENTER')=false → MenuGuard 注册检查 throw 403,连 ROLE_ADMIN 也被拦
 *   (guard 顺序已另行加固:admin 直通提前)。本迁移补齐缺失的菜单行 + 授权,根治非超管角色的访问。
 */
export class SeedMasterDataCenterMenu1782053418112 implements MigrationInterface {
  name = 'SeedMasterDataCenterMenu1782053418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 补 MENU_MD_CENTER 进 sys_menu(幂等,父=主数据中心,路由=/master-data)
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
      VALUES ('MENU_MD_CENTER', '主数据中心入口', NULL, 'MASTER', 'MENU_MASTER_DATA', 745, 'Database', '/master-data')
      ON CONFLICT (menu_code) DO NOTHING
    `);

    // 2) 给所有已持有 MENU_MASTER_DATA 的角色补 MENU_MD_CENTER:V(中枢访问与父菜单可见性对齐)
    //    ROLE_ADMIN 走 '*' 通配 + guard 直通,不依赖此授权;但若其有 MASTER_DATA 行也一并补(无害)。
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT p.role_id, mc.menu_id, 'V'
      FROM sys_role_menu_permission p
      JOIN sys_menu md ON md.menu_id = p.menu_id AND md.menu_code = 'MENU_MASTER_DATA'
      JOIN sys_menu mc ON mc.menu_code = 'MENU_MD_CENTER'
      ON CONFLICT (role_id, menu_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 撤销本迁移补的授权 + 菜单行
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_menu m
      WHERE p.menu_id = m.menu_id AND m.menu_code = 'MENU_MD_CENTER'
    `);
    await queryRunner.query(`
      DELETE FROM sys_menu WHERE menu_code = 'MENU_MD_CENTER'
    `);
  }
}
