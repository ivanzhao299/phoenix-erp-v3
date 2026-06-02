-- ════════════════════════════════════════════════════════════════════════
-- Finance Authority Reconstruction Phase 1 — C. 三岗位角色前端菜单可见性
-- ────────────────────────────────────────────────────────────────────────
-- sys_role_menu_permission 控制登录后侧边栏菜单可见性，与 rbac.matrix.ts(API授权) 对应同步。
-- 驾驶舱映射：
--   集团财务驾驶舱 → MENU_DASHBOARD + MENU_FIN2 + MENU_FIN2_REPORT（刘杰）
--   资金驾驶舱     → MENU_FIN2_CASH + MENU_DASHBOARD（王玮华/朱召安；东鹏范围由 DataScope 控制）
--   集团经营/股东/项目利润驾驶舱 → MENU_DASHBOARD + MENU_SHAREHOLDER_DASHBOARD + MENU_FIN2_REPORT（刘汉涛）
--
-- 幂等：ON CONFLICT (role_id, menu_id) DO UPDATE。菜单不存在则 JOIN 自然跳过。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.perms
FROM (VALUES
  -- ── 财务审核经理（刘杰）：查看全部 + 审核，禁付款/银行账户操作 ──
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2',                   'V,A,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_AP',                'V,A,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_AR',                'V,A,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_CASH',              'V,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_EXPENSE',           'V,A,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_REIMBURSE',         'V,A,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_BUDGET',            'V,A,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_REPORT',            'V,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_SHAREHOLDER',       'V,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_SHAREHOLDER_VIEW',       'V,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_SHAREHOLDER_DASHBOARD',  'V,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_SHAREHOLDER_CAPITAL',    'V,X'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_DASHBOARD',              'V,X'),

  -- ── 资金经理（王玮华/朱召安）：资金账户付款，禁审核 ──
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2',                'V'),
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2_CASH',           'V,C,E,X'),
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2_AP',             'V'),
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2_AR',             'V'),
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2_EXPENSE',        'V'),
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2_REIMBURSE',      'V,E'),
  ('ROLE_TREASURY_MANAGER', 'MENU_DASHBOARD',           'V,X'),

  -- ── 财务分析经理（刘汉涛）：核算分析 + 资本流录入，禁付款/审核 ──
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2',                  'V,X'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_AP',               'V,X'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_AR',               'V,X'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_EXPENSE',          'V,X'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_REPORT',           'V,X'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_BUDGET',           'V,X'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_SHAREHOLDER',      'V,X'),
  ('ROLE_FINANCE_ANALYST', 'MENU_SHAREHOLDER_VIEW',      'V,X'),
  ('ROLE_FINANCE_ANALYST', 'MENU_SHAREHOLDER_DASHBOARD', 'V,X'),
  ('ROLE_FINANCE_ANALYST', 'MENU_SHAREHOLDER_CAPITAL',   'V,C,E,X'),
  ('ROLE_FINANCE_ANALYST', 'MENU_DASHBOARD',             'V,X')
) AS v(role_code, menu_code, perms)
JOIN sys_role r ON r.role_code = v.role_code
JOIN sys_menu m ON m.menu_code = v.menu_code
ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

COMMIT;
