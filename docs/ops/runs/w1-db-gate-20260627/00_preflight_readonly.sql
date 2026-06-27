-- ════════════════════════════════════════════════════════════════════════
-- W1 DB Gate · S0 只读预检（在生产 DB 上跑，纯 SELECT，零写入）
-- 目的：apply 迁移前，确认目标 DB 的迁移状态 / 原子菜单缺口 / 粗授予残留。
-- 用法（生产，只读，SSH 并发 1）：
--   docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f - < 00_preflight_readonly.sql
-- ════════════════════════════════════════════════════════════════════════

\echo '── 1) TypeORM migrations 表：两条关键迁移是否已执行 ──'
SELECT name FROM migrations
 WHERE name IN ('SeedSettingsOperationalAtomicMenus1782047418112',
                'RepairRolePermissionMatrixAtomicity1782052418112')
 ORDER BY name;
-- 期望：apply 前应为 0 行（未执行）；若已存在则该迁移已跑过，勿重复。

\echo '── 2) migrations 表总数（确认链路是否在用 TypeORM 元数据表） ──'
SELECT count(*) AS migrations_rows FROM migrations;
-- 若为 0，说明该环境 TypeORM 迁移历史为空（Batch2 提示的风险）→ 先查清部署链是否走过桥接。

\echo '── 3) 关键原子 sys_menu 行是否已存在（迁移会补；确认缺口） ──'
SELECT menu_code,
       (menu_code IN (SELECT menu_code FROM sys_menu)) AS present
FROM (VALUES
  ('MENU_FIN2_DASHBOARD'),('MENU_FIN2_CASH_VIEW'),('MENU_FIN2_CASH_TRANSFER'),
  ('MENU_FIN2_AR_LEDGER'),('MENU_PRC2_DASHBOARD'),('MENU_WORKFLOW_TODO')
) AS t(menu_code);
-- present=false 的即迁移 up() 将补的行。

\echo '── 4) 非 ADMIN 角色 × 6 粗父菜单 残留授予（W1 要清的目标） ──'
SELECT menu_code, count(*) AS non_admin_roles
FROM sys_role_menu_permission
WHERE menu_code IN ('MENU_FIN2','MENU_PRC2','MENU_PRC2_MASTER',
                    'MENU_WORKFLOW','MENU_MASTER','MENU_SETTINGS_IT')
  AND role_code <> 'ROLE_ADMIN'
GROUP BY menu_code ORDER BY menu_code;
-- 记录这组基线计数；apply 后步骤 02_verify 应全部归 0。

\echo '── 5) 5 主体角色当前授权行数（验收基线） ──'
SELECT role_code, count(*) AS grants
FROM sys_role_menu_permission
WHERE role_code IN ('ROLE_PRC_BUYER','ROLE_HQ_FINANCE','ROLE_FIN_ACCT',
                    'ROLE_FINANCE_REVIEW_MANAGER','ROLE_ADMIN')
GROUP BY role_code ORDER BY role_code;
