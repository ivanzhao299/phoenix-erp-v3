-- ============================================================
-- Migration: 20260527_rbac_permission_fix.sql
-- 用途: 修复 RBAC 权限矩阵审计发现的问题
-- 问题 1（致命）: rbac.matrix.ts 中角色名与 DB 不一致，导致
--                 FIN2/SALES2 等权限因 JOIN 失败而未落库
-- 问题 2（错误）: 17条 perm_codes 与矩阵定义不一致
-- 问题 3（补充）: 销售角色/HQ_FINANCE/FACTORY_ACCT 的新增权限
--
-- 已修复的代码层问题（rbac.matrix.ts）：
--   ROLE_FACTORY_ACCOUNTANT → ROLE_FACTORY_ACCT
--   ROLE_LOGISTICS_MGR      → ROLE_LOG_MGR
--   ROLE_GROUP_FINANCE      → ROLE_HQ_FINANCE
--   ROLE_BREEDER            → ROLE_FARMER
--   MENU_WORKFLOW 补充：SALES_MGR/SALES_REP/AUDITOR/HQ_FINANCE
--
-- 执行: psql -U mac -d phoenix_erp -f this_file.sql
-- ============================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. 修复角色名不匹配导致的 FIN2/SALES2 权限缺失
--    （上次 V2 seed 迁移因 JOIN 失败，这些记录从未写入）
-- ══════════════════════════════════════════════════════════════
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, x.perm_codes
FROM (VALUES

  -- ROLE_FACTORY_ACCT（上次用了 ROLE_FACTORY_ACCOUNTANT，JOIN 失败）
  ('ROLE_FACTORY_ACCT', 'MENU_FIN2',           'V,C,E,X'),
  ('ROLE_FACTORY_ACCT', 'MENU_FIN2_AP',         'V,C,E,X'),
  ('ROLE_FACTORY_ACCT', 'MENU_FIN2_AR',         'V,C,E,X'),
  ('ROLE_FACTORY_ACCT', 'MENU_FIN2_CASH',       'V,C,X'),
  ('ROLE_FACTORY_ACCT', 'MENU_FIN2_EXPENSE',    'V,C,E,X'),

  -- ROLE_HQ_FINANCE（上次用了 ROLE_GROUP_FINANCE，JOIN 失败）
  ('ROLE_HQ_FINANCE', 'MENU_FIN2',             'V,C,E,A,X'),
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_AP',           'V,C,E,A,X'),
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_AR',           'V,C,E,A,X'),
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_CASH',         'V,C,E,X'),
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_EXPENSE',      'V,C,E,A,X'),
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_BUDGET',       'V,C,E,A,X'),
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_SHAREHOLDER',  'V,C,E,A,X'),
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_REPORT',       'V,X'),
  ('ROLE_HQ_FINANCE', 'MENU_SALES2',            'V,X'),
  ('ROLE_HQ_FINANCE', 'MENU_SALES2_CUSTOMER',   'V,X'),
  ('ROLE_HQ_FINANCE', 'MENU_SALES2_CHANNEL',    'V,X'),
  ('ROLE_HQ_FINANCE', 'MENU_SALES2_PRICE',      'V,X'),
  ('ROLE_HQ_FINANCE', 'MENU_SALES2_ORDER',      'V,X'),

  -- ROLE_LOG_MGR（上次用了 ROLE_LOGISTICS_MGR，但 PRC2 部分已正确写入；此处补 FIN2）
  -- ROLE_LOG_MGR 在 FIN2 中没有权限，不需要补

  -- ROLE_FARMER（上次 seed 没有包含饲养员的权限，按矩阵补充）
  ('ROLE_FARMER', 'MENU_FARM_DATA',    'V,C,E')

) AS x(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = x.role_code
JOIN sys_menu m  ON m.menu_code = x.menu_code
ON CONFLICT (role_id, menu_id)
  DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

-- ══════════════════════════════════════════════════════════════
-- 2. 修复 perm_codes 不一致（17条）
--    DO UPDATE 确保覆盖现有错误值
-- ══════════════════════════════════════════════════════════════
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, x.perm_codes
FROM (VALUES

  -- ROLE_AUDITOR: MENU_APPROVAL 缺 X
  ('ROLE_AUDITOR',   'MENU_APPROVAL',    'V,X'),

  -- ROLE_DRIVER: MENU_LOGISTICS 应为 V,C 而不是 V,E
  ('ROLE_DRIVER',    'MENU_LOGISTICS',   'V,C'),

  -- ROLE_FARM_MGR: MENU_FARM_DATA 缺 D,A
  ('ROLE_FARM_MGR',  'MENU_FARM_DATA',   'V,C,E,D,A,X'),

  -- ROLE_FIN_ACCT: MENU_FIN_CLOSE 应为 V,C,X（不是 V,C,E,A）
  ('ROLE_FIN_ACCT',  'MENU_FIN_CLOSE',   'V,C,X'),
  -- ROLE_FIN_ACCT: MENU_ORDER_MGR 应为 V,X（不是 V,E）
  ('ROLE_FIN_ACCT',  'MENU_ORDER_MGR',   'V,X'),

  -- ROLE_FIN_CFO: MENU_PRC_MGR 缺 X
  ('ROLE_FIN_CFO',   'MENU_PRC_MGR',     'V,A,X'),

  -- ROLE_REGION_MGR: 多项不一致
  ('ROLE_REGION_MGR','MENU_FIN_CLOSE',   'V,X'),
  ('ROLE_REGION_MGR','MENU_LOGISTICS',   'V,X'),
  ('ROLE_REGION_MGR','MENU_ORDER_MGR',   'V,A,X'),

  -- ROLE_PRC_BUYER: 缺少导出权限
  ('ROLE_PRC_BUYER', 'MENU_PRC_MGR',     'V,C,E,D,X'),
  ('ROLE_PRC_BUYER', 'MENU_PRC_MASTER',  'V,C,E,X'),

  -- ROLE_SYSOPS: 三个菜单缺 D（删除）权限
  ('ROLE_SYSOPS',    'MENU_SETTINGS_DATA','V,C,E,D'),
  ('ROLE_SYSOPS',    'MENU_SETTINGS_IT',  'V,C,E,D'),
  ('ROLE_SYSOPS',    'MENU_MASTER',        'V,C,E,D'),

  -- ROLE_STORE_MGR: 两项不一致
  ('ROLE_STORE_MGR', 'MENU_FIN_CLOSE',   'V,C'),
  ('ROLE_STORE_MGR', 'MENU_ORDER_MGR',   'V,C,E,D,X'),

  -- ROLE_SALES_REP: MENU_ORDER_MGR 多了 E
  ('ROLE_SALES_REP', 'MENU_ORDER_MGR',   'V,C')

) AS x(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = x.role_code
JOIN sys_menu m  ON m.menu_code = x.menu_code
ON CONFLICT (role_id, menu_id)
  DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

-- ══════════════════════════════════════════════════════════════
-- 3. 补充 MENU_WORKFLOW 新增角色权限
--    （rbac.matrix.ts 已更新，DB 同步）
-- ══════════════════════════════════════════════════════════════
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, x.perm_codes
FROM (VALUES
  ('ROLE_SALES_MGR',  'MENU_WORKFLOW', 'V,A'),
  ('ROLE_SALES_REP',  'MENU_WORKFLOW', 'V'),
  ('ROLE_AUDITOR',    'MENU_WORKFLOW', 'V,X'),
  ('ROLE_HQ_FINANCE', 'MENU_WORKFLOW', 'V,A,X')
) AS x(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = x.role_code
JOIN sys_menu m  ON m.menu_code = x.menu_code
ON CONFLICT (role_id, menu_id)
  DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

-- ══════════════════════════════════════════════════════════════
-- 4. 清理最高风险的僵尸权限
--    （角色在矩阵中未定义，但 DB 有超出范围的权限）
-- ══════════════════════════════════════════════════════════════
DELETE FROM sys_role_menu_permission
WHERE (role_id, menu_id) IN (
  SELECT r.role_id, m.menu_id
  FROM (VALUES
    -- ROLE_B2B_MGR 不在矩阵中，清除其所有权限
    ('ROLE_B2B_MGR',   'MENU_APPROVAL'),
    ('ROLE_B2B_MGR',   'MENU_ORDER_MGR'),
    -- ROLE_CS 不在矩阵中
    ('ROLE_CS',        'MENU_ORDER_MGR'),
    -- ROLE_FIN_COST 不在矩阵中
    ('ROLE_FIN_COST',  'MENU_FARM_DATA'),
    ('ROLE_FIN_COST',  'MENU_FIN_AUDIT'),
    -- ROLE_FIN_AR: 只有 MENU_FINANCE（不在DB），清理僵尸
    ('ROLE_FIN_AR',    'MENU_FIN_AUDIT'),
    -- ROLE_PKG_MGR 不在矩阵中
    ('ROLE_PKG_MGR',   'MENU_APPROVAL'),
    -- ROLE_QA_MGR 不在矩阵中
    ('ROLE_QA_MGR',    'MENU_APPROVAL'),
    ('ROLE_QA_MGR',    'MENU_QA_MASTER'),
    -- ROLE_PDA_OP 不在矩阵中
    ('ROLE_PDA_OP',    'MENU_LOGISTICS'),
    -- ROLE_WMS_MGR: MENU_LOGISTICS 不在其矩阵定义中
    ('ROLE_WMS_MGR',   'MENU_LOGISTICS')
  ) AS x(role_code, menu_code)
  JOIN sys_role r ON r.role_code = x.role_code
  JOIN sys_menu m  ON m.menu_code = x.menu_code
);

COMMIT;

-- ══════════════════════════════════════════════════════════════
-- 验证结果
-- ══════════════════════════════════════════════════════════════
-- 1. ROLE_FACTORY_ACCT 应有 FIN2 权限
SELECT 'FACTORY_ACCT FIN2:' AS check_label, count(*) AS cnt
FROM sys_role r
JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
JOIN sys_menu m ON m.menu_id = rmp.menu_id
WHERE r.role_code = 'ROLE_FACTORY_ACCT'
  AND m.menu_code LIKE 'MENU_FIN2%';

-- 2. ROLE_HQ_FINANCE 应有 FIN2 + SALES2 + WORKFLOW 权限
SELECT 'HQ_FINANCE V2+WF:' AS check_label, count(*) AS cnt
FROM sys_role r
JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
JOIN sys_menu m ON m.menu_id = rmp.menu_id
WHERE r.role_code = 'ROLE_HQ_FINANCE'
  AND m.menu_code IN (
    'MENU_FIN2','MENU_FIN2_AP','MENU_FIN2_AR','MENU_FIN2_CASH',
    'MENU_FIN2_EXPENSE','MENU_FIN2_BUDGET','MENU_FIN2_SHAREHOLDER','MENU_FIN2_REPORT',
    'MENU_SALES2','MENU_SALES2_ORDER','MENU_WORKFLOW'
  );

-- 3. ROLE_AUDITOR MENU_APPROVAL 应有 V,X
SELECT r.role_code, m.menu_code, rmp.perm_codes
FROM sys_role r
JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
JOIN sys_menu m ON m.menu_id = rmp.menu_id
WHERE r.role_code = 'ROLE_AUDITOR' AND m.menu_code = 'MENU_APPROVAL';
