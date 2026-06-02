-- ════════════════════════════════════════════════════════════════════════
-- Finance Authority Reconstruction Phase 2 — B. ShareholderScope + 成本核算经理角色
-- ────────────────────────────────────────────────────────────────────────
-- 刘汉涛（财务分析与核算经理）：组织范围不使用 GROUP/全集团 DataScope，
--   核心数据范围由 ShareholderScope 按项目控制（赵永伟体系三项目）。
--   岗位：ROLE_FINANCE_ANALYST + ROLE_COST_ACCOUNTING_MANAGER（成本核算经理，本迁移新建）。
--
-- ShareholderScope（shr_shareholder_scopes，PROJECT 级）：
--   SHR-DONGPENG-LAYER / SHR-MENGSAI-LAYER / SHR-VTE-FOOD
--   can_view_finance/operation/dividend=TRUE；can_approve=FALSE（分析人，不审批）。
--
-- 幂等：角色 ON CONFLICT(role_code)；user_role ON CONFLICT(user_id,role_id)；scope WHERE NOT EXISTS。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 新建成本核算经理角色 ───────────────────────────────────────────────
INSERT INTO sys_role (role_code, role_name_zh, role_type, approval_level, description)
VALUES
  ('ROLE_COST_ACCOUNTING_MANAGER', '成本核算经理', 'FINANCE', 1,
   '集团财务中心·财务分析与核算组岗位。职责：成本核算、利润核算、项目经营分析、投资回报分析。'
   || '允许：查看利润/成本/经营数据、项目收益分析、资本流。禁止：付款、审核财务单据、修改财务单据、股权调整、系统管理。'
   || '审批链定位：核算人，不是审核人不是付款人。')
ON CONFLICT (role_code) DO NOTHING;

-- ── 2. 绑定刘汉涛 → 成本核算经理（保留 ROLE_FINANCE_ANALYST 主角色）─────────
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, FALSE, NOW()
FROM sys_user u, sys_role r
WHERE u.username = 'liuhantao' AND r.role_code = 'ROLE_COST_ACCOUNTING_MANAGER'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ── 3. 刘汉涛 ShareholderScope：三项目（PROJECT 级）─────────────────────────
INSERT INTO shr_shareholder_scopes
  (user_id, shareholder_code, scope_type, scope_code, project_code,
   can_view_finance, can_view_operation, can_view_dividend, can_approve, status)
SELECT u.user_id, NULL, 'PROJECT', NULL, v.project_code,
       TRUE, TRUE, TRUE, FALSE, 'ACTIVE'
FROM (VALUES
  ('liuhantao', 'SHR-DONGPENG-LAYER'),
  ('liuhantao', 'SHR-MENGSAI-LAYER'),
  ('liuhantao', 'SHR-VTE-FOOD')
) AS v(username, project_code)
JOIN sys_user u ON u.username = v.username
WHERE NOT EXISTS (
  SELECT 1 FROM shr_shareholder_scopes s
  WHERE s.user_id = u.user_id AND s.scope_type = 'PROJECT'
    AND COALESCE(s.project_code,'') = v.project_code
    AND s.shareholder_code IS NULL
);

-- ── 4. 成本核算经理前端菜单可见性（成本/利润/分析/股东）─────────────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.perms
FROM (VALUES
  ('ROLE_COST_ACCOUNTING_MANAGER', 'MENU_FIN2',                  'V,X'),
  ('ROLE_COST_ACCOUNTING_MANAGER', 'MENU_FIN2_REPORT',           'V,X'),
  ('ROLE_COST_ACCOUNTING_MANAGER', 'MENU_FIN2_BUDGET',           'V,X'),
  ('ROLE_COST_ACCOUNTING_MANAGER', 'MENU_SHAREHOLDER_VIEW',      'V,X'),
  ('ROLE_COST_ACCOUNTING_MANAGER', 'MENU_SHAREHOLDER_DASHBOARD', 'V,X'),
  ('ROLE_COST_ACCOUNTING_MANAGER', 'MENU_SHAREHOLDER_CAPITAL',   'V,C,E,X'),
  ('ROLE_COST_ACCOUNTING_MANAGER', 'MENU_DASHBOARD',             'V,X')
) AS v(role_code, menu_code, perms)
JOIN sys_role r ON r.role_code = v.role_code
JOIN sys_menu m ON m.menu_code = v.menu_code
ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

COMMIT;
