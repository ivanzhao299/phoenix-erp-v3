-- ════════════════════════════════════════════════════════════════════════
-- Production Chain Convergence Phase 1 — B · 权限菜单收口（sys_menu seed）
-- ────────────────────────────────────────────────────────────────────────
-- 依据：docs/production-inventory-integration-audit.md §7
-- 目标：新增 6 个权限码（运行时门控在 rbac.matrix.ts ROLE_MENU_MATRIX，
--   此处仅注册 sys_menu 用于侧边栏展示与权限管理可见性）。
--   核心：包装完成入库（MENU_PKG_COMPLETE_INVENTORY）与
--         手工库存入库（MENU_INV_MANUAL_INBOUND）权限彻底分离。
-- 全部幂等：ON CONFLICT (menu_code) DO NOTHING，可重复执行，不覆盖已有
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.sys_menu') IS NOT NULL THEN
    INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, sort_order, icon, route) VALUES
      ('MENU_PROD_COLLECTION',        '集蛋记录',     'ບັນທຶກເກັບໄຂ່',        'FARM', 16, 'egg',        '/breeding/egg-ledger'),
      ('MENU_PKG_PACKAGING',          '包装作业',     'ວຽກຫຸ້ມຫໍ່',          'PKG',  20, 'pkg-pack',   '/pkg/packaging'),
      ('MENU_PKG_COMPLETE_INVENTORY', '包装完成入库', 'ສຳເລັດເຂົ້າສາງ',      'PKG',  24, 'pkg-inbound','/pkg/complete-inventory'),
      ('MENU_INV_BATCH',              '库存批次',     'batch ສິນຄ້າ',         'WMS',  30, 'batch',      '/sales2/inventory'),
      ('MENU_INV_LEDGER',             '库存流水',     'ບັນຊີສາງ',            'WMS',  31, 'ledger',     '/warehouse/ledger'),
      ('MENU_INV_MANUAL_INBOUND',     '手工库存入库', 'ເຂົ້າສາງດ້ວຍມື',      'WMS',  32, 'inbound',    '/warehouse/inbound')
    ON CONFLICT (menu_code) DO NOTHING;
  END IF;
END $$;

-- 角色-菜单授权（sys_role_menu_permission，幂等）。运行时实际门控以 rbac.matrix.ts 为准，
-- 此处保持 DB seed 与代码矩阵一致，便于权限中心展示。
-- 用 (VALUES code...) JOIN sys_role/sys_menu 解析数字 FK（与 02_init_data.sql 同模式）。
DO $$
BEGIN
  IF to_regclass('public.sys_role_menu_permission') IS NOT NULL THEN
    INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
    SELECT r.role_id, m.menu_id, v.perm_codes
    FROM (VALUES
      -- 集蛋记录：养殖/包装可录入
      ('ROLE_ADMIN',      'MENU_PROD_COLLECTION',        'V,C,E,D,A,X'),
      ('ROLE_FARM_MGR',   'MENU_PROD_COLLECTION',        'V,C,E'),
      ('ROLE_PKG_MGR',    'MENU_PROD_COLLECTION',        'V,C,E'),
      -- 包装作业
      ('ROLE_ADMIN',      'MENU_PKG_PACKAGING',          'V,C,E,D,A,X'),
      ('ROLE_PKG_MGR',    'MENU_PKG_PACKAGING',          'V,C,E,A'),
      ('ROLE_PKG_OP',     'MENU_PKG_PACKAGING',          'V,C'),
      ('ROLE_FACTORY_MGR','MENU_PKG_PACKAGING',          'V,C,E'),
      -- 包装完成入库（与手工入库分离：只授包装主管 + 管理员）
      ('ROLE_ADMIN',      'MENU_PKG_COMPLETE_INVENTORY', 'V,C,E,A,X'),
      ('ROLE_PKG_MGR',    'MENU_PKG_COMPLETE_INVENTORY', 'V,C'),
      ('ROLE_FACTORY_MGR','MENU_PKG_COMPLETE_INVENTORY', 'V,C'),
      -- 库存批次
      ('ROLE_ADMIN',      'MENU_INV_BATCH',              'V,C,E,D,A,X'),
      ('ROLE_WMS_MGR',    'MENU_INV_BATCH',              'V,C,E'),
      ('ROLE_SALES_MGR',  'MENU_INV_BATCH',              'V'),
      -- 库存流水（只读为主）
      ('ROLE_ADMIN',      'MENU_INV_LEDGER',             'V,C,E,D,A,X'),
      ('ROLE_WMS_MGR',    'MENU_INV_LEDGER',             'V,X'),
      ('ROLE_FIN_ACCT',   'MENU_INV_LEDGER',             'V,X'),
      -- 手工库存入库（与包装完成入库分离：只授仓管 + 管理员，禁止录包装成品）
      ('ROLE_ADMIN',      'MENU_INV_MANUAL_INBOUND',     'V,C,E,D,A,X'),
      ('ROLE_WMS_MGR',    'MENU_INV_MANUAL_INBOUND',     'V,C,E')
    ) AS v(role_code, menu_code, perm_codes)
    JOIN sys_role r ON r.role_code = v.role_code
    JOIN sys_menu m ON m.menu_code = v.menu_code
    ON CONFLICT (role_id, menu_id) DO NOTHING;
  END IF;
END $$;
