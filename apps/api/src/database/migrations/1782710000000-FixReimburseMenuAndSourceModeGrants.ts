import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 修复两处已验证的生产 RBAC 缺陷（task #27 逐用户烟测 F2 + F5）。
 *   纯 RBAC 配置表（sys_menu / sys_role_menu_permission）DML，幂等，含 down()。
 *
 * F2（critical · 403 破障）：MENU_FIN2_REIMBURSE 从未写入 sys_menu —— 仅存在于
 *   menu-registry.service 的 FALLBACK 兜底表（sys_menu 非空时不生效）。生产启动期
 *   hydrateMenuRegistry 用 sys_menu 实表替换注册表 → isMenuRegistered('MENU_FIN2_REIMBURSE')=false
 *   → fin-expense.controller 的 @RequireMenu(REIMB_MENU,'V') 对所有非超管抛 403 NOT_REGISTERED。
 *   而 20260531/0602/0606 各迁移早已写了该码的角色授权 tuple，但授权 INSERT...SELECT JOIN sys_menu
 *   因无菜单行而静默 0 行 → 报销功能对所有非超管彻底不可用。
 *   修复：补 sys_menu 行（对齐 FIN2 兄弟列形，domain=FINANCE）+ 重放 g5a 已决定的 12 角色授权矩阵
 *   （恢复既定意图，非新授权决策）。
 *
 * F5（高 · 局部 403）：/breeding/daily-inbound 页（view-gate=MENU_PROD_INBOUND，已授 FARMER/FARM_MGR）
 *   会 GET /v2/inventory/source/mode（@RequireMenu MENU_INV_SOURCE_MODE,'V'），但该读权限只授了
 *   ADMIN/CEO/FACTORY_MGR/WMS_MGR/PKG_MGR/AUDITOR，漏了 FARMER/FARM_MGR → 这两类角色进自己的
 *   每日入库页时 source-mode 读 403（半破页）。补 V（只读）即可，A（切换模式）仍仅 FACTORY_MGR 等。
 */
export class FixReimburseMenuAndSourceModeGrants1782710000000 implements MigrationInterface {
  name = 'FixReimburseMenuAndSourceModeGrants1782710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── F2.1：补 MENU_FIN2_REIMBURSE 进 sys_menu（幂等，列形对齐 v2 seed 的 FIN2 兄弟）──
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order, route)
      VALUES ('MENU_FIN2_REIMBURSE', '财务V2 报销管理', 'FINANCE', 70, '/finance2/reimbursements')
      ON CONFLICT (menu_code) DO NOTHING
    `);

    // ── F2.2：重放 g5a 既定的报销授权矩阵（之前因缺菜单行静默失败）──
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT r.role_id, m.menu_id, v.perm_codes
      FROM (VALUES
        ('ROLE_ADMIN','A,C,D,E,V,X'),
        ('ROLE_CEO','A,V,X'),
        ('ROLE_FIN_CFO','A,C,E,V,X'),
        ('ROLE_HQ_FINANCE','A,V,X'),
        ('ROLE_FINANCE_REVIEW_MANAGER','A,V,X'),
        ('ROLE_FIN_ACCT','V,X'),
        ('ROLE_FACTORY_ACCT','C,E,V,X'),
        ('ROLE_TREASURY_MANAGER','E,V'),
        ('ROLE_CASH','E,V'),
        ('ROLE_AUDITOR','V,X'),
        ('ROLE_FARM_MGR','C,V'),
        ('ROLE_STORE_MGR','C,V')
      ) AS v(role_code, perm_codes)
      JOIN sys_role r ON r.role_code = v.role_code
      JOIN sys_menu m ON m.menu_code = 'MENU_FIN2_REIMBURSE'
      ON CONFLICT (role_id, menu_id) DO NOTHING
    `);

    // ── F5：补 MENU_INV_SOURCE_MODE:V 给 FARMER / FARM_MGR（其每日入库页只读 source-mode）──
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT r.role_id, m.menu_id, 'V'
      FROM (VALUES ('ROLE_FARMER'), ('ROLE_FARM_MGR')) AS v(role_code)
      JOIN sys_role r ON r.role_code = v.role_code
      JOIN sys_menu m ON m.menu_code = 'MENU_INV_SOURCE_MODE'
      ON CONFLICT (role_id, menu_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // F5 回退：仅删本迁移补的两行 source-mode 授权
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_role r, sys_menu m
      WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
        AND m.menu_code = 'MENU_INV_SOURCE_MODE'
        AND r.role_code IN ('ROLE_FARMER','ROLE_FARM_MGR')
    `);
    // F2 回退：删报销授权 + 菜单行（这些行均由本迁移创建，之前无残留）
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p
      USING sys_menu m
      WHERE p.menu_id = m.menu_id AND m.menu_code = 'MENU_FIN2_REIMBURSE'
    `);
    await queryRunner.query(`
      DELETE FROM sys_menu WHERE menu_code = 'MENU_FIN2_REIMBURSE'
    `);
  }
}
