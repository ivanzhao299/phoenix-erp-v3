-- DEPRECATED 2026-06-27: 作废,统一走迁移 1782052418112 + docs/ops/runs/w1-db-gate-20260627/
-- ════════════════════════════════════════════════════════════════════════
-- 【草案·未执行·需 Gate】粗父菜单清零 — 撤销非 ADMIN 角色的 6 粗父菜单授予
-- 批次：RBAC 父权限清账 2026-06-27（任务1 执行候选）
-- ⚠️ 故意放在 docs/ops/runs/ 而非 apps/api/migrations/：生产 Deploy 只跑
--    apps/api/migrations/2026*.sql，本文件不会被自动执行。
-- ⚠️ 执行前置（缺一不可）：
--    1) 先跑 scripts/ops/audit-role-permission-matrix.mjs 取 live 残留清单；
--    2) pg_dump 备份 sys_role_menu_permission；
--    3) 走 APPROVE_RBAC_COARSE_MENU_REVOKE_EXECUTION Gate。
-- 依据：后端控制器已全切原子子码，粗父码对接口已无效（见审计报告 §2/§7）；
--       前端组头粗码已替换为原子代表码（Sidebar.tsx 本批已改），故撤销低风险。
-- ════════════════════════════════════════════════════════════════════════

-- ── 预检：撤销前残留计数（应与 audit 脚本一致）──────────────────────────
SELECT menu_code, count(*) AS non_admin_roles
FROM sys_role_menu_permission
WHERE menu_code IN ('MENU_FIN2','MENU_PRC2','MENU_PRC2_MASTER',
                    'MENU_WORKFLOW','MENU_MASTER','MENU_SETTINGS_IT')
  AND role_code <> 'ROLE_ADMIN'
GROUP BY menu_code
ORDER BY menu_code;

-- ── 撤销（执行候选；ADMIN 豁免保留）────────────────────────────────────
-- BEGIN;  -- 解开注释方可执行；务必在已批准 + 已备份后
-- DELETE FROM sys_role_menu_permission
--  WHERE menu_code IN ('MENU_FIN2','MENU_PRC2','MENU_PRC2_MASTER',
--                      'MENU_WORKFLOW','MENU_MASTER','MENU_SETTINGS_IT')
--    AND role_code <> 'ROLE_ADMIN';
-- COMMIT;

-- ── 后检：应为 0 行 ────────────────────────────────────────────────────
-- SELECT count(*) FROM sys_role_menu_permission
--  WHERE menu_code IN ('MENU_FIN2','MENU_PRC2','MENU_PRC2_MASTER',
--                      'MENU_WORKFLOW','MENU_MASTER','MENU_SETTINGS_IT')
--    AND role_code <> 'ROLE_ADMIN';

-- ── Rollback ───────────────────────────────────────────────────────────
-- 从执行前 pg_dump 备份恢复对应行；或保留撤销前 SELECT 输出，按 (role_code,
-- menu_code, perm_codes) 重新 INSERT。撤销务必在单事务内并先确认 audit 残留清单。