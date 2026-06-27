-- ════════════════════════════════════════════════════════════════════════
-- W1 DB Gate · S1 后检（apply 迁移后跑，只读验证绿灯判据）
-- ════════════════════════════════════════════════════════════════════════

\echo '── A) 两条迁移应已登记 ──'
SELECT name FROM migrations
 WHERE name IN ('SeedSettingsOperationalAtomicMenus1782047418112',
                'RepairRolePermissionMatrixAtomicity1782052418112')
 ORDER BY name;
-- 期望：2 行。

\echo '── B) 非 ADMIN × 6 粗父菜单 残留 = 0（核心绿灯） ──'
SELECT count(*) AS coarse_non_admin_grants
FROM sys_role_menu_permission
WHERE menu_code IN ('MENU_FIN2','MENU_PRC2','MENU_PRC2_MASTER',
                    'MENU_WORKFLOW','MENU_MASTER','MENU_SETTINGS_IT')
  AND role_code <> 'ROLE_ADMIN';
-- 期望：0。

\echo '── C) 关键原子菜单行已补齐 ──'
SELECT count(*) AS atomic_menu_present FROM sys_menu
WHERE menu_code IN ('MENU_FIN2_DASHBOARD','MENU_FIN2_CASH_VIEW','MENU_FIN2_CASH_TRANSFER',
                    'MENU_FIN2_AR_LEDGER','MENU_PRC2_DASHBOARD');
-- 期望：5。

\echo '── D) D3 修复：审核经理/分析师 资金子菜单可见 ──'
SELECT role_code, menu_code, perm_codes FROM sys_role_menu_permission
WHERE role_code IN ('ROLE_FINANCE_REVIEW_MANAGER','ROLE_FINANCE_ANALYST')
  AND menu_code LIKE 'MENU_FIN2_CASH%' ORDER BY role_code, menu_code;
-- 期望：能查到 _VIEW 派生（若迁移覆盖了 D3）；若为空则 D3 仍需单独补。

\echo '── E) ADMIN 仍持粗菜单（豁免，未误删） ──'
SELECT count(*) AS admin_coarse FROM sys_role_menu_permission
WHERE role_code = 'ROLE_ADMIN'
  AND menu_code IN ('MENU_FIN2','MENU_PRC2','MENU_WORKFLOW','MENU_MASTER','MENU_SETTINGS_IT');
-- 期望：>0（ADMIN 不应被清）。
