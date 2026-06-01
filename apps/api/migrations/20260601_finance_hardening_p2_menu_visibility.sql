-- ============================================================
-- Finance Runtime Hardening P2 — 财务菜单可见性补齐（DB 侧）
--
-- 背景：API 放行(403)由静态矩阵 rbac.matrix.ts 决定（本阶段已修）；
--       但【前端侧边栏菜单可见性】由 sys_role_menu_permission 在登录时构建。
-- 缺口：① 朱召安(ROLE_CASH) 在 DB 无任何财务菜单授权 → 看不到资金菜单
--       ② 刘杰(ROLE_HQ_FINANCE) DB 缺 MENU_FIN2_EXPENSE → 看不到费用菜单
--
-- 本迁移仅【additive 幂等】补这两处缺口，perm_codes 与静态矩阵一致；
-- 【绝不 UPDATE/删除】任何已有授权行（ON CONFLICT DO NOTHING）。
-- role_id/menu_id 经 code 关联，跨环境可移植。
-- ============================================================
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.perms
FROM (VALUES
  ('ROLE_CASH',       'MENU_FIN2_CASH',    'V,E'),    -- 出纳：资金账户查看 + 付款/现金执行（与矩阵一致）
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_EXPENSE', 'V,A,X')   -- 审核者：费用查看 + 审核 + 导出（与矩阵一致）
) AS v(role_code, menu_code, perms)
JOIN sys_role r ON r.role_code = v.role_code
JOIN sys_menu m ON m.menu_code = v.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;
