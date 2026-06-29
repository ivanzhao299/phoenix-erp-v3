import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 修复 task #27 烟测 F1 + F6 两处「菜单码从未 seeded → 403/FE 死码」。
 *   纯 RBAC 配置表（sys_menu / sys_role_menu_permission）DML，幂等，含 down()。
 *
 * F1（critical · 403）：store-payment.controller 用 4 个 @RequireMenu 主码
 *   MENU_STORE_PAYMENT / _ACCOUNT / _CONFIRM / _VOID（前端另引用 _EXPORT），但这 5 码
 *   从未写入 sys_menu，也无任何角色授权 → 整个门店收款功能对所有非超管 403 NOT_REGISTERED。
 *   修复：seed 5 码（domain=STORE）+ 授权 收银员(记录/账户 V,E) / 店长(全 + 确认/作废/导出)。
 *   职责分离：收银员只录款与登记账户，确认/作废/导出归店长。
 *
 * F6（medium · FE 死码）：MENU_SALES2_DASHBOARD 被 Sidebar /sales2 + 手机首页引用，但从未
 *   seeded、无任何后端控制器执法、无授权 → 所有非超管销售角色被 Sidebar 挡在 /sales2 落地页外
 *   （子页 /sales2/orders 等各有自己的码不受影响）。修复：seed（domain=SALES）+ 授 V 给所有
 *   已持 MENU_SALES2_ORDER 的角色（销售/区域/高管）。
 *
 * 注：经核验，原审计 F3(供应商写权)/F4(FARM_CASHIER 看板)/F7(FIN_ACCT 子账)/F8(FARM_MGR 采购看板)
 *   均为静态矩阵误报——FIN_ACCT 实持 AR/AP/EXPENSE 增改权；dashboard/采购看板服务层已按
 *   DataScope 收窄（isGlobalKpi / scope.params）；供应商主数据本就集团共享。故本迁移不动这些。
 */
export class SeedStorePaymentAndSales2DashboardMenus1782720000000 implements MigrationInterface {
  name = 'SeedStorePaymentAndSales2DashboardMenus1782720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── F1.1：seed 5 个 store-payment 菜单（domain=STORE，route=/store-payment）──
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order, route)
      VALUES
        ('MENU_STORE_PAYMENT',         '门店收款',       'STORE', 8,  '/store-payment'),
        ('MENU_STORE_PAYMENT_ACCOUNT', '门店收款-账户',  'STORE', 9,  '/store-payment'),
        ('MENU_STORE_PAYMENT_CONFIRM', '门店收款-确认',  'STORE', 10, '/store-payment'),
        ('MENU_STORE_PAYMENT_VOID',    '门店收款-作废',  'STORE', 11, '/store-payment'),
        ('MENU_STORE_PAYMENT_EXPORT',  '门店收款-导出',  'STORE', 12, '/store-payment')
      ON CONFLICT (menu_code) DO NOTHING
    `);

    // ── F1.2：授权 收银员 / 店长 ──
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT r.role_id, m.menu_id, v.perm_codes
      FROM (VALUES
        ('ROLE_CASHIER',   'MENU_STORE_PAYMENT',         'V,E'),
        ('ROLE_CASHIER',   'MENU_STORE_PAYMENT_ACCOUNT', 'V,E'),
        ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT',         'V,E'),
        ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT_ACCOUNT', 'V,E'),
        ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT_CONFIRM', 'V,E'),
        ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT_VOID',    'V,E'),
        ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT_EXPORT',  'V,X')
      ) AS v(role_code, menu_code, perm_codes)
      JOIN sys_role r ON r.role_code = v.role_code
      JOIN sys_menu m ON m.menu_code = v.menu_code
      ON CONFLICT (role_id, menu_id) DO NOTHING
    `);

    // ── F6.1：seed MENU_SALES2_DASHBOARD（domain=SALES，route=/sales2）──
    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order, route)
      VALUES ('MENU_SALES2_DASHBOARD', 'Sales V2 看板', 'SALES', 69, '/sales2')
      ON CONFLICT (menu_code) DO NOTHING
    `);

    // ── F6.2：授 V 给所有已持 MENU_SALES2_ORDER 的角色（销售落地页可见性对齐）──
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT p.role_id, sd.menu_id, 'V'
      FROM sys_role_menu_permission p
      JOIN sys_menu so ON so.menu_id = p.menu_id AND so.menu_code = 'MENU_SALES2_ORDER'
      JOIN sys_menu sd ON sd.menu_code = 'MENU_SALES2_DASHBOARD'
      ON CONFLICT (role_id, menu_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p USING sys_menu m
      WHERE p.menu_id = m.menu_id AND m.menu_code IN
        ('MENU_STORE_PAYMENT','MENU_STORE_PAYMENT_ACCOUNT','MENU_STORE_PAYMENT_CONFIRM',
         'MENU_STORE_PAYMENT_VOID','MENU_STORE_PAYMENT_EXPORT','MENU_SALES2_DASHBOARD')
    `);
    await queryRunner.query(`
      DELETE FROM sys_menu WHERE menu_code IN
        ('MENU_STORE_PAYMENT','MENU_STORE_PAYMENT_ACCOUNT','MENU_STORE_PAYMENT_CONFIRM',
         'MENU_STORE_PAYMENT_VOID','MENU_STORE_PAYMENT_EXPORT','MENU_SALES2_DASHBOARD')
    `);
  }
}
