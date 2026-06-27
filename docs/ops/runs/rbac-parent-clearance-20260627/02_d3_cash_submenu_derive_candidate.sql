-- ════════════════════════════════════════════════════════════════════════
-- 【草案·未执行·需 Gate】修 D3 — 资金子菜单派生名单补 REVIEW_MANAGER / ANALYST
-- 批次：RBAC 父权限清账 2026-06-27（任务4 drift D3）
-- ⚠️ 放 docs/ops/runs/，不会被生产 Deploy 自动执行。
--
-- 问题：20260608_g35_fin_cash_menu_granularity.sql 仅对 6 角色
--       (ADMIN/CASH/FIN_ACCT/FIN_CFO/HQ_FINANCE/TREASURY_MANAGER) 把父码
--       MENU_FIN2_CASH 派生到 _VIEW/_MASTER/_TXN/_TRANSFER。
--       ROLE_FINANCE_REVIEW_MANAGER / ROLE_FINANCE_ANALYST 持父码 FIN2_CASH(V,X)
--       却未派生 → 侧栏"资金账户/资金调拨"不显示、GET /cash/accounts 403。
-- 修法：与 g23（任意持父码角色派生）同逻辑，给这两个角色派生只读 _VIEW
--       （审核/分析仅需查看；调拨 _TRANSFER 仅 REVIEW_MANAGER 视业务确认）。
-- ════════════════════════════════════════════════════════════════════════

-- 资金账户查看（_VIEW:V）——审核经理 + 分析师
-- INSERT INTO sys_role_menu_permission (role_code, menu_code, perm_codes)
-- VALUES
--   ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_CASH_VIEW', 'V,X'),
--   ('ROLE_FINANCE_ANALYST',        'MENU_FIN2_CASH_VIEW', 'V,X')
-- ON CONFLICT (role_code, menu_code) DO UPDATE
--   SET perm_codes = EXCLUDED.perm_codes;

-- 资金调拨查看（_TRANSFER:V）——仅审核经理；是否给需业务确认
-- INSERT INTO sys_role_menu_permission (role_code, menu_code, perm_codes)
-- VALUES ('ROLE_FINANCE_REVIEW_MANAGER', 'MENU_FIN2_CASH_TRANSFER', 'V')
-- ON CONFLICT (role_code, menu_code) DO UPDATE
--   SET perm_codes = EXCLUDED.perm_codes;

-- ── 后检：应能查到派生行 ───────────────────────────────────────────────
-- SELECT role_code, menu_code, perm_codes FROM sys_role_menu_permission
--  WHERE role_code IN ('ROLE_FINANCE_REVIEW_MANAGER','ROLE_FINANCE_ANALYST')
--    AND menu_code LIKE 'MENU_FIN2_CASH%' ORDER BY role_code, menu_code;

-- ── Rollback ───────────────────────────────────────────────────────────
-- DELETE FROM sys_role_menu_permission
--  WHERE role_code IN ('ROLE_FINANCE_REVIEW_MANAGER','ROLE_FINANCE_ANALYST')
--    AND menu_code IN ('MENU_FIN2_CASH_VIEW','MENU_FIN2_CASH_TRANSFER');
-- 注：ON CONFLICT DO UPDATE 会覆盖既有 perm_codes，rollback 前请确认这两角色
--     原本无这两个子码（审计显示无），否则改用备份恢复。
