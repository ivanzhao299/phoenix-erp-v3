-- DDL 18: 移动端权限接入数据库（幂等）
-- 将 mobile-roles.ts 的 PAGE_PERMS 矩阵迁移为 sys_menu + sys_role_menu_permission 数据
-- 规则：write → perm_codes='V,C'  /  read → perm_codes='V'
-- 缺失角色（如 ROLE_BREEDER 尚未入库）通过 JOIN 自动跳过，不报错

-- ① 注册移动端菜单（MOBILE domain）
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order)
VALUES
  ('MOBILE_DASHBOARD', '每日看板（移动）',   'MOBILE', 10),
  ('MOBILE_FEED',      '饲料台账（移动）',   'MOBILE', 20),
  ('MOBILE_MORTALITY', '死淘快录（移动）',   'MOBILE', 30),
  ('MOBILE_EGGLOG',    '产蛋录入（移动）',   'MOBILE', 40),
  ('MOBILE_HENREPORT', '存栏日报（移动）',   'MOBILE', 50),
  ('MOBILE_ANALYTICS', '生产趋势（移动）',   'MOBILE', 60),
  ('MOBILE_PACKAGING', '包装统计（移动）',   'MOBILE', 70),
  ('MOBILE_QUALITY',   '品质检测（移动）',   'MOBILE', 80),
  ('MOBILE_EGG',       '鸡蛋台账（移动）',   'MOBILE', 90),
  ('MOBILE_SALES',     '销售出库（移动）',   'MOBILE', 100),
  ('MOBILE_MEDICINE',  '药品台账（移动）',   'MOBILE', 110),
  ('MOBILE_DELIVERY',  '配送签收（移动）',   'MOBILE', 120)
ON CONFLICT (menu_code) DO NOTHING;

-- ② 按 mobile-roles.ts PAGE_PERMS 矩阵批量写入角色-菜单权限
-- write 角色 → perm_codes='V,C' / read 角色 → perm_codes='V'
-- 通过 JOIN 查 role_id/menu_id，缺失角色自动跳过，ON CONFLICT 幂等

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, x.perm_codes
FROM (VALUES
  -- ── MOBILE_DASHBOARD（所有管理类角色只读）─────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_DASHBOARD', 'V'),
  ('ROLE_CEO',      'MOBILE_DASHBOARD', 'V'),
  ('ROLE_FARM_MGR', 'MOBILE_DASHBOARD', 'V'),
  ('ROLE_VET',      'MOBILE_DASHBOARD', 'V'),
  ('ROLE_QA_MGR',   'MOBILE_DASHBOARD', 'V'),
  ('ROLE_WMS_MGR',  'MOBILE_DASHBOARD', 'V'),
  ('ROLE_PKG_MGR',  'MOBILE_DASHBOARD', 'V'),
  ('ROLE_LOG_MGR',  'MOBILE_DASHBOARD', 'V'),
  ('ROLE_STORE_MGR','MOBILE_DASHBOARD', 'V'),
  ('ROLE_FIN_CFO',  'MOBILE_DASHBOARD', 'V'),
  ('ROLE_FIN_ACCT', 'MOBILE_DASHBOARD', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_DASHBOARD', 'V'),
  ('ROLE_SALES_REP','MOBILE_DASHBOARD', 'V'),
  ('ROLE_SALES_MGR','MOBILE_DASHBOARD', 'V'),

  -- ── MOBILE_FEED（饲料台账）────────────────────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_FEED', 'V,C'),
  ('ROLE_FARM_MGR', 'MOBILE_FEED', 'V,C'),
  ('ROLE_VET',      'MOBILE_FEED', 'V,C'),
  ('ROLE_CEO',      'MOBILE_FEED', 'V'),
  ('ROLE_WMS_MGR',  'MOBILE_FEED', 'V'),
  ('ROLE_LOG_MGR',  'MOBILE_FEED', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_FEED', 'V'),

  -- ── MOBILE_MORTALITY（死淘快录）──────────────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_MORTALITY', 'V,C'),
  ('ROLE_FARM_MGR', 'MOBILE_MORTALITY', 'V,C'),
  ('ROLE_VET',      'MOBILE_MORTALITY', 'V,C'),
  ('ROLE_CEO',      'MOBILE_MORTALITY', 'V'),
  ('ROLE_QA_MGR',   'MOBILE_MORTALITY', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_MORTALITY', 'V'),

  -- ── MOBILE_EGGLOG（产蛋录入）─────────────────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_EGGLOG', 'V,C'),
  ('ROLE_FARM_MGR', 'MOBILE_EGGLOG', 'V,C'),
  ('ROLE_VET',      'MOBILE_EGGLOG', 'V,C'),
  ('ROLE_CEO',      'MOBILE_EGGLOG', 'V'),
  ('ROLE_WMS_MGR',  'MOBILE_EGGLOG', 'V'),
  ('ROLE_QA_MGR',   'MOBILE_EGGLOG', 'V'),
  ('ROLE_FIN_CFO',  'MOBILE_EGGLOG', 'V'),
  ('ROLE_FIN_ACCT', 'MOBILE_EGGLOG', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_EGGLOG', 'V'),

  -- ── MOBILE_HENREPORT（存栏日报）──────────────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_HENREPORT', 'V,C'),
  ('ROLE_FARM_MGR', 'MOBILE_HENREPORT', 'V,C'),
  ('ROLE_CEO',      'MOBILE_HENREPORT', 'V'),
  ('ROLE_VET',      'MOBILE_HENREPORT', 'V'),
  ('ROLE_QA_MGR',   'MOBILE_HENREPORT', 'V'),
  ('ROLE_WMS_MGR',  'MOBILE_HENREPORT', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_HENREPORT', 'V'),

  -- ── MOBILE_ANALYTICS（生产趋势，全员只读）────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_ANALYTICS', 'V'),
  ('ROLE_CEO',      'MOBILE_ANALYTICS', 'V'),
  ('ROLE_FARM_MGR', 'MOBILE_ANALYTICS', 'V'),
  ('ROLE_VET',      'MOBILE_ANALYTICS', 'V'),
  ('ROLE_QA_MGR',   'MOBILE_ANALYTICS', 'V'),
  ('ROLE_WMS_MGR',  'MOBILE_ANALYTICS', 'V'),
  ('ROLE_FIN_CFO',  'MOBILE_ANALYTICS', 'V'),
  ('ROLE_FIN_ACCT', 'MOBILE_ANALYTICS', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_ANALYTICS', 'V'),

  -- ── MOBILE_PACKAGING（包装统计）──────────────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_PACKAGING', 'V,C'),
  ('ROLE_FARM_MGR', 'MOBILE_PACKAGING', 'V,C'),
  ('ROLE_PKG_MGR',  'MOBILE_PACKAGING', 'V,C'),
  ('ROLE_CEO',      'MOBILE_PACKAGING', 'V'),
  ('ROLE_QA_MGR',   'MOBILE_PACKAGING', 'V'),
  ('ROLE_WMS_MGR',  'MOBILE_PACKAGING', 'V'),
  ('ROLE_LOG_MGR',  'MOBILE_PACKAGING', 'V'),
  ('ROLE_FIN_CFO',  'MOBILE_PACKAGING', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_PACKAGING', 'V'),

  -- ── MOBILE_QUALITY（品质检测）────────────────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_QUALITY', 'V,C'),
  ('ROLE_FARM_MGR', 'MOBILE_QUALITY', 'V,C'),
  ('ROLE_QA_MGR',   'MOBILE_QUALITY', 'V,C'),
  ('ROLE_VET',      'MOBILE_QUALITY', 'V,C'),
  ('ROLE_CEO',      'MOBILE_QUALITY', 'V'),
  ('ROLE_PKG_MGR',  'MOBILE_QUALITY', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_QUALITY', 'V'),

  -- ── MOBILE_EGG（鸡蛋台账）───────────────────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_EGG', 'V,C'),
  ('ROLE_FARM_MGR', 'MOBILE_EGG', 'V,C'),
  ('ROLE_WMS_MGR',  'MOBILE_EGG', 'V,C'),
  ('ROLE_CEO',      'MOBILE_EGG', 'V'),
  ('ROLE_VET',      'MOBILE_EGG', 'V'),
  ('ROLE_QA_MGR',   'MOBILE_EGG', 'V'),
  ('ROLE_PKG_MGR',  'MOBILE_EGG', 'V'),
  ('ROLE_SALES_MGR','MOBILE_EGG', 'V'),
  ('ROLE_SALES_REP','MOBILE_EGG', 'V'),
  ('ROLE_FIN_CFO',  'MOBILE_EGG', 'V'),
  ('ROLE_FIN_ACCT', 'MOBILE_EGG', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_EGG', 'V'),

  -- ── MOBILE_SALES（销售出库）──────────────────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_SALES', 'V,C'),
  ('ROLE_FARM_MGR', 'MOBILE_SALES', 'V,C'),
  ('ROLE_SALES_MGR','MOBILE_SALES', 'V,C'),
  ('ROLE_SALES_REP','MOBILE_SALES', 'V,C'),
  ('ROLE_CEO',      'MOBILE_SALES', 'V'),
  ('ROLE_WMS_MGR',  'MOBILE_SALES', 'V'),
  ('ROLE_LOG_MGR',  'MOBILE_SALES', 'V'),
  ('ROLE_FIN_CFO',  'MOBILE_SALES', 'V'),
  ('ROLE_FIN_ACCT', 'MOBILE_SALES', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_SALES', 'V'),

  -- ── MOBILE_MEDICINE（药品台账）──────────────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_MEDICINE', 'V,C'),
  ('ROLE_FARM_MGR', 'MOBILE_MEDICINE', 'V,C'),
  ('ROLE_VET',      'MOBILE_MEDICINE', 'V,C'),
  ('ROLE_CEO',      'MOBILE_MEDICINE', 'V'),
  ('ROLE_QA_MGR',   'MOBILE_MEDICINE', 'V'),
  ('ROLE_STORE_MGR','MOBILE_MEDICINE', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_MEDICINE', 'V'),

  -- ── MOBILE_DELIVERY（配送签收）──────────────────────────────────────────
  ('ROLE_ADMIN',    'MOBILE_DELIVERY', 'V,C'),
  ('ROLE_LOG_MGR',  'MOBILE_DELIVERY', 'V,C'),
  ('ROLE_CEO',      'MOBILE_DELIVERY', 'V'),
  ('ROLE_WMS_MGR',  'MOBILE_DELIVERY', 'V'),
  ('ROLE_STORE_MGR','MOBILE_DELIVERY', 'V'),
  ('ROLE_SALES_MGR','MOBILE_DELIVERY', 'V'),
  ('ROLE_AUDITOR',  'MOBILE_DELIVERY', 'V')

) AS x(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = x.role_code
JOIN sys_menu  m ON m.menu_code = x.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ③ 验证写入结果
SELECT
  m.menu_code,
  COUNT(*) FILTER (WHERE rmp.perm_codes = 'V,C') AS write_roles,
  COUNT(*) FILTER (WHERE rmp.perm_codes = 'V')   AS read_roles,
  COUNT(*) AS total
FROM sys_menu m
JOIN sys_role_menu_permission rmp ON rmp.menu_id = m.menu_id
WHERE m.domain = 'MOBILE'
GROUP BY m.menu_code
ORDER BY MIN(m.sort_order);
