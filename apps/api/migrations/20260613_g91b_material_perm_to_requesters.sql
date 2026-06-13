-- ════════════════════════════════════════════════════════════════════════
-- G91-B 物料权限下放 — 采购申请相关角色可读/建物料（配合就地快速新建）
-- ────────────────────────────────────────────────────────────────────────
-- 背景：G86 仅给 ADMIN/PRC_BUYER 授 MENU_MD_MATERIAL。但手机/PC 采购申请的提单人
--   含场长/兽医/饲养/仓管/包装/物流/门店等运营角色，他们「选物料找不到→就地新建」
--   需 MENU_MD_MATERIAL:C。物料属运营主数据（低风险），下放读+建权限合理。
-- 幂等：ON CONFLICT(role_id,menu_id)。
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C,E'
FROM (VALUES
  ('ROLE_FARM_MGR'), ('ROLE_VET'), ('ROLE_BREEDER'), ('ROLE_WMS_MGR'),
  ('ROLE_PKG_MGR'), ('ROLE_LOG_MGR'), ('ROLE_STORE_MGR'), ('ROLE_PROJECT_MGR')
) AS v(role_code)
JOIN sys_role r ON r.role_code = v.role_code
JOIN sys_menu m ON m.menu_code = 'MENU_MD_MATERIAL'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_menu_permission p WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
);
