-- ════════════════════════════════════════════════════════════════════════
-- G55：收口财务角色「验收试运行(MENU_UAT)」越权
-- ════════════════════════════════════════════════════════════════════════
-- 审计背景（刘杰 liujie · 集团财务总监 · 生产实测）：
--   · 持 MENU_UAT:V,X，来源 = ROLE_FIN_CFO(V,X) + ROLE_HQ_FINANCE(V)
--   · 验收试运行(/uat, /pilot-run) 是 go-live 上线验收工具，系统已正式投产，
--     财务角色不应保留常驻访问权 → 收口（移除该授权）。
--   · 主数据中心：刘杰仅持财务相关子权限(资金账户/银行账户/客户/供应商/项目)
--     + 运营主数据只读(产品/SKU/等级/包装等 V,X)，属 CFO 本职范围 → 保留，不动。
--     （他无 MENU_MASTER 组权、无组织架构、无仓库档案 create/edit）
--
-- 影响面：仅 ROLE_FIN_CFO + ROLE_HQ_FINANCE 两个财务角色（不动 ADMIN/PM 等）。
-- 幂等：DELETE WHERE，重复执行无副作用；生产生效、本地若无该授权则 no-op。
-- ════════════════════════════════════════════════════════════════════════

-- 1) 移除两个财务角色的 验收试运行 菜单授权
DELETE FROM sys_role_menu_permission
WHERE menu_id IN (SELECT menu_id FROM sys_menu WHERE menu_code = 'MENU_UAT')
  AND role_id IN (SELECT role_id FROM sys_role WHERE role_code IN ('ROLE_FIN_CFO', 'ROLE_HQ_FINANCE'));

-- 2) 递增受影响用户 perms_version → 强制重新登录刷新菜单（踢掉旧 token 里缓存的 UAT 权限）
UPDATE sys_user
SET perms_version = COALESCE(perms_version, 1) + 1
WHERE user_id IN (
  SELECT DISTINCT ur.user_id
  FROM sys_user_role ur
  JOIN sys_role r ON r.role_id = ur.role_id
  WHERE r.role_code IN ('ROLE_FIN_CFO', 'ROLE_HQ_FINANCE')
);
