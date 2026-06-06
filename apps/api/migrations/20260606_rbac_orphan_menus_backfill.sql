-- ═════════════════════════════════════════════════════════════════════════════
-- RBAC 历史孤儿 menu_code 修复
-- ═════════════════════════════════════════════════════════════════════════════
-- 来源：audit 发现 28 个 controller 用 @RequireMenu('XXX') 引用了 13 个
-- 不在 sys_menu 表中注册的 menu_code，导致所有非超管访问对应端点都被
-- MenuGuard 拒。受影响业务模块：farm/product-master/quality/packaging/
-- store-pos/pda/uat/system-monitor。
--
-- 修法：
--   1) 给 13 个孤儿 code 补 sys_menu 行（占位，path/parent 后续补）
--   2) 按业务命名约定派权给对应业务角色：
--      MENU_QA → ROLE_QA_*；MENU_PACKAGING → ROLE_PKG_*；等等
--
-- 幂等：所有 INSERT 带 NOT EXISTS 守卫。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) 补 sys_menu 13 行 ───────────────────────────────────────────────────
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order)
VALUES
  ('MENU_BREEDING',         '养殖业务',        'FARM',    0),
  ('MENU_MASTER_PRODUCT',   '产品主档',        'MASTER',  0),
  ('MENU_MASTER_GRADE',     '等级主档',        'MASTER',  0),
  ('MENU_MASTER_SKU',       'SKU 主档',        'MASTER',  0),
  ('MENU_MASTER_PACKAGING', '包装规格主档',    'MASTER',  0),
  ('MENU_PACKAGING',        '包装作业',        'PKG',     0),
  ('MENU_PDA',              'PDA 同步',        'WMS',     0),
  ('MENU_QA',               '质检',           'QUALITY', 0),
  ('MENU_STORE_POS',        '门店 POS',        'STORE',   0),
  ('MENU_SYSTEM',           '系统管理',        'SYS',     0),
  ('MENU_SYS_CONFIG',       '系统配置',        'SYS',     0),
  ('MENU_SYS_MONITOR',      '系统监控',        'SYS',     0),
  ('MENU_UAT',              'UAT 试运行',      'SYS',     0)
ON CONFLICT (menu_code) DO NOTHING;

-- ── 2) 按业务命名约定派权 ──────────────────────────────────────────────────
-- helper：给一组角色派对应 menu_code 的指定 perm_codes
-- 不用 PL/pgSQL 函数；用直接 INSERT...SELECT + NOT EXISTS

-- MENU_QA → 质检角色
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C,E'
  FROM sys_role r, sys_menu m
 WHERE r.role_code IN ('ROLE_QA_MGR','ROLE_QA_STAFF','ROLE_QC_INSPECTOR')
   AND m.menu_code = 'MENU_QA'
   AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission x WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id);

-- MENU_PACKAGING → 包装角色
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C,E'
  FROM sys_role r, sys_menu m
 WHERE r.role_code IN ('ROLE_PKG_MGR','ROLE_PKG_OP','ROLE_LINE_SUPERVISOR')
   AND m.menu_code = 'MENU_PACKAGING'
   AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission x WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id);

-- MENU_MASTER_* → 主数据 / 产品主管角色
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C,E'
  FROM sys_role r, sys_menu m
 WHERE r.role_code IN ('ROLE_PRODUCT_MASTER_MGR','ROLE_MASTER_DATA_ADMIN','ROLE_MASTER_DATA_APPROVER')
   AND m.menu_code IN ('MENU_MASTER_PRODUCT','MENU_MASTER_GRADE','MENU_MASTER_SKU','MENU_MASTER_PACKAGING')
   AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission x WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id);

-- 产品主档 V 给所有需要查产品的业务角色（销售/采购/仓储/养殖/包装）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V'
  FROM sys_role r, sys_menu m
 WHERE r.role_code IN (
   'ROLE_SALES_MGR','ROLE_SALES_REP','ROLE_B2B_MGR',
   'ROLE_PRC_BUYER',
   'ROLE_WMS_MGR','ROLE_WMS_OP','ROLE_WH_CLERK',
   'ROLE_FARM_MGR','ROLE_FARMER','ROLE_FACTORY_MGR','ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR',
   'ROLE_PKG_MGR','ROLE_PKG_OP',
   'ROLE_STORE_MGR','ROLE_CASHIER'
 )
   AND m.menu_code IN ('MENU_MASTER_PRODUCT','MENU_MASTER_GRADE','MENU_MASTER_SKU','MENU_MASTER_PACKAGING')
   AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission x WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id);

-- MENU_BREEDING → 养殖角色
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C,E'
  FROM sys_role r, sys_menu m
 WHERE r.role_code IN ('ROLE_FARM_MGR','ROLE_FARMER','ROLE_VET','ROLE_FACTORY_MGR','ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR')
   AND m.menu_code = 'MENU_BREEDING'
   AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission x WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id);

-- MENU_STORE_POS → 门店角色
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C,E'
  FROM sys_role r, sys_menu m
 WHERE r.role_code IN ('ROLE_CASHIER','ROLE_STORE_MGR')
   AND m.menu_code = 'MENU_STORE_POS'
   AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission x WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id);

-- MENU_PDA → PDA 操作员 + 仓储 + 包装
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C'
  FROM sys_role r, sys_menu m
 WHERE r.role_code IN ('ROLE_PDA_OP','ROLE_WMS_OP','ROLE_WH_CLERK','ROLE_PKG_OP')
   AND m.menu_code = 'MENU_PDA'
   AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission x WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id);

-- MENU_UAT → 试运行负责人
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C,E'
  FROM sys_role r, sys_menu m
 WHERE r.role_code IN ('ROLE_PILOT_MANAGER')
   AND m.menu_code = 'MENU_UAT'
   AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission x WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id);

-- MENU_SYSTEM / SYS_CONFIG / SYS_MONITOR → 仅 HR_MANAGER（其它已通过 ROLE_ADMIN 通配）
-- 这里不批量发，因为这类系统级菜单本应严格控制；ADMIN 已 V,C,E,D,A 全权
-- 给 HR_MANAGER 只发 MENU_SYSTEM V（用户管理需要）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C,E'
  FROM sys_role r, sys_menu m
 WHERE r.role_code = 'ROLE_HR_MANAGER'
   AND m.menu_code = 'MENU_SYSTEM'
   AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission x WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id);

-- ── 3) 触发已绑该角色用户的 perms_version 递增 ─────────────────────────────
UPDATE sys_user u
   SET perms_version = COALESCE(perms_version,0) + 1, updated_at = now()
 WHERE EXISTS (
   SELECT 1 FROM sys_user_role ur
   JOIN sys_role r ON r.role_id = ur.role_id
   WHERE ur.user_id = u.user_id
     AND r.role_code IN (
       'ROLE_QA_MGR','ROLE_QA_STAFF','ROLE_QC_INSPECTOR',
       'ROLE_PKG_MGR','ROLE_PKG_OP','ROLE_LINE_SUPERVISOR',
       'ROLE_PRODUCT_MASTER_MGR','ROLE_MASTER_DATA_ADMIN','ROLE_MASTER_DATA_APPROVER',
       'ROLE_FARM_MGR','ROLE_FARMER','ROLE_VET','ROLE_FACTORY_MGR',
       'ROLE_CASHIER','ROLE_STORE_MGR',
       'ROLE_PDA_OP','ROLE_WMS_OP','ROLE_WH_CLERK',
       'ROLE_PILOT_MANAGER','ROLE_HR_MANAGER',
       'ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR',
       'ROLE_SALES_MGR','ROLE_SALES_REP','ROLE_B2B_MGR','ROLE_PRC_BUYER'
     )
 );

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证 SQL：
--   SELECT count(*) FROM sys_menu WHERE menu_code IN
--     ('MENU_BREEDING','MENU_MASTER_PRODUCT','MENU_MASTER_GRADE','MENU_MASTER_SKU',
--      'MENU_MASTER_PACKAGING','MENU_PACKAGING','MENU_PDA','MENU_QA','MENU_STORE_POS',
--      'MENU_SYSTEM','MENU_SYS_CONFIG','MENU_SYS_MONITOR','MENU_UAT');
--   -- 期望：13
--
--   -- 查孟赛宋明光新增的产品主档权限
--   SELECT m.menu_code, rmp.perm_codes
--     FROM sys_user u
--     JOIN sys_user_role ur ON ur.user_id=u.user_id
--     JOIN sys_role r ON r.role_id=ur.role_id
--     JOIN sys_role_menu_permission rmp ON rmp.role_id=r.role_id
--     JOIN sys_menu m ON m.menu_id=rmp.menu_id
--    WHERE u.username='songmingguang' AND m.menu_code LIKE 'MENU_MASTER%';
-- ═════════════════════════════════════════════════════════════════════════════
