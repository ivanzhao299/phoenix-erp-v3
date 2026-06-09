-- ════════════════════════════════════════════════════════════════════════
-- G62：刘杰（集团财务总监）角色收敛到 CFO 本职 — 移除运营越权
-- ════════════════════════════════════════════════════════════════════════
-- 审计：刘杰 4 财务角色叠加 77 权限，含大量非财务运营权限（侧边栏暴露：
--   门店POS / 移动作业 / 全链追溯 / 销售运营 / 采购运营），远超 CFO 范围。
-- 越权来源：ROLE_FIN_ACCT(8) + ROLE_HQ_FINANCE(7) 等 4 个财务角色都被污染。
-- 收敛：从这 4 个财务角色移除「清晰运营越权」菜单授权（财务角色本就不该含）。
--   保留：所有 FIN2/FIN/SHAREHOLDER/APPROVAL/WORKFLOW/DASHBOARD + 财务主数据
--        + 数据质量(MD_QUALITY) + 财务相关跨域(SALES2_CREDIT 信用控制 /
--        PRC2_PAYMENT·PRC2_FUND 采购付款资金 / ORDER_FIN 订单财务)。
-- 范围：仅这 4 个财务角色。移除的是运营权限，对任何财务角色都是正确 hygiene。
-- 幂等：DELETE WHERE，无该授权则 no-op。
-- ════════════════════════════════════════════════════════════════════════

DELETE FROM sys_role_menu_permission p
USING sys_role r, sys_menu m
WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
  AND r.role_code IN ('ROLE_FIN_CFO', 'ROLE_FIN_ACCT', 'ROLE_HQ_FINANCE', 'ROLE_FINANCE_REVIEW_MANAGER')
  AND m.menu_code IN (
    -- 门店（销售内）
    'MENU_STORE_MGR', 'MENU_STORE_POS',
    -- 移动端作业 app
    'MOBILE_PACKAGING', 'MOBILE_SALES', 'MOBILE_EGG', 'MOBILE_EGGLOG',
    -- 全链追溯
    'MENU_TRACEABILITY_VIEW', 'MENU_TRACEABILITY_EXPORT',
    -- 销售运营（保留 SALES2_CREDIT 信用控制）
    'MENU_SALES2_ORDER', 'MENU_SALES2_DELIVERY', 'MENU_SALES2_PRICE',
    'MENU_SALES2_CHANNEL', 'MENU_SALES2_RETURN',
    -- 采购运营（保留 PRC2_PAYMENT / PRC2_FUND 采购付款·资金）
    'MENU_PRC2_ORDER', 'MENU_PRC2_RECEIPT', 'MENU_PRC2_SHIPMENT', 'MENU_PRC2_SUPPLIER'
  );

-- 递增受影响角色用户 perms_version → 强制重登刷新菜单
UPDATE sys_user SET perms_version = COALESCE(perms_version,1) + 1
WHERE user_id IN (
  SELECT DISTINCT ur.user_id FROM sys_user_role ur JOIN sys_role r ON r.role_id = ur.role_id
  WHERE r.role_code IN ('ROLE_FIN_CFO', 'ROLE_FIN_ACCT', 'ROLE_HQ_FINANCE', 'ROLE_FINANCE_REVIEW_MANAGER')
);
