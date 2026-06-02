-- ════════════════════════════════════════════════════════════════════════
-- Finance Authority Reconstruction Phase 2 — A. DataScope 公司范围绑定 + scope 规则
-- ────────────────────────────────────────────────────────────────────────
-- 权限模型升级：岗位权限 + DataScope + ShareholderScope，缺一不可。
-- 本迁移解决「公司权限」：财务表(fin_*)仅含 company_code 维度，须给用户绑定 COMPANY 组织。
--
-- 重要：DataScopeService.resolve() 遍历 sys_user_orgs，仅从 org.company_code 非空的节点取范围；
--   SITE 节点 company_code 为空且无 COMPANY 子节点 → 取不到公司 → 看不到数据。
--   故财务用户必须绑 COMPANY 级组织（company_code 非空）。
--
-- 公司归属：孟赛→COMP-LAO-AGRI；东鹏→COMP-LAO-XINGCHI；万象→COMP-LAO-FOOD。
--   刘杰(审核经理)   → 三家公司（审核全集团财务）
--   王玮华(资金经理) → COMP-LAO-AGRI（仅孟赛资金，禁东鹏/万象）
--   朱召安(资金专员) → COMP-LAO-XINGCHI（仅东鹏资金，禁孟赛/万象）
--   刘汉涛(分析经理) → 三家公司（其三项目对应公司的利润/成本分析；非 GROUP 全集团）
--
-- sys_data_scopes：为财务岗位角色×财务菜单显式定义 scope_type=COMPANY，
--   确保 topLevel=COMPANY（非 GROUP，否则 isGlobal 越权）。
--
-- 幂等：user_orgs ON CONFLICT(user_id,org_id) DO UPDATE；data_scopes WHERE NOT EXISTS。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 财务用户绑定 COMPANY 组织（DataScope 公司范围）─────────────────────
INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code, position_title, is_manager)
SELECT u.user_id, o.id, FALSE, 'COMPANY', o.org_code, v.title, FALSE
FROM (VALUES
  ('liujie',     'COMP-LAO-AGRI',    '财务审核经理·凤凰农业'),
  ('liujie',     'COMP-LAO-XINGCHI', '财务审核经理·星驰养鸡'),
  ('liujie',     'COMP-LAO-FOOD',    '财务审核经理·凤凰食品'),
  ('wangweihua', 'COMP-LAO-AGRI',    '资金经理·孟赛(凤凰农业)'),
  ('zhuzhao_an', 'COMP-LAO-XINGCHI', '资金专员·东鹏(星驰养鸡)'),
  ('liuhantao',  'COMP-LAO-AGRI',    '财务分析经理·凤凰农业'),
  ('liuhantao',  'COMP-LAO-XINGCHI', '财务分析经理·星驰养鸡'),
  ('liuhantao',  'COMP-LAO-FOOD',    '财务分析经理·凤凰食品')
) AS v(username, org_code, title)
JOIN sys_user u ON u.username = v.username
JOIN sys_organizations o ON o.org_code = v.org_code
ON CONFLICT (user_id, org_id) DO UPDATE SET data_scope_level = 'COMPANY', position_title = EXCLUDED.position_title;

-- ── 2. sys_data_scopes：财务岗位角色×财务菜单 = COMPANY 级（防 GROUP 越权）──
INSERT INTO sys_data_scopes (role_code, module_code, scope_type, enabled)
SELECT v.role_code, v.module_code, 'COMPANY', true
FROM (VALUES
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_AP'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_AR'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_CASH'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_EXPENSE'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_REIMBURSE'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_REPORT'),
  ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_BUDGET'),
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2'),
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2_CASH'),
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2_AP'),
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2_AR'),
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2_EXPENSE'),
  ('ROLE_TREASURY_MANAGER', 'MENU_FIN2_REIMBURSE'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_AP'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_AR'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_EXPENSE'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_REPORT'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_BUDGET'),
  ('ROLE_FINANCE_ANALYST', 'MENU_FIN2_SHAREHOLDER')
) AS v(role_code, module_code)
WHERE NOT EXISTS (
  SELECT 1 FROM sys_data_scopes d
  WHERE d.role_code = v.role_code AND d.module_code = v.module_code
);

COMMIT;
