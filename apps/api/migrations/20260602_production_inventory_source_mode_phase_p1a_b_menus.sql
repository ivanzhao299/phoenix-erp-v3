-- ════════════════════════════════════════════════════════════════════════
-- Production Inventory Source Mode Phase P1A — B · 菜单权限
-- ────────────────────────────────────────────────────────────────────────
-- 新增 2 个权限码（运行时门控在 rbac.matrix.ts）：
--   MENU_PROD_INBOUND     日产蛋入库（生产管理，仅 TEMP_PRODUCTION_INBOUND 模式可用）
--   MENU_INV_SOURCE_MODE  库存来源模式（切换仅 ADMIN/CEO/FACTORY_MGR）
-- 全部幂等：ON CONFLICT DO NOTHING
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.sys_menu') IS NOT NULL THEN
    INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, sort_order, icon, route) VALUES
      ('MENU_PROD_INBOUND',    '日产蛋入库',   'ເຂົ້າສາງໄຂ່ປະຈຳວັນ', 'FARM', 17, 'egg-in',  '/breeding/daily-inbound'),
      ('MENU_INV_SOURCE_MODE', '库存来源模式', 'ໂໝດແຫຼ່ງສິນຄ້າ',     'WMS',  33, 'switch',  '/warehouse/source-mode')
    ON CONFLICT (menu_code) DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sys_role_menu_permission') IS NOT NULL THEN
    INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
    SELECT r.role_id, m.menu_id, v.perm_codes
    FROM (VALUES
      -- 日产蛋入库：养殖/包装/场区可录入
      ('ROLE_ADMIN',      'MENU_PROD_INBOUND',    'V,C,E,D,A,X'),
      ('ROLE_FARM_MGR',   'MENU_PROD_INBOUND',    'V,C,E'),
      ('ROLE_FARMER',     'MENU_PROD_INBOUND',    'V,C'),
      ('ROLE_FACTORY_MGR','MENU_PROD_INBOUND',    'V,C,E'),
      -- 库存来源模式：切换仅 ADMIN/CEO/FACTORY_MGR（A=切换；其余角色仅可查看）
      ('ROLE_ADMIN',      'MENU_INV_SOURCE_MODE', 'V,C,E,D,A,X'),
      ('ROLE_CEO',        'MENU_INV_SOURCE_MODE', 'V,A,X'),
      ('ROLE_FACTORY_MGR','MENU_INV_SOURCE_MODE', 'V,A'),
      ('ROLE_WMS_MGR',    'MENU_INV_SOURCE_MODE', 'V'),
      ('ROLE_PKG_MGR',    'MENU_INV_SOURCE_MODE', 'V')
    ) AS v(role_code, menu_code, perm_codes)
    JOIN sys_role r ON r.role_code = v.role_code
    JOIN sys_menu m ON m.menu_code = v.menu_code
    ON CONFLICT (role_id, menu_id) DO NOTHING;
  END IF;
END $$;
