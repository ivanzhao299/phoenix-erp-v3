-- ════════════════════════════════════════════════════════════════════════
-- G56-B：主数据中心「项级原子」权限 — 每实体独立菜单码 + 角色精确收紧
-- ════════════════════════════════════════════════════════════════════════
-- 背景：master-data-runtime 6 端点原统一 MENU_MASTER_DATA，导致
--   ROLE_CUSTOMER_MASTER_MGR 等「按实体划分」的主数据角色其实能管所有主数据
--   （per-entity 角色形同虚设）。本迁移：
--   1) 为 12 类主数据建专属码 MENU_MD_<TYPE>（bank-account 已有，复用）
--   2) 把无用户的 per-entity MGR 角色精确授到各自的码，并移除其 MENU_MASTER_DATA
--   3) 超级角色（CEO/MASTER_DATA_ADMIN/APPROVER/孟赛东鹏出纳）保留 MENU_MASTER_DATA
--      作"管理全部主数据"超级码（后端 MasterDataTypeGuard + 前端 superPerm 兜底）
-- 安全：6 个 MGR 角色全部 0 用户，重收紧零伤害；现有 MENU_MASTER_DATA 持有者不受影响。
-- 幂等：菜单 NOT EXISTS 插入；授权 ON CONFLICT(role_id,menu_id)。
-- ════════════════════════════════════════════════════════════════════════

-- 1) 12 个 per-entity 专属菜单码（domain=MASTER, parent=主数据中心）
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, parent_code, sort_order)
SELECT v.code, v.name, 'MASTER', 'MENU_MASTER_DATA', v.ord
FROM (VALUES
  ('MENU_MD_CUSTOMER',     '客户档案',     701),
  ('MENU_MD_SUPPLIER',     '供应商档案',   702),
  ('MENU_MD_PROJECT',      '项目档案',     703),
  ('MENU_MD_PRODUCT',      '产品档案',     704),
  ('MENU_MD_GRADE',        '等级档案',     705),
  ('MENU_MD_PACKAGING',    '包装规格',     706),
  ('MENU_MD_SKU',          'SKU档案',      707),
  ('MENU_MD_WAREHOUSE',    '仓库档案',     708),
  ('MENU_MD_STORE',        '门店档案',     709),
  ('MENU_MD_DRIVER',       '司机档案',     710),
  ('MENU_MD_VEHICLE',      '车辆档案',     711),
  ('MENU_MD_CASH_ACCOUNT', '资金账户档案', 712)
) AS v(code, name, ord)
WHERE NOT EXISTS (SELECT 1 FROM sys_menu m WHERE m.menu_code = v.code);

-- 2) per-entity MGR 角色 → 精确授到各自专属码（C,E,V）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'C,E,V'
FROM (VALUES
  ('ROLE_CUSTOMER_MASTER_MGR',    'MENU_MD_CUSTOMER'),
  ('ROLE_SUPPLIER_MASTER_MGR',    'MENU_MD_SUPPLIER'),
  ('ROLE_PRODUCT_MASTER_MGR',     'MENU_MD_PRODUCT'),
  ('ROLE_PRODUCT_MASTER_MGR',     'MENU_MD_GRADE'),
  ('ROLE_PRODUCT_MASTER_MGR',     'MENU_MD_PACKAGING'),
  ('ROLE_PRODUCT_MASTER_MGR',     'MENU_MD_SKU'),
  ('ROLE_WAREHOUSE_MASTER_MGR',   'MENU_MD_WAREHOUSE'),
  ('ROLE_FIN_ACCOUNT_MASTER_MGR', 'MENU_MD_CASH_ACCOUNT'),
  ('ROLE_FIN_ACCOUNT_MASTER_MGR', 'MENU_MD_BANK_ACCOUNT')
) AS g(role_code, menu_code)
JOIN sys_role r ON r.role_code = g.role_code
JOIN sys_menu m ON m.menu_code = g.menu_code
ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

-- 3) 移除 per-entity MGR 角色的超级码 MENU_MASTER_DATA（真·收紧，0 用户安全）
DELETE FROM sys_role_menu_permission p
USING sys_role r, sys_menu m
WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
  AND m.menu_code = 'MENU_MASTER_DATA'
  AND r.role_code IN (
    'ROLE_CUSTOMER_MASTER_MGR','ROLE_SUPPLIER_MASTER_MGR','ROLE_PRODUCT_MASTER_MGR',
    'ROLE_WAREHOUSE_MASTER_MGR','ROLE_FIN_ACCOUNT_MASTER_MGR'
  );

-- 4) 递增受影响角色用户 perms_version（强制重登刷新；这些角色当前 0 用户，实际 no-op）
UPDATE sys_user SET perms_version = COALESCE(perms_version,1) + 1
WHERE user_id IN (
  SELECT DISTINCT ur.user_id FROM sys_user_role ur JOIN sys_role r ON r.role_id = ur.role_id
  WHERE r.role_code IN (
    'ROLE_CUSTOMER_MASTER_MGR','ROLE_SUPPLIER_MASTER_MGR','ROLE_PRODUCT_MASTER_MGR',
    'ROLE_WAREHOUSE_MASTER_MGR','ROLE_FIN_ACCOUNT_MASTER_MGR'
  )
);
