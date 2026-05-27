-- ============================================================
-- Migration: 20260527_v2_menu_rbac_seed.sql
-- 用途: 将 Finance V2 / 采购 V2 / Sales V2 / Workflow 的菜单
--       注册进 sys_menu，并按 rbac.matrix.ts 写入
--       sys_role_menu_permission（幂等，可重复执行）
-- 背景: ddl/02_init_data.sql 和 ddl/10_rbac_complete_matrix.sql
--       仅包含老菜单，V2 菜单从未入库，导致 CEO / CFO 等角色
--       无法在侧边栏看到财务V2 / 采购V2 / Sales V2 模块。
-- 执行: psql -U mac -d phoenix_erp -f this_file.sql
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1. 注册 V2 菜单到 sys_menu（全部幂等，ON CONFLICT DO NOTHING）
-- ──────────────────────────────────────────────────────────────
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order, route) VALUES
  -- 采购 V2
  ('MENU_PRC2',            '采购V2 主模块',     'PRC',    50, '/procurement2'),
  ('MENU_PRC2_MASTER',     '采购V2 主数据',     'PRC',    51, '/procurement2/suppliers'),
  ('MENU_PRC2_REQUEST',    '采购V2 申请',       'PRC',    52, '/procurement2/requests'),
  ('MENU_PRC2_ORDER',      '采购V2 订单',       'PRC',    53, '/procurement2/orders'),
  ('MENU_PRC2_PAYMENT',    '采购V2 付款',       'PRC',    54, '/procurement2/payments'),
  ('MENU_PRC2_FUND',       '采购V2 股东资金',   'PRC',    55, '/procurement2/shareholder-funds'),
  ('MENU_PRC2_SHIPMENT',   '采购V2 物流运单',   'PRC',    56, '/procurement2/shipments'),
  ('MENU_PRC2_RECEIPT',    '采购V2 收货',       'PRC',    57, '/procurement2/receipts'),
  ('MENU_PRC2_DASHBOARD',  '采购V2 看板',       'PRC',    58, '/procurement2/dashboard'),
  ('MENU_PRC2_SUPPLIER',   '采购V2 供应商',     'PRC',    59, '/procurement2/suppliers'),
  ('MENU_PRC2_PROJECT',    '采购V2 项目',       'PRC',    60, '/procurement2/projects'),
  ('MENU_PRC2_INIT',       '采购V2 历史初始化', 'PRC',    61, '/procurement2/init'),

  -- 财务 V2
  ('MENU_FIN2',            '财务V2 主模块',     'FINANCE', 62, '/finance2'),
  ('MENU_FIN2_AP',         '财务V2 应付账款',   'FINANCE', 63, '/finance2/ap'),
  ('MENU_FIN2_AR',         '财务V2 应收账款',   'FINANCE', 64, '/finance2/ar'),
  ('MENU_FIN2_CASH',       '财务V2 资金账户',   'FINANCE', 65, '/finance2/cash-accounts'),
  ('MENU_FIN2_EXPENSE',    '财务V2 费用管理',   'FINANCE', 66, '/finance2/expenses'),
  ('MENU_FIN2_BUDGET',     '财务V2 预算管理',   'FINANCE', 67, '/finance2/reports'),
  ('MENU_FIN2_SHAREHOLDER','财务V2 股东资金',   'FINANCE', 68, '/finance2/shareholder-funds'),
  ('MENU_FIN2_REPORT',     '财务V2 财务报表',   'FINANCE', 69, '/finance2/reports'),

  -- Sales V2
  ('MENU_SALES2',          'Sales V2 主模块',   'SALES',  70, '/sales2'),
  ('MENU_SALES2_CUSTOMER', 'Sales V2 客户主档', 'SALES',  71, '/sales2/customers'),
  ('MENU_SALES2_CHANNEL',  'Sales V2 销售渠道', 'SALES',  72, '/sales2/customers'),
  ('MENU_SALES2_PRICE',    'Sales V2 价格管理', 'SALES',  73, '/sales2/pricing'),
  ('MENU_SALES2_ORDER',    'Sales V2 销售订单', 'SALES',  74, '/sales2/orders'),

  -- 工作流 & 组织
  ('MENU_WORKFLOW',        '工作流审批',         'COMMON', 75, '/workflow'),
  ('MENU_SYS_ORG',         '组织架构',           'COMMON', 76, '/settings/organizations')

ON CONFLICT (menu_code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 2. 写入 sys_role_menu_permission（ON CONFLICT → 更新 perm_codes）
--    数据源：rbac.matrix.ts（ROLE_MENU_MATRIX 逐条转录）
--    注意：JOIN 时缺失的 role_code → 自动跳过，不报错
-- ──────────────────────────────────────────────────────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, x.perm_codes
FROM (VALUES

  -- ═══════════════════════════════════════════
  -- 采购 V2 — MENU_PRC2
  -- ═══════════════════════════════════════════
  ('ROLE_ADMIN',        'MENU_PRC2', 'V,C,E,D,A,X'),
  ('ROLE_PRC_BUYER',    'MENU_PRC2', 'V,C,E,D,X'),
  ('ROLE_FARM_MGR',     'MENU_PRC2', 'V,C'),
  ('ROLE_FIN_ACCT',     'MENU_PRC2', 'V,X'),
  ('ROLE_FIN_CFO',      'MENU_PRC2', 'V,A,X'),
  ('ROLE_CEO',          'MENU_PRC2', 'V,A,X'),
  ('ROLE_REGION_MGR',   'MENU_PRC2', 'V'),
  ('ROLE_LOG_MGR',      'MENU_PRC2', 'V,E'),

  -- 采购 V2 — MENU_PRC2_MASTER
  ('ROLE_ADMIN',        'MENU_PRC2_MASTER', 'V,C,E,D,A,X'),
  ('ROLE_PRC_BUYER',    'MENU_PRC2_MASTER', 'V,C,E,X'),
  ('ROLE_FARM_MGR',     'MENU_PRC2_MASTER', 'V'),
  ('ROLE_FIN_CFO',      'MENU_PRC2_MASTER', 'V'),
  ('ROLE_CEO',          'MENU_PRC2_MASTER', 'V'),
  ('ROLE_REGION_MGR',   'MENU_PRC2_MASTER', 'V'),
  ('ROLE_PROJECT_MGR',  'MENU_PRC2_MASTER', 'V,C,E'),
  ('ROLE_FACTORY_ACCT', 'MENU_PRC2_MASTER', 'V'),

  -- 采购 V2 — MENU_PRC2_REQUEST
  ('ROLE_ADMIN',        'MENU_PRC2_REQUEST', 'V,C,E,D,A,X'),
  ('ROLE_CEO',          'MENU_PRC2_REQUEST', 'V,A,X'),
  ('ROLE_FIN_CFO',      'MENU_PRC2_REQUEST', 'V,A'),
  ('ROLE_PRC_BUYER',    'MENU_PRC2_REQUEST', 'V,C,E,D,X'),
  ('ROLE_FARM_MGR',     'MENU_PRC2_REQUEST', 'V,C,E'),
  ('ROLE_PROJECT_MGR',  'MENU_PRC2_REQUEST', 'V,C,E'),
  ('ROLE_FACTORY_ACCT', 'MENU_PRC2_REQUEST', 'V'),

  -- 采购 V2 — MENU_PRC2_ORDER
  ('ROLE_ADMIN',        'MENU_PRC2_ORDER', 'V,C,E,D,A,X'),
  ('ROLE_PRC_BUYER',    'MENU_PRC2_ORDER', 'V,C,E,D,X'),
  ('ROLE_FARM_MGR',     'MENU_PRC2_ORDER', 'V,C'),
  ('ROLE_FIN_ACCT',     'MENU_PRC2_ORDER', 'V,X'),
  ('ROLE_FIN_CFO',      'MENU_PRC2_ORDER', 'V,A,X'),
  ('ROLE_CEO',          'MENU_PRC2_ORDER', 'V,A,X'),
  ('ROLE_REGION_MGR',   'MENU_PRC2_ORDER', 'V'),
  ('ROLE_PROJECT_MGR',  'MENU_PRC2_ORDER', 'V,C,E'),
  ('ROLE_FACTORY_ACCT', 'MENU_PRC2_ORDER', 'V'),

  -- 采购 V2 — MENU_PRC2_PAYMENT
  ('ROLE_ADMIN',        'MENU_PRC2_PAYMENT', 'V,C,E,D,A,X'),
  ('ROLE_FIN_CFO',      'MENU_PRC2_PAYMENT', 'V,C,E,A,X'),
  ('ROLE_FIN_ACCT',     'MENU_PRC2_PAYMENT', 'V,C,E,X'),
  ('ROLE_PRC_BUYER',    'MENU_PRC2_PAYMENT', 'V'),
  ('ROLE_CEO',          'MENU_PRC2_PAYMENT', 'V,A,X'),

  -- 采购 V2 — MENU_PRC2_FUND
  ('ROLE_ADMIN',            'MENU_PRC2_FUND', 'V,C,E,D,A,X'),
  ('ROLE_FIN_CFO',          'MENU_PRC2_FUND', 'V,C,E,A,X'),
  ('ROLE_CEO',              'MENU_PRC2_FUND', 'V,A,X'),
  ('ROLE_SHAREHOLDER_VIEW', 'MENU_PRC2_FUND', 'V'),

  -- 采购 V2 — MENU_PRC2_SHIPMENT
  ('ROLE_ADMIN',        'MENU_PRC2_SHIPMENT', 'V,C,E,D,A,X'),
  ('ROLE_PRC_BUYER',    'MENU_PRC2_SHIPMENT', 'V,C,E,X'),
  ('ROLE_LOG_MGR',      'MENU_PRC2_SHIPMENT', 'V,C,E,X'),
  ('ROLE_FARM_MGR',     'MENU_PRC2_SHIPMENT', 'V'),
  ('ROLE_FIN_ACCT',     'MENU_PRC2_SHIPMENT', 'V,X'),
  ('ROLE_FIN_CFO',      'MENU_PRC2_SHIPMENT', 'V,X'),
  ('ROLE_CEO',          'MENU_PRC2_SHIPMENT', 'V,X'),
  ('ROLE_REGION_MGR',   'MENU_PRC2_SHIPMENT', 'V'),
  ('ROLE_PROJECT_MGR',  'MENU_PRC2_SHIPMENT', 'V,C,E'),
  ('ROLE_FACTORY_ACCT', 'MENU_PRC2_SHIPMENT', 'V'),

  -- 采购 V2 — MENU_PRC2_RECEIPT
  ('ROLE_ADMIN',        'MENU_PRC2_RECEIPT', 'V,C,E,D,A,X'),
  ('ROLE_PRC_BUYER',    'MENU_PRC2_RECEIPT', 'V,C,E,X'),
  ('ROLE_LOG_MGR',      'MENU_PRC2_RECEIPT', 'V,C,E,X'),
  ('ROLE_FARM_MGR',     'MENU_PRC2_RECEIPT', 'V,C,E'),
  ('ROLE_FIN_ACCT',     'MENU_PRC2_RECEIPT', 'V,X'),
  ('ROLE_FIN_CFO',      'MENU_PRC2_RECEIPT', 'V,X'),
  ('ROLE_CEO',          'MENU_PRC2_RECEIPT', 'V,X'),
  ('ROLE_REGION_MGR',   'MENU_PRC2_RECEIPT', 'V'),
  ('ROLE_PROJECT_MGR',  'MENU_PRC2_RECEIPT', 'V,C,E'),
  ('ROLE_FACTORY_ACCT', 'MENU_PRC2_RECEIPT', 'V'),

  -- 采购 V2 — MENU_PRC2_DASHBOARD
  ('ROLE_ADMIN',        'MENU_PRC2_DASHBOARD', 'V,X'),
  ('ROLE_PRC_BUYER',    'MENU_PRC2_DASHBOARD', 'V,X'),
  ('ROLE_FARM_MGR',     'MENU_PRC2_DASHBOARD', 'V'),
  ('ROLE_FIN_ACCT',     'MENU_PRC2_DASHBOARD', 'V,X'),
  ('ROLE_FIN_CFO',      'MENU_PRC2_DASHBOARD', 'V,X'),
  ('ROLE_CEO',          'MENU_PRC2_DASHBOARD', 'V,X'),
  ('ROLE_REGION_MGR',   'MENU_PRC2_DASHBOARD', 'V'),
  ('ROLE_PROJECT_MGR',  'MENU_PRC2_DASHBOARD', 'V'),
  ('ROLE_FACTORY_ACCT', 'MENU_PRC2_DASHBOARD', 'V'),

  -- 采购 V2 — MENU_PRC2_SUPPLIER
  ('ROLE_ADMIN',        'MENU_PRC2_SUPPLIER', 'V,C,E,D,A,X'),
  ('ROLE_PRC_BUYER',    'MENU_PRC2_SUPPLIER', 'V,C,E,X'),
  ('ROLE_FIN_CFO',      'MENU_PRC2_SUPPLIER', 'V,X'),
  ('ROLE_FARM_MGR',     'MENU_PRC2_SUPPLIER', 'V'),
  ('ROLE_PROJECT_MGR',  'MENU_PRC2_SUPPLIER', 'V'),
  ('ROLE_FACTORY_ACCT', 'MENU_PRC2_SUPPLIER', 'V'),

  -- 采购 V2 — MENU_PRC2_PROJECT
  ('ROLE_ADMIN',        'MENU_PRC2_PROJECT', 'V,C,E,D,A,X'),
  ('ROLE_CEO',          'MENU_PRC2_PROJECT', 'V,X'),
  ('ROLE_REGION_MGR',   'MENU_PRC2_PROJECT', 'V,X'),
  ('ROLE_FIN_CFO',      'MENU_PRC2_PROJECT', 'V,X'),
  ('ROLE_PRC_BUYER',    'MENU_PRC2_PROJECT', 'V,C,E'),
  ('ROLE_PROJECT_MGR',  'MENU_PRC2_PROJECT', 'V,C,E'),
  ('ROLE_FACTORY_ACCT', 'MENU_PRC2_PROJECT', 'V'),

  -- 采购 V2 — MENU_PRC2_INIT（仅超管，JOIN 无匹配时自动跳过）
  ('ROLE_ADMIN',        'MENU_PRC2_INIT', 'V,C,E,D,A,X'),

  -- ═══════════════════════════════════════════
  -- 财务 V2 — MENU_FIN2
  -- ═══════════════════════════════════════════
  ('ROLE_ADMIN',              'MENU_FIN2', 'V,C,E,D,A,X'),
  ('ROLE_FIN_CFO',            'MENU_FIN2', 'V,C,E,A,X'),
  ('ROLE_GROUP_FINANCE',      'MENU_FIN2', 'V,C,E,A,X'),
  ('ROLE_FACTORY_ACCOUNTANT', 'MENU_FIN2', 'V,C,E,X'),
  ('ROLE_CEO',                'MENU_FIN2', 'V,A,X'),
  ('ROLE_AUDITOR',            'MENU_FIN2', 'V,X'),

  -- 财务 V2 — MENU_FIN2_AP
  ('ROLE_ADMIN',              'MENU_FIN2_AP', 'V,C,E,D,A,X'),
  ('ROLE_FIN_CFO',            'MENU_FIN2_AP', 'V,C,E,A,X'),
  ('ROLE_GROUP_FINANCE',      'MENU_FIN2_AP', 'V,C,E,A,X'),
  ('ROLE_FACTORY_ACCOUNTANT', 'MENU_FIN2_AP', 'V,C,E,X'),
  ('ROLE_CEO',                'MENU_FIN2_AP', 'V,A,X'),
  ('ROLE_AUDITOR',            'MENU_FIN2_AP', 'V,X'),
  ('ROLE_PRC_BUYER',          'MENU_FIN2_AP', 'V'),

  -- 财务 V2 — MENU_FIN2_AR
  ('ROLE_ADMIN',              'MENU_FIN2_AR', 'V,C,E,D,A,X'),
  ('ROLE_FIN_CFO',            'MENU_FIN2_AR', 'V,C,E,A,X'),
  ('ROLE_GROUP_FINANCE',      'MENU_FIN2_AR', 'V,C,E,A,X'),
  ('ROLE_FACTORY_ACCOUNTANT', 'MENU_FIN2_AR', 'V,C,E,X'),
  ('ROLE_CEO',                'MENU_FIN2_AR', 'V,A,X'),
  ('ROLE_AUDITOR',            'MENU_FIN2_AR', 'V,X'),

  -- 财务 V2 — MENU_FIN2_CASH
  ('ROLE_ADMIN',              'MENU_FIN2_CASH', 'V,C,E,D,A,X'),
  ('ROLE_FIN_CFO',            'MENU_FIN2_CASH', 'V,C,E,A,X'),
  ('ROLE_GROUP_FINANCE',      'MENU_FIN2_CASH', 'V,C,E,X'),
  ('ROLE_FACTORY_ACCOUNTANT', 'MENU_FIN2_CASH', 'V,C,X'),
  ('ROLE_CEO',                'MENU_FIN2_CASH', 'V,X'),
  ('ROLE_AUDITOR',            'MENU_FIN2_CASH', 'V,X'),

  -- 财务 V2 — MENU_FIN2_EXPENSE
  ('ROLE_ADMIN',              'MENU_FIN2_EXPENSE', 'V,C,E,D,A,X'),
  ('ROLE_FIN_CFO',            'MENU_FIN2_EXPENSE', 'V,C,E,A,X'),
  ('ROLE_GROUP_FINANCE',      'MENU_FIN2_EXPENSE', 'V,C,E,A,X'),
  ('ROLE_FACTORY_ACCOUNTANT', 'MENU_FIN2_EXPENSE', 'V,C,E,X'),
  ('ROLE_CEO',                'MENU_FIN2_EXPENSE', 'V,A,X'),
  ('ROLE_FARM_MGR',           'MENU_FIN2_EXPENSE', 'V,C'),
  ('ROLE_STORE_MGR',          'MENU_FIN2_EXPENSE', 'V,C'),
  ('ROLE_AUDITOR',            'MENU_FIN2_EXPENSE', 'V,X'),

  -- 财务 V2 — MENU_FIN2_BUDGET
  ('ROLE_ADMIN',              'MENU_FIN2_BUDGET', 'V,C,E,D,A,X'),
  ('ROLE_FIN_CFO',            'MENU_FIN2_BUDGET', 'V,C,E,A,X'),
  ('ROLE_GROUP_FINANCE',      'MENU_FIN2_BUDGET', 'V,C,E,A,X'),
  ('ROLE_CEO',                'MENU_FIN2_BUDGET', 'V,A,X'),
  ('ROLE_AUDITOR',            'MENU_FIN2_BUDGET', 'V,X'),

  -- 财务 V2 — MENU_FIN2_SHAREHOLDER
  ('ROLE_ADMIN',              'MENU_FIN2_SHAREHOLDER', 'V,C,E,D,A,X'),
  ('ROLE_FIN_CFO',            'MENU_FIN2_SHAREHOLDER', 'V,C,E,A,X'),
  ('ROLE_GROUP_FINANCE',      'MENU_FIN2_SHAREHOLDER', 'V,C,E,A,X'),
  ('ROLE_CEO',                'MENU_FIN2_SHAREHOLDER', 'V,A,X'),
  ('ROLE_SHAREHOLDER_VIEW',   'MENU_FIN2_SHAREHOLDER', 'V'),
  ('ROLE_AUDITOR',            'MENU_FIN2_SHAREHOLDER', 'V,X'),

  -- 财务 V2 — MENU_FIN2_REPORT
  ('ROLE_ADMIN',              'MENU_FIN2_REPORT', 'V,X'),
  ('ROLE_FIN_CFO',            'MENU_FIN2_REPORT', 'V,X'),
  ('ROLE_GROUP_FINANCE',      'MENU_FIN2_REPORT', 'V,X'),
  ('ROLE_CEO',                'MENU_FIN2_REPORT', 'V,X'),
  ('ROLE_AUDITOR',            'MENU_FIN2_REPORT', 'V,X'),

  -- ═══════════════════════════════════════════
  -- Sales V2 — MENU_SALES2（主模块）
  -- ═══════════════════════════════════════════
  ('ROLE_ADMIN',         'MENU_SALES2', 'V,C,E,D,A,X'),
  ('ROLE_CEO',           'MENU_SALES2', 'V,X'),
  ('ROLE_GROUP_FINANCE', 'MENU_SALES2', 'V,X'),
  ('ROLE_SALES_MGR',     'MENU_SALES2', 'V,C,E,D,A,X'),
  ('ROLE_SALES_REP',     'MENU_SALES2', 'V,C,E'),
  ('ROLE_STORE_MGR',     'MENU_SALES2', 'V'),
  ('ROLE_REGION_MGR',    'MENU_SALES2', 'V,X'),
  ('ROLE_AUDITOR',       'MENU_SALES2', 'V,X'),

  -- Sales V2 — MENU_SALES2_CUSTOMER
  ('ROLE_ADMIN',         'MENU_SALES2_CUSTOMER', 'V,C,E,D,A,X'),
  ('ROLE_CEO',           'MENU_SALES2_CUSTOMER', 'V,X'),
  ('ROLE_GROUP_FINANCE', 'MENU_SALES2_CUSTOMER', 'V,X'),
  ('ROLE_SALES_MGR',     'MENU_SALES2_CUSTOMER', 'V,C,E,D,A,X'),
  ('ROLE_SALES_REP',     'MENU_SALES2_CUSTOMER', 'V,C,E'),
  ('ROLE_STORE_MGR',     'MENU_SALES2_CUSTOMER', 'V'),
  ('ROLE_REGION_MGR',    'MENU_SALES2_CUSTOMER', 'V,X'),
  ('ROLE_AUDITOR',       'MENU_SALES2_CUSTOMER', 'V,X'),

  -- Sales V2 — MENU_SALES2_CHANNEL
  ('ROLE_ADMIN',         'MENU_SALES2_CHANNEL', 'V,C,E,D,A,X'),
  ('ROLE_CEO',           'MENU_SALES2_CHANNEL', 'V,X'),
  ('ROLE_GROUP_FINANCE', 'MENU_SALES2_CHANNEL', 'V,X'),
  ('ROLE_SALES_MGR',     'MENU_SALES2_CHANNEL', 'V,C,E,D,A,X'),
  ('ROLE_SALES_REP',     'MENU_SALES2_CHANNEL', 'V'),
  ('ROLE_REGION_MGR',    'MENU_SALES2_CHANNEL', 'V,X'),
  ('ROLE_AUDITOR',       'MENU_SALES2_CHANNEL', 'V,X'),

  -- Sales V2 — MENU_SALES2_PRICE
  ('ROLE_ADMIN',         'MENU_SALES2_PRICE', 'V,C,E,D,A,X'),
  ('ROLE_CEO',           'MENU_SALES2_PRICE', 'V,A,X'),
  ('ROLE_GROUP_FINANCE', 'MENU_SALES2_PRICE', 'V,X'),
  ('ROLE_SALES_MGR',     'MENU_SALES2_PRICE', 'V,C,E,D,A,X'),
  ('ROLE_SALES_REP',     'MENU_SALES2_PRICE', 'V'),
  ('ROLE_REGION_MGR',    'MENU_SALES2_PRICE', 'V,X'),
  ('ROLE_AUDITOR',       'MENU_SALES2_PRICE', 'V,X'),

  -- Sales V2 — MENU_SALES2_ORDER
  ('ROLE_ADMIN',         'MENU_SALES2_ORDER', 'V,C,E,D,A,X'),
  ('ROLE_CEO',           'MENU_SALES2_ORDER', 'V,A,X'),
  ('ROLE_GROUP_FINANCE', 'MENU_SALES2_ORDER', 'V,X'),
  ('ROLE_FIN_CFO',       'MENU_SALES2_ORDER', 'V,A,X'),
  ('ROLE_SALES_MGR',     'MENU_SALES2_ORDER', 'V,C,E,D,A,X'),
  ('ROLE_SALES_REP',     'MENU_SALES2_ORDER', 'V,C,E'),
  ('ROLE_REGION_MGR',    'MENU_SALES2_ORDER', 'V,A,X'),
  ('ROLE_LOG_MGR',       'MENU_SALES2_ORDER', 'V,E'),
  ('ROLE_AUDITOR',       'MENU_SALES2_ORDER', 'V,X'),

  -- ═══════════════════════════════════════════
  -- 工作流 — MENU_WORKFLOW
  -- ═══════════════════════════════════════════
  ('ROLE_ADMIN',        'MENU_WORKFLOW', 'V,C,E,D,A,X'),
  ('ROLE_CEO',          'MENU_WORKFLOW', 'V,C,E,D,A,X'),
  ('ROLE_FIN_CFO',      'MENU_WORKFLOW', 'V,C,E,D,A,X'),
  ('ROLE_PRC_BUYER',    'MENU_WORKFLOW', 'V,A,X'),
  ('ROLE_FIN_ACCT',     'MENU_WORKFLOW', 'V,X'),
  ('ROLE_REGION_MGR',   'MENU_WORKFLOW', 'V,A'),
  ('ROLE_FARM_MGR',     'MENU_WORKFLOW', 'V'),
  ('ROLE_STORE_MGR',    'MENU_WORKFLOW', 'V'),
  ('ROLE_PROJECT_MGR',  'MENU_WORKFLOW', 'V,A'),
  ('ROLE_SALES_MGR',    'MENU_WORKFLOW', 'V,A'),
  ('ROLE_SALES_REP',    'MENU_WORKFLOW', 'V'),

  -- ═══════════════════════════════════════════
  -- 组织架构 — MENU_SYS_ORG
  -- ═══════════════════════════════════════════
  ('ROLE_ADMIN',        'MENU_SYS_ORG', 'V,C,E,D,A,X'),
  ('ROLE_HR_ADMIN',     'MENU_SYS_ORG', 'V,C,E,D'),
  ('ROLE_SYSOPS',       'MENU_SYS_ORG', 'V,C,E'),
  ('ROLE_CEO',          'MENU_SYS_ORG', 'V')

) AS x(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = x.role_code
JOIN sys_menu m  ON m.menu_code = x.menu_code
ON CONFLICT (role_id, menu_id)
  DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

COMMIT;

-- ──────────────────────────────────────────────────────────────
-- 验证：查看本次插入的菜单数量
-- ──────────────────────────────────────────────────────────────
SELECT menu_code, menu_name_zh, domain, sort_order
FROM sys_menu
WHERE menu_code IN (
  'MENU_PRC2','MENU_PRC2_MASTER','MENU_PRC2_REQUEST','MENU_PRC2_ORDER',
  'MENU_PRC2_PAYMENT','MENU_PRC2_FUND','MENU_PRC2_SHIPMENT','MENU_PRC2_RECEIPT',
  'MENU_PRC2_DASHBOARD','MENU_PRC2_SUPPLIER','MENU_PRC2_PROJECT','MENU_PRC2_INIT',
  'MENU_FIN2','MENU_FIN2_AP','MENU_FIN2_AR','MENU_FIN2_CASH',
  'MENU_FIN2_EXPENSE','MENU_FIN2_BUDGET','MENU_FIN2_SHAREHOLDER','MENU_FIN2_REPORT',
  'MENU_SALES2','MENU_SALES2_CUSTOMER','MENU_SALES2_CHANNEL',
  'MENU_SALES2_PRICE','MENU_SALES2_ORDER',
  'MENU_WORKFLOW','MENU_SYS_ORG'
)
ORDER BY sort_order;
