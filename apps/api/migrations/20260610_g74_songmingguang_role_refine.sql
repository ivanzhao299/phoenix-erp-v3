-- ════════════════════════════════════════════════════════════════════════
-- G74：宋明光 权限按实际分工补全+收紧（销售内勤 + 统计 + 会计）
-- ════════════════════════════════════════════════════════════════════════
-- 审计：宋明光 username=songmingguang，独占角色 ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR
--   (1 持有人，可安全扩展)。现 29 菜单覆盖"统计"(养殖/生产/库存)+现金收款，
--   但缺"销售内勤"(0 销售菜单)+"会计"(缺费用凭证/应收/银行)；且持超级主数据权 MENU_MASTER_DATA。
-- 分工(用户提供)：① 销售内勤 ② 统计 ③ 会计。
-- 处理(用户选"按映射补全+收紧")：
--   + 销售内勤：SALES2 订单(V,C,E)/配送(V,E)/客户·报表·库存·信用(V)
--   + 会计    ：FIN2 费用凭证(V,C,E)/应收收款(V,C,E)/应收查看(V)
--   + 主数据  ：换 per-entity 只读(客户/银行/司机/车辆/产品/等级/SKU/包装 V)
--   - 收紧    ：移除超级主数据权 MENU_MASTER_DATA
--   ✅ 保留    ：统计(FARM/PROD/INV/WMS)+现金收款(FIN2_CASH*)+移动养殖app+审批+仪表盘
-- 幂等：INSERT WHERE NOT EXISTS（已有授权不覆盖）；DELETE 限定 MENU_MASTER_DATA。
-- ════════════════════════════════════════════════════════════════════════

-- 1) 补全 销售内勤 + 会计 + per-entity 主数据（幂等）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.pc
FROM sys_role r
JOIN (VALUES
  -- 销售内勤
  ('MENU_SALES2','V'),
  ('MENU_SALES2_ORDER','V,C,E'),
  ('MENU_SALES2_DELIVERY','V,E'),
  ('MENU_SALES2_CUSTOMER','V'),
  ('MENU_SALES2_REPORT','V'),
  ('MENU_SALES2_INVENTORY','V'),
  ('MENU_SALES2_CREDIT','V'),
  -- 会计（费用凭证 + 应收收款；现金 FIN2_CASH* 已有）
  ('MENU_FIN2','V'),
  ('MENU_FIN2_EXPENSE','V,C,E'),
  ('MENU_FIN2_EXPENSE_TXN','V,C,E'),
  ('MENU_FIN2_AR','V'),
  ('MENU_FIN2_AR_TXN','V,C,E'),
  ('MENU_FIN2_AR_VIEW','V'),
  -- per-entity 主数据（只读，供录入引用）
  ('MENU_MD_CUSTOMER','V'),
  ('MENU_MD_BANK_ACCOUNT','V'),
  ('MENU_MD_DRIVER','V'),
  ('MENU_MD_VEHICLE','V'),
  ('MENU_MD_PRODUCT','V'),
  ('MENU_MD_GRADE','V'),
  ('MENU_MD_SKU','V'),
  ('MENU_MD_PACKAGING','V')
) AS v(code, pc) ON TRUE
JOIN sys_menu m ON m.menu_code = v.code
WHERE r.role_code = 'ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR'
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_menu_permission p WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
  );

-- 2) 收紧：移除超级主数据权 MENU_MASTER_DATA（已换 per-entity）
DELETE FROM sys_role_menu_permission p
USING sys_role r, sys_menu m
WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
  AND r.role_code = 'ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR'
  AND m.menu_code = 'MENU_MASTER_DATA';

-- 3) perms_version bump → 强制宋明光重登刷新
UPDATE sys_user SET perms_version = COALESCE(perms_version,1) + 1 WHERE username = 'songmingguang';
