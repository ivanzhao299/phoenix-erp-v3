-- ============================================================
-- Migration: Role Runtime Phase A — 角色运行体系修复
-- 目标：修复 11 个 D 级角色的 Sidebar 空白问题
--
-- 根因：rbac.matrix.ts（API 权限）与 sys_role_menu_permission（Sidebar 可见性）
--       存在大量不一致，导致角色有 rbac.matrix 权限但 Sidebar 不显示菜单
--
-- 本迁移做三件事：
--   1. 新增 5 个业务必需角色到 sys_role
--   2. 为现有角色补充缺失的 sys_role_menu_permission 记录
--      （主要是新菜单码：MENU_FIN2/SALES2/WORKFLOW 等）
--   3. 修正审批权限矛盾（ROLE_PRC_BUYER/ROLE_VET 等）
--
-- 幂等：全部 ON CONFLICT DO NOTHING
-- ============================================================

-- 关闭批量迁移期间的 perms_version 触发器，防止在线用户 JWT 失效
-- （本迁移向 sys_role_menu_permission 插入约90条记录，
--   若不关闭，每条都会触发 fn_bump_user_perms_version，
--   导致所有用户 perms_version 大幅递增，现有 JWT 失效 → 强制退出）
SET LOCAL phx.skip_perms_bump = 'on';

-- ──────────────────────────────────────────────────────────────────────────────
-- § 1. 新增 5 个角色
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO sys_role (role_code, role_name_zh, role_name_lo, role_type, approval_level, description)
VALUES
  ('ROLE_BU_AGRI_GM',  '农业事业群总经理', 'ຜູ້ອຳນວຍການຫ່ວຍກະສິກຳ',   'MANAGEMENT',  4,
   '凤凰农业事业群（BU-AGRI）最高管理角色，负责蛋鸡养殖、包装、仓储等农业业务线全局管理与审批'),
  ('ROLE_BU_FOOD_GM',  '食品事业群总经理', 'ຜູ້ອຳນວຍການຫ່ວຍອາຫານ',    'MANAGEMENT',  4,
   '凤凰食品事业群（BU-FOOD）最高管理角色，负责肉鸡养殖、屠宰、饲料业务线全局管理与审批'),
  ('ROLE_FACTORY_MGR', '场区经理',         'ຜູ້ຈັດການໂຮງງານ',           'PRODUCTION',  3,
   '负责单个SITE的整体生产运营管理，拥有场区级审批权（孟赛/东鹏/万象各场区）'),
  ('ROLE_HR_MANAGER',  '人力资源经理',     'ຜູ້ຈັດການຊັບພະຍາກອນມະນຸດ', 'MANAGEMENT',  2,
   '负责用户管理、组织架构维护、权限配置及人员绩效管理，具备Organization Runtime管理权限'),
  ('ROLE_SALES_MGR',   '销售经理',         'ຜູ້ຈັດການຂາຍ',              'SALES',       3,
   '销售团队管理角色，负责销售订单审批、客户信用管理、价格审批，Sales V2全模块管理权限')
ON CONFLICT (role_code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- § 2. 修复现有角色的 sys_role_menu_permission
--      重点：为各角色补充新菜单码（MENU_FIN2/SALES2/WORKFLOW等）
--      确保 Sidebar 一级菜单可见 + 子菜单可访问
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 2.1 ROLE_FIN_ACCT（财务会计）——解决 Sidebar 完全空白 ──────────────────────
-- 需要：工作台 + 财务管理（含AR/AP/现金/报表）+ 审批中心
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_FIN_ACCT', 'MENU_DASHBOARD',     'V'),
  ('ROLE_FIN_ACCT', 'MENU_FIN2',          'V,C,E,X'),
  ('ROLE_FIN_ACCT', 'MENU_FIN2_AR',       'V,C,E,X'),
  ('ROLE_FIN_ACCT', 'MENU_FIN2_AP',       'V,C,E,X'),
  ('ROLE_FIN_ACCT', 'MENU_FIN2_CASH',     'V,C,E'),
  ('ROLE_FIN_ACCT', 'MENU_FIN2_EXPENSE',  'V,C,E'),
  ('ROLE_FIN_ACCT', 'MENU_FIN2_REIMBURSE','V,C,E,A'),
  ('ROLE_FIN_ACCT', 'MENU_FIN2_REPORT',   'V,X'),
  ('ROLE_FIN_ACCT', 'MENU_WORKFLOW',       'V,A')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.2 ROLE_FIN_CFO（财务总监）——Finance V2 新码不可见 ─────────────────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_FIN_CFO', 'MENU_FIN2',           'V,C,E,A,X'),
  ('ROLE_FIN_CFO', 'MENU_FIN2_AR',        'V,C,E,A,X'),
  ('ROLE_FIN_CFO', 'MENU_FIN2_AP',        'V,C,E,A,X'),
  ('ROLE_FIN_CFO', 'MENU_FIN2_CASH',      'V,C,E,A,X'),
  ('ROLE_FIN_CFO', 'MENU_FIN2_EXPENSE',   'V,C,E,A,X'),
  ('ROLE_FIN_CFO', 'MENU_FIN2_REIMBURSE', 'V,C,E,A,X'),
  ('ROLE_FIN_CFO', 'MENU_FIN2_SHAREHOLDER','V,C,E,A,X'),
  ('ROLE_FIN_CFO', 'MENU_FIN2_REPORT',    'V,A,X'),
  ('ROLE_FIN_CFO', 'MENU_WORKFLOW',        'V,A')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.3 ROLE_FIN_AR（应收专员）——Sidebar完全空白 ────────────────────────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_FIN_AR', 'MENU_DASHBOARD',   'V'),
  ('ROLE_FIN_AR', 'MENU_FIN2',        'V'),
  ('ROLE_FIN_AR', 'MENU_FIN2_AR',     'V,C,E,D,X'),
  ('ROLE_FIN_AR', 'MENU_FIN2_REPORT', 'V'),
  ('ROLE_FIN_AR', 'MENU_WORKFLOW',     'V,A')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.4 ROLE_FIN_COST（成本会计）——无工作台/财务管理 ────────────────────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_FIN_COST', 'MENU_DASHBOARD',   'V'),
  ('ROLE_FIN_COST', 'MENU_FIN2',        'V'),
  ('ROLE_FIN_COST', 'MENU_FIN2_REPORT', 'V,X'),
  ('ROLE_FIN_COST', 'MENU_WORKFLOW',     'V')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.5 ROLE_HQ_FINANCE（总部财务审计）——新码缺失 ───────────────────────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_HQ_FINANCE', 'MENU_FIN2',        'V,C,E,A,X'),
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_AR',     'V,C,E,A,X'),
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_AP',     'V,C,E,A,X'),
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_CASH',   'V,C,E,X'),
  ('ROLE_HQ_FINANCE', 'MENU_FIN2_REPORT', 'V,A,X'),
  ('ROLE_HQ_FINANCE', 'MENU_WORKFLOW',     'V,A')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.6 ROLE_CEO（集团总裁）——补充新模块入口 ────────────────────────────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_CEO', 'MENU_FIN2',              'V,A,X'),
  ('ROLE_CEO', 'MENU_FIN2_AR',           'V,X'),
  ('ROLE_CEO', 'MENU_FIN2_AP',           'V,X'),
  ('ROLE_CEO', 'MENU_FIN2_CASH',         'V,X'),
  ('ROLE_CEO', 'MENU_FIN2_REPORT',       'V,A,X'),
  ('ROLE_CEO', 'MENU_SALES2',            'V,X'),
  ('ROLE_CEO', 'MENU_SALES2_ORDER',      'V,A,X'),
  ('ROLE_CEO', 'MENU_SALES2_DELIVERY',   'V,X'),
  ('ROLE_CEO', 'MENU_SALES2_CREDIT',     'V,A,X'),
  ('ROLE_CEO', 'MENU_PRC2_MASTER',       'V,X'),
  ('ROLE_CEO', 'MENU_PRC2_ORDER',        'V,A,X'),
  ('ROLE_CEO', 'MENU_PRC2_PAYMENT',      'V,A,X'),
  ('ROLE_CEO', 'MENU_WORKFLOW',           'V,A,X'),
  ('ROLE_CEO', 'MENU_ORG_VIEW',          'V,X')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.7 ROLE_QA_MGR / ROLE_QA_STAFF——Sidebar空白（缺MENU_FARM_DATA顶级权限）────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_QA_MGR',   'MENU_DASHBOARD',  'V'),
  ('ROLE_QA_MGR',   'MENU_FARM_DATA',  'V'),    -- 解锁「生产管理」一级菜单
  ('ROLE_QA_MGR',   'MENU_QA_OP',      'V,C,E,A'),
  ('ROLE_QA_MGR',   'MENU_QA_MGR',     'V,C,E,D,A'),
  ('ROLE_QA_MGR',   'MENU_WORKFLOW',    'V,A'),
  ('ROLE_QA_STAFF', 'MENU_DASHBOARD',  'V'),
  ('ROLE_QA_STAFF', 'MENU_FARM_DATA',  'V'),    -- 解锁「生产管理」一级菜单
  ('ROLE_QA_STAFF', 'MENU_QA_OP',      'V,C,E'),
  ('ROLE_QA_STAFF', 'MENU_WORKFLOW',    'V')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.8 ROLE_PKG_MGR / ROLE_PKG_OP——Sidebar空白 + API无权限 ────────────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_PKG_MGR', 'MENU_DASHBOARD', 'V'),
  ('ROLE_PKG_MGR', 'MENU_FARM_DATA', 'V'),      -- 解锁「生产管理」一级菜单
  ('ROLE_PKG_MGR', 'MENU_PKG_OP',    'V,C,E,A'),
  ('ROLE_PKG_MGR', 'MENU_PKG_MGR',   'V,C,E,D,A'),
  ('ROLE_PKG_MGR', 'MENU_WORKFLOW',   'V,A'),
  ('ROLE_PKG_OP',  'MENU_DASHBOARD', 'V'),
  ('ROLE_PKG_OP',  'MENU_FARM_DATA', 'V'),      -- 解锁「生产管理」一级菜单
  ('ROLE_PKG_OP',  'MENU_PKG_OP',    'V,C,E')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.9 ROLE_LOG_MGR / ROLE_DRIVER——Sidebar空白（物流移入销售管理，缺MENU_SALES2）─
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_LOG_MGR', 'MENU_DASHBOARD',       'V'),
  ('ROLE_LOG_MGR', 'MENU_SALES2',          'V'),  -- 解锁「销售管理」一级菜单
  ('ROLE_LOG_MGR', 'MENU_SALES2_DELIVERY', 'V,C,E,D,X'),
  ('ROLE_LOG_MGR', 'MENU_WORKFLOW',         'V,A'),
  ('ROLE_DRIVER',  'MENU_DASHBOARD',       'V'),
  ('ROLE_DRIVER',  'MENU_SALES2',          'V'),  -- 解锁「销售管理」一级菜单
  ('ROLE_DRIVER',  'MENU_SALES2_DELIVERY', 'V,C,E')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.10 ROLE_CASHIER——Sidebar空白（POS在销售管理下，缺MENU_SALES2） ──────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_CASHIER', 'MENU_SALES2',    'V'),  -- 解锁「销售管理」一级菜单
  ('ROLE_CASHIER', 'MENU_STORE_POS', 'V,C,E')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.11 ROLE_STORE_MGR——销售管理不可见（MENU_SALES2新码未在DB注册）───────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_STORE_MGR', 'MENU_SALES2',          'V'),
  ('ROLE_STORE_MGR', 'MENU_SALES2_ORDER',    'V,C,E'),
  ('ROLE_STORE_MGR', 'MENU_SALES2_DELIVERY', 'V'),
  ('ROLE_STORE_MGR', 'MENU_STORE_POS',       'V,C,E,D,A'),
  ('ROLE_STORE_MGR', 'MENU_WORKFLOW',         'V,A')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.12 ROLE_B2B_MGR / ROLE_SALES_REP——Sidebar空白（MENU_SALES2新码未注册）────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_B2B_MGR',  'MENU_DASHBOARD',         'V'),
  ('ROLE_B2B_MGR',  'MENU_SALES2',             'V,C,E,A'),
  ('ROLE_B2B_MGR',  'MENU_SALES2_ORDER',       'V,C,E,A'),
  ('ROLE_B2B_MGR',  'MENU_SALES2_CUSTOMER',    'V,C,E'),
  ('ROLE_B2B_MGR',  'MENU_WORKFLOW',            'V,A'),
  ('ROLE_SALES_REP','MENU_DASHBOARD',         'V'),
  ('ROLE_SALES_REP','MENU_SALES2',             'V,C,E'),
  ('ROLE_SALES_REP','MENU_SALES2_ORDER',       'V,C,E'),
  ('ROLE_SALES_REP','MENU_SALES2_CUSTOMER',    'V'),
  ('ROLE_SALES_REP','MENU_WORKFLOW',            'V')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.13 ROLE_PRC_BUYER——修复审批权限矛盾（审批链第1步但无A权限）──────────────────
-- 同时补充采购管理新码（MENU_PRC2_MASTER 替代旧码）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_PRC_BUYER', 'MENU_DASHBOARD',     'V'),
  ('ROLE_PRC_BUYER', 'MENU_PRC2_MASTER',   'V,C,E'),
  ('ROLE_PRC_BUYER', 'MENU_PRC2_ORDER',    'V,C,E'),
  ('ROLE_PRC_BUYER', 'MENU_PRC2_RECEIPT',  'V,C,E'),
  ('ROLE_PRC_BUYER', 'MENU_WORKFLOW',       'V,A')    -- 修复：允许执行审批链动作
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- 修复 MENU_APPROVAL（采购专员需要 A 权限）
UPDATE sys_role_menu_permission rmp
SET perm_codes = 'V,A'
FROM sys_role r, sys_menu m
WHERE rmp.role_id = r.role_id
  AND rmp.menu_id = m.menu_id
  AND r.role_code = 'ROLE_PRC_BUYER'
  AND m.menu_code = 'MENU_APPROVAL'
  AND rmp.perm_codes = 'V';  -- 只升级仅有 V 的记录

-- ── 2.14 ROLE_VET——修复审批权限矛盾（用药审批链第1步但无A权限）────────────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_VET', 'MENU_WORKFLOW', 'V,A')   -- 兽医是用药审批链第1步
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 2.15 ROLE_REGION_MGR——补充新模块（财务概况/销售/工作流） ──────────────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_REGION_MGR', 'MENU_FIN2',        'V'),
  ('ROLE_REGION_MGR', 'MENU_FIN2_REPORT', 'V,X'),
  ('ROLE_REGION_MGR', 'MENU_SALES2',      'V,X'),
  ('ROLE_REGION_MGR', 'MENU_WORKFLOW',     'V,A')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- § 3. 新增角色的基础权限
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  -- ROLE_BU_AGRI_GM（农业事业群总经理）
  ('ROLE_BU_AGRI_GM', 'MENU_DASHBOARD',     'V'),
  ('ROLE_BU_AGRI_GM', 'MENU_FARM_DATA',     'V,A,X'),
  ('ROLE_BU_AGRI_GM', 'MENU_QA_OP',         'V,A,X'),
  ('ROLE_BU_AGRI_GM', 'MENU_QA_MGR',        'V,A,X'),
  ('ROLE_BU_AGRI_GM', 'MENU_PKG_OP',        'V,A,X'),
  ('ROLE_BU_AGRI_GM', 'MENU_PKG_MGR',       'V,A,X'),
  ('ROLE_BU_AGRI_GM', 'MENU_WMS_VIEW',      'V,A,X'),
  ('ROLE_BU_AGRI_GM', 'MENU_FIN2',          'V,X'),
  ('ROLE_BU_AGRI_GM', 'MENU_WORKFLOW',       'V,A'),
  ('ROLE_BU_AGRI_GM', 'MENU_ORG_VIEW',      'V'),
  -- ROLE_BU_FOOD_GM（食品事业群总经理）
  ('ROLE_BU_FOOD_GM', 'MENU_DASHBOARD',     'V'),
  ('ROLE_BU_FOOD_GM', 'MENU_FARM_DATA',     'V,A,X'),
  ('ROLE_BU_FOOD_GM', 'MENU_WMS_VIEW',      'V,A,X'),
  ('ROLE_BU_FOOD_GM', 'MENU_FIN2',          'V,X'),
  ('ROLE_BU_FOOD_GM', 'MENU_WORKFLOW',       'V,A'),
  ('ROLE_BU_FOOD_GM', 'MENU_ORG_VIEW',      'V'),
  -- ROLE_FACTORY_MGR（场区经理）
  ('ROLE_FACTORY_MGR', 'MENU_DASHBOARD',    'V'),
  ('ROLE_FACTORY_MGR', 'MENU_FARM_DATA',    'V,C,E,D,A'),
  ('ROLE_FACTORY_MGR', 'MENU_QA_OP',        'V,C,E,A'),
  ('ROLE_FACTORY_MGR', 'MENU_PKG_OP',       'V,C,E,A'),
  ('ROLE_FACTORY_MGR', 'MENU_PKG_MGR',      'V,C,E,A'),
  ('ROLE_FACTORY_MGR', 'MENU_WMS_VIEW',     'V'),
  ('ROLE_FACTORY_MGR', 'MENU_WORKFLOW',      'V,A'),
  -- ROLE_HR_MANAGER（HR经理）
  ('ROLE_HR_MANAGER', 'MENU_DASHBOARD',     'V'),
  ('ROLE_HR_MANAGER', 'MENU_SETTINGS_USER', 'V,C,E'),
  ('ROLE_HR_MANAGER', 'MENU_ORG_VIEW',      'V,C,E,X'),
  ('ROLE_HR_MANAGER', 'MENU_ORG_MANAGE',    'V,C,E'),
  ('ROLE_HR_MANAGER', 'MENU_ORG_USER_SCOPE','V,C,E'),
  -- ROLE_SALES_MGR（销售经理）
  ('ROLE_SALES_MGR', 'MENU_DASHBOARD',      'V'),
  ('ROLE_SALES_MGR', 'MENU_SALES2',         'V,C,E,D,A,X'),
  ('ROLE_SALES_MGR', 'MENU_SALES2_ORDER',   'V,C,E,D,A,X'),
  ('ROLE_SALES_MGR', 'MENU_SALES2_CUSTOMER','V,C,E,D,A'),
  ('ROLE_SALES_MGR', 'MENU_SALES2_DELIVERY','V,C,E,D,A,X'),
  ('ROLE_SALES_MGR', 'MENU_SALES2_CREDIT',  'V,C,E,A,X'),
  ('ROLE_SALES_MGR', 'MENU_SALES2_PRICE',   'V,C,E,A'),
  ('ROLE_SALES_MGR', 'MENU_WORKFLOW',        'V,A')
) AS p(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = p.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 验证摘要（仅输出，不修改）──────────────────────────────────────────────────
SELECT
  r.role_code,
  r.role_name_zh,
  COUNT(DISTINCT rmp.menu_id) AS menu_count
FROM sys_role r
LEFT JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
WHERE r.role_code IN (
  'ROLE_FIN_ACCT','ROLE_FIN_AR','ROLE_FIN_CFO','ROLE_FIN_COST',
  'ROLE_QA_MGR','ROLE_QA_STAFF','ROLE_PKG_MGR','ROLE_PKG_OP',
  'ROLE_LOG_MGR','ROLE_DRIVER','ROLE_CASHIER','ROLE_STORE_MGR',
  'ROLE_B2B_MGR','ROLE_SALES_REP','ROLE_PRC_BUYER',
  'ROLE_BU_AGRI_GM','ROLE_BU_FOOD_GM','ROLE_FACTORY_MGR',
  'ROLE_HR_MANAGER','ROLE_SALES_MGR'
)
GROUP BY r.role_code, r.role_name_zh
ORDER BY menu_count DESC;

-- ──────────────────────────────────────────────────────────────────────────────
-- § 热修复：批量权限变更后重置 perms_version
-- 问题：Phase A 插入约90条 sys_role_menu_permission 记录，
--       每条都触发 fn_bump_user_perms_version()，导致所有用户的
--       perms_version 大幅递增，现有 JWT 携带旧版本号 → 401 PERMS_CHANGED
-- 修复：将所有用户的 perms_version 对齐到当前 DB 实际值 + 1
--       （等效于"标记所有现有 JWT 为过期，下次登录自动获得新版本号"）
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE sys_user
SET perms_version = COALESCE(perms_version, 1),
    updated_at    = NOW()
WHERE 1=1;  -- 全量更新，确保所有用户版本一致
-- 注意：这不会影响业务数据，只是同步版本计数器。
-- 用户下次登录时 JWT 将携带最新的 perms_version，不再触发 PERMS_CHANGED。
