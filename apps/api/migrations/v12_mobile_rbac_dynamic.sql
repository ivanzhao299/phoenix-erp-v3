-- ═══════════════════════════════════════════════════════════════════════════
-- v12_mobile_rbac_dynamic.sql
-- 目的：
--   1. 在 sys_menu 中添加 MOBILE_* 条目（移动端功能菜单，domain='MOBILE'）
--   2. 为现有角色种入 sys_role_menu_permission（移动端权限矩阵）
--      → 写权限(write)  : perm_codes = 'V,C,E'
--      → 读权限(read)   : perm_codes = 'V'
--      → ON CONFLICT DO UPDATE 幂等，重复执行安全
--   3. prc_purchase_orders 添加 store_code 索引（提速 org 隔离查询）
--
-- 对应 mobile-roles.ts PAGE_PERMS 当前版本（2026-05-23）
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. 添加 MOBILE_* 菜单条目（幂等） ────────────────────────────────────────
INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, sort_order, route)
VALUES
  ('MOBILE_DASHBOARD',   '看板总览',  'ໜ້າຫຼັກ',              'MOBILE', 10,  '/mobile/home'),
  ('MOBILE_FEED',        '饲料台账',  'ບັນທຶກອາຫານ',          'MOBILE', 20,  '/mobile/feed'),
  ('MOBILE_MORTALITY',   '死淘快录',  'ບັນທຶກຕາຍ',            'MOBILE', 30,  '/mobile/mortality'),
  ('MOBILE_EGGLOG',      '产蛋录入',  'ບັນທຶກໄຂ່',            'MOBILE', 40,  '/mobile/egglog'),
  ('MOBILE_HENREPORT',   '存栏日报',  'ລາຍງານໄກ່',            'MOBILE', 50,  '/mobile/henreport'),
  ('MOBILE_ANALYTICS',   '生产趋势',  'ແນວໂນ້ມ',              'MOBILE', 60,  '/mobile/analytics'),
  ('MOBILE_PACKAGING',   '包装统计',  'ສະຖິຕິບັນຈຸ',          'MOBILE', 70,  '/mobile/packaging'),
  ('MOBILE_QUALITY',     '品质检测',  'ກວດສອບຄຸນນະພາບ',       'MOBILE', 80,  '/mobile/quality'),
  ('MOBILE_EGG',         '鸡蛋台账',  'ບັນທຶກໄຂ່ເກັບ',        'MOBILE', 90,  '/mobile/egg'),
  ('MOBILE_SALES',       '销售出库',  'ການຂາຍ',               'MOBILE', 100, '/mobile/sales'),
  ('MOBILE_MEDICINE',    '药品台账',  'ບັນທຶກຢາ',             'MOBILE', 110, '/mobile/medicine'),
  ('MOBILE_DELIVERY',    '配送签收',  'ການຈັດສົ່ງ',           'MOBILE', 120, '/mobile/delivery'),
  ('MOBILE_TERMINAL',    '包装终端',  'ສະຖານີ',               'MOBILE', 130, '/mobile/terminal'),
  ('MOBILE_PROCUREMENT', '采购审批',  'ອະນຸມັດຈັດຊື້',         'MOBILE', 140, '/mobile/procurement')
ON CONFLICT (menu_code) DO NOTHING;

-- ── 2. 种入移动端角色权限矩阵 ─────────────────────────────────────────────────
-- 使用 PL/pgSQL DO 块：按 role_code + menu_code 动态解析 ID 后批量插入
-- ON CONFLICT (role_id, menu_id) DO UPDATE 确保幂等

DO $$
DECLARE
  v_rec RECORD;
  v_role_id BIGINT;
  v_menu_id BIGINT;
BEGIN
  FOR v_rec IN (
    SELECT *
    FROM (VALUES
      -- ─── MOBILE_DASHBOARD (read: 所有管理类角色) ──────────────────────
      ('ROLE_ADMIN',      'MOBILE_DASHBOARD', 'V'),
      ('ROLE_CEO',        'MOBILE_DASHBOARD', 'V'),
      ('ROLE_FARM_MGR',   'MOBILE_DASHBOARD', 'V'),
      ('ROLE_VET',        'MOBILE_DASHBOARD', 'V'),
      ('ROLE_QA_MGR',     'MOBILE_DASHBOARD', 'V'),
      ('ROLE_WMS_MGR',    'MOBILE_DASHBOARD', 'V'),
      ('ROLE_PKG_MGR',    'MOBILE_DASHBOARD', 'V'),
      ('ROLE_PKG_OP',     'MOBILE_DASHBOARD', 'V'),
      ('ROLE_LOG_MGR',    'MOBILE_DASHBOARD', 'V'),
      ('ROLE_STORE_MGR',  'MOBILE_DASHBOARD', 'V'),
      ('ROLE_FIN_CFO',    'MOBILE_DASHBOARD', 'V'),
      ('ROLE_FIN_ACCT',   'MOBILE_DASHBOARD', 'V'),
      ('ROLE_FIN_COST',   'MOBILE_DASHBOARD', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_DASHBOARD', 'V'),
      ('ROLE_BREEDER',    'MOBILE_DASHBOARD', 'V'),
      ('ROLE_SALES_REP',  'MOBILE_DASHBOARD', 'V'),
      ('ROLE_SALES_MGR',  'MOBILE_DASHBOARD', 'V'),
      ('ROLE_REGION_MGR', 'MOBILE_DASHBOARD', 'V'),
      ('ROLE_PRC_BUYER',  'MOBILE_DASHBOARD', 'V'),
      ('ROLE_CASHIER',    'MOBILE_DASHBOARD', 'V'),
      -- ─── MOBILE_FEED ─────────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_FEED', 'V,C,E'),
      ('ROLE_FARM_MGR',   'MOBILE_FEED', 'V,C,E'),
      ('ROLE_VET',        'MOBILE_FEED', 'V,C,E'),
      ('ROLE_BREEDER',    'MOBILE_FEED', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_FEED', 'V'),
      ('ROLE_WMS_MGR',    'MOBILE_FEED', 'V'),
      ('ROLE_LOG_MGR',    'MOBILE_FEED', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_FEED', 'V'),
      ('ROLE_PRC_BUYER',  'MOBILE_FEED', 'V'),
      ('ROLE_FIN_COST',   'MOBILE_FEED', 'V'),
      -- ─── MOBILE_MORTALITY ────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_MORTALITY', 'V,C,E'),
      ('ROLE_FARM_MGR',   'MOBILE_MORTALITY', 'V,C,E'),
      ('ROLE_VET',        'MOBILE_MORTALITY', 'V,C,E'),
      ('ROLE_BREEDER',    'MOBILE_MORTALITY', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_MORTALITY', 'V'),
      ('ROLE_QA_MGR',     'MOBILE_MORTALITY', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_MORTALITY', 'V'),
      -- ─── MOBILE_EGGLOG ───────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_EGGLOG', 'V,C,E'),
      ('ROLE_FARM_MGR',   'MOBILE_EGGLOG', 'V,C,E'),
      ('ROLE_VET',        'MOBILE_EGGLOG', 'V,C,E'),
      ('ROLE_BREEDER',    'MOBILE_EGGLOG', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_EGGLOG', 'V'),
      ('ROLE_WMS_MGR',    'MOBILE_EGGLOG', 'V'),
      ('ROLE_QA_MGR',     'MOBILE_EGGLOG', 'V'),
      ('ROLE_FIN_CFO',    'MOBILE_EGGLOG', 'V'),
      ('ROLE_FIN_ACCT',   'MOBILE_EGGLOG', 'V'),
      ('ROLE_FIN_COST',   'MOBILE_EGGLOG', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_EGGLOG', 'V'),
      -- ─── MOBILE_HENREPORT ────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_HENREPORT', 'V,C,E'),
      ('ROLE_FARM_MGR',   'MOBILE_HENREPORT', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_HENREPORT', 'V'),
      ('ROLE_VET',        'MOBILE_HENREPORT', 'V'),
      ('ROLE_QA_MGR',     'MOBILE_HENREPORT', 'V'),
      ('ROLE_WMS_MGR',    'MOBILE_HENREPORT', 'V'),
      ('ROLE_BREEDER',    'MOBILE_HENREPORT', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_HENREPORT', 'V'),
      -- ─── MOBILE_ANALYTICS ────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_ANALYTICS', 'V'),
      ('ROLE_CEO',        'MOBILE_ANALYTICS', 'V'),
      ('ROLE_FARM_MGR',   'MOBILE_ANALYTICS', 'V'),
      ('ROLE_VET',        'MOBILE_ANALYTICS', 'V'),
      ('ROLE_QA_MGR',     'MOBILE_ANALYTICS', 'V'),
      ('ROLE_WMS_MGR',    'MOBILE_ANALYTICS', 'V'),
      ('ROLE_FIN_CFO',    'MOBILE_ANALYTICS', 'V'),
      ('ROLE_FIN_ACCT',   'MOBILE_ANALYTICS', 'V'),
      ('ROLE_FIN_COST',   'MOBILE_ANALYTICS', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_ANALYTICS', 'V'),
      ('ROLE_SALES_MGR',  'MOBILE_ANALYTICS', 'V'),
      ('ROLE_REGION_MGR', 'MOBILE_ANALYTICS', 'V'),
      ('ROLE_STORE_MGR',  'MOBILE_ANALYTICS', 'V'),
      ('ROLE_PRC_BUYER',  'MOBILE_ANALYTICS', 'V'),
      -- ─── MOBILE_PACKAGING ────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_PACKAGING', 'V,C,E'),
      ('ROLE_FARM_MGR',   'MOBILE_PACKAGING', 'V,C,E'),
      ('ROLE_PKG_MGR',    'MOBILE_PACKAGING', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_PACKAGING', 'V'),
      ('ROLE_QA_MGR',     'MOBILE_PACKAGING', 'V'),
      ('ROLE_WMS_MGR',    'MOBILE_PACKAGING', 'V'),
      ('ROLE_LOG_MGR',    'MOBILE_PACKAGING', 'V'),
      ('ROLE_FIN_CFO',    'MOBILE_PACKAGING', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_PACKAGING', 'V'),
      -- ─── MOBILE_QUALITY ──────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_QUALITY', 'V,C,E'),
      ('ROLE_FARM_MGR',   'MOBILE_QUALITY', 'V,C,E'),
      ('ROLE_QA_MGR',     'MOBILE_QUALITY', 'V,C,E'),
      ('ROLE_VET',        'MOBILE_QUALITY', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_QUALITY', 'V'),
      ('ROLE_PKG_MGR',    'MOBILE_QUALITY', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_QUALITY', 'V'),
      -- ─── MOBILE_EGG ──────────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_EGG', 'V,C,E'),
      ('ROLE_FARM_MGR',   'MOBILE_EGG', 'V,C,E'),
      ('ROLE_WMS_MGR',    'MOBILE_EGG', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_EGG', 'V'),
      ('ROLE_VET',        'MOBILE_EGG', 'V'),
      ('ROLE_QA_MGR',     'MOBILE_EGG', 'V'),
      ('ROLE_PKG_MGR',    'MOBILE_EGG', 'V'),
      ('ROLE_SALES_MGR',  'MOBILE_EGG', 'V'),
      ('ROLE_SALES_REP',  'MOBILE_EGG', 'V'),
      ('ROLE_REGION_MGR', 'MOBILE_EGG', 'V'),
      ('ROLE_STORE_MGR',  'MOBILE_EGG', 'V'),
      ('ROLE_FIN_CFO',    'MOBILE_EGG', 'V'),
      ('ROLE_FIN_ACCT',   'MOBILE_EGG', 'V'),
      ('ROLE_FIN_COST',   'MOBILE_EGG', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_EGG', 'V'),
      -- ─── MOBILE_SALES ────────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_SALES', 'V,C,E'),
      ('ROLE_FARM_MGR',   'MOBILE_SALES', 'V,C,E'),
      ('ROLE_SALES_MGR',  'MOBILE_SALES', 'V,C,E'),
      ('ROLE_SALES_REP',  'MOBILE_SALES', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_SALES', 'V'),
      ('ROLE_WMS_MGR',    'MOBILE_SALES', 'V'),
      ('ROLE_LOG_MGR',    'MOBILE_SALES', 'V'),
      ('ROLE_REGION_MGR', 'MOBILE_SALES', 'V'),
      ('ROLE_STORE_MGR',  'MOBILE_SALES', 'V'),
      ('ROLE_FIN_CFO',    'MOBILE_SALES', 'V'),
      ('ROLE_FIN_ACCT',   'MOBILE_SALES', 'V'),
      ('ROLE_FIN_COST',   'MOBILE_SALES', 'V'),
      ('ROLE_CASHIER',    'MOBILE_SALES', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_SALES', 'V'),
      -- ─── MOBILE_MEDICINE ─────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_MEDICINE', 'V,C,E'),
      ('ROLE_FARM_MGR',   'MOBILE_MEDICINE', 'V,C,E'),
      ('ROLE_VET',        'MOBILE_MEDICINE', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_MEDICINE', 'V'),
      ('ROLE_QA_MGR',     'MOBILE_MEDICINE', 'V'),
      ('ROLE_STORE_MGR',  'MOBILE_MEDICINE', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_MEDICINE', 'V'),
      -- ─── MOBILE_DELIVERY ─────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_DELIVERY', 'V,C,E'),
      ('ROLE_LOG_MGR',    'MOBILE_DELIVERY', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_DELIVERY', 'V'),
      ('ROLE_WMS_MGR',    'MOBILE_DELIVERY', 'V'),
      ('ROLE_FARM_MGR',   'MOBILE_DELIVERY', 'V'),
      ('ROLE_STORE_MGR',  'MOBILE_DELIVERY', 'V'),
      ('ROLE_SALES_MGR',  'MOBILE_DELIVERY', 'V'),
      ('ROLE_REGION_MGR', 'MOBILE_DELIVERY', 'V'),
      ('ROLE_DRIVER',     'MOBILE_DELIVERY', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_DELIVERY', 'V'),
      -- ─── MOBILE_TERMINAL ─────────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_TERMINAL', 'V,C,E'),
      ('ROLE_PKG_MGR',    'MOBILE_TERMINAL', 'V,C,E'),
      ('ROLE_PKG_OP',     'MOBILE_TERMINAL', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_TERMINAL', 'V'),
      ('ROLE_FARM_MGR',   'MOBILE_TERMINAL', 'V'),
      ('ROLE_QA_MGR',     'MOBILE_TERMINAL', 'V'),
      -- ─── MOBILE_PROCUREMENT ──────────────────────────────────────────
      ('ROLE_ADMIN',      'MOBILE_PROCUREMENT', 'V,C,E'),
      ('ROLE_REGION_MGR', 'MOBILE_PROCUREMENT', 'V,C,E'),
      ('ROLE_CEO',        'MOBILE_PROCUREMENT', 'V,C,E'),
      ('ROLE_FIN_ACCT',   'MOBILE_PROCUREMENT', 'V,C,E'),
      ('ROLE_FIN_CFO',    'MOBILE_PROCUREMENT', 'V,C,E'),
      ('ROLE_PRC_BUYER',  'MOBILE_PROCUREMENT', 'V'),
      ('ROLE_AUDITOR',    'MOBILE_PROCUREMENT', 'V'),
      ('ROLE_STORE_MGR',  'MOBILE_PROCUREMENT', 'V')
    ) AS t(role_code, menu_code, perm_codes)
  ) LOOP
    -- 解析 role_id（角色不存在则跳过）
    SELECT role_id INTO v_role_id FROM sys_role WHERE role_code = v_rec.role_code LIMIT 1;
    IF v_role_id IS NULL THEN CONTINUE; END IF;

    -- 解析 menu_id（菜单不存在则跳过）
    SELECT menu_id INTO v_menu_id FROM sys_menu WHERE menu_code = v_rec.menu_code LIMIT 1;
    IF v_menu_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
    VALUES (v_role_id, v_menu_id, v_rec.perm_codes)
    ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;
  END LOOP;
END;
$$;

-- ── 3. 采购单 org 隔离性能索引 ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_prc_po_store_code ON prc_purchase_orders (store_code);

-- ── 完成 ──────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE 'v12_mobile_rbac_dynamic: MOBILE_* sys_menu entries and role permissions seeded successfully.';
END; $$;
