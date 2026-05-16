-- ============================================================
-- DDL-10: RBAC 完整权限矩阵补全
-- 用途: 补充侧边栏使用但 DB 缺失的菜单码，并为所有 35 个角色
--       填写完整的 sys_role_menu_permission 三元组
-- 执行: psql -U mac -d phoenix_erp -f ddl/10_rbac_complete_matrix.sql
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1. 补充缺失的 sys_menu 记录
--    (仅 INSERT 不存在的，ON CONFLICT DO NOTHING 保证幂等)
-- ──────────────────────────────────────────────────────────────
INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, sort_order, icon, route) VALUES
  ('MENU_DEVICE_MONITOR',  '设备监控',     'ຕິດຕາມອຸປະກອນ',        'FARM',   14, 'monitor',  '/breeding/device'),
  ('MENU_WMS_MASTER',      '仓库主档',     'ຂໍ້ມູນຫຼັກສາງ',         'WMS',    29, 'wh-master','/warehouse/warehouses'),
  ('MENU_LOGISTICS_MASTER','物流主档',     'ຂໍ້ມູນຫຼັກຂົນສົ່ງ',      'LOG',    30, 'log-master','/transport/vehicles'),
  ('MENU_QA_MASTER',       '质检主档',     'ຂໍ້ມູນຫຼັກຄຸນນະພາບ',    'QA',     31, 'qa-master','/quality/standards'),
  ('MENU_PRC_MASTER',      '采购主档',     'ຂໍ້ມູນຫຼັກຈັດຊື້',       'PRC',    32, 'prc-master','/procurement/suppliers'),
  ('MENU_ORDER_WH',        '仓库拣货',     'ການເລືອກສາງ',           'ORDER',  33, 'order-wh', '/order/picking'),
  ('MENU_ORDER_FIN',       '订单财务',     'ການເງິນຄຳສັ່ງ',          'ORDER',  34, 'order-fin','/order/credit'),
  ('MENU_MASTER',          '主数据管理',   'ຂໍ້ມູນຫຼັກ',             'COMMON', 35, 'master',   '/master'),
  ('MENU_SETTINGS_USER',   '用户管理',     'ການຄຸ້ມຄອງຜູ້ໃຊ້',       'COMMON', 36, 'users',    '/settings/users'),
  ('MENU_SETTINGS_IT',     'IT 系统管理',  'ການຄຸ້ມຄອງ IT',          'COMMON', 37, 'it',       '/settings/roles'),
  ('MENU_SETTINGS_DATA',   '数据字典管理', 'ການຄຸ້ມຄອງຂໍ້ມູນ',       'COMMON', 38, 'dict',     '/settings/dict')
ON CONFLICT (menu_code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 2. 清空旧矩阵，全量重写（idempotent）
-- ──────────────────────────────────────────────────────────────
DELETE FROM sys_role_menu_permission;

-- ──────────────────────────────────────────────────────────────
-- 3. 批量插入 — 全 35 角色 × 所有菜单 的完整权限矩阵
-- ──────────────────────────────────────────────────────────────
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, perm.perm_codes
FROM (VALUES
  -- ═════════════════════════════════════════════════
  -- ROLE_CEO  (approval_level=4, 全只读+审批)
  -- ═════════════════════════════════════════════════
  ('ROLE_CEO','MENU_DASHBOARD','V,X'),
  ('ROLE_CEO','MENU_APPROVAL','V,A'),
  ('ROLE_CEO','MENU_FIN_AUDIT','V,X'),
  ('ROLE_CEO','MENU_FIN_REPORT','V,X'),
  ('ROLE_CEO','MENU_FIN_CLOSE','V,A'),
  ('ROLE_CEO','MENU_ORDER_MGR','V,X'),
  ('ROLE_CEO','MENU_STORE_MGR','V'),
  ('ROLE_CEO','MENU_POS_STORE','V'),
  ('ROLE_CEO','MENU_POS_CASH','V'),
  ('ROLE_CEO','MENU_FARM_DATA','V,X'),
  ('ROLE_CEO','MENU_FARM_OVERVIEW','V'),
  ('ROLE_CEO','MENU_FARM_DAILY','V,X'),
  ('ROLE_CEO','MENU_FARM_QA','V,X'),
  ('ROLE_CEO','MENU_FARM_VET','V'),
  ('ROLE_CEO','MENU_DEVICE_MONITOR','V'),
  ('ROLE_CEO','MENU_QA_OP','V,X'),
  ('ROLE_CEO','MENU_QA_MGR','V,X'),
  ('ROLE_CEO','MENU_QA_PRODUCT','V,X'),
  ('ROLE_CEO','MENU_QA_MASTER','V'),
  ('ROLE_CEO','MENU_PKG_OP','V,X'),
  ('ROLE_CEO','MENU_PKG_MGR','V,X'),
  ('ROLE_CEO','MENU_PACKAGE_RUN','V'),
  ('ROLE_CEO','MENU_WMS_VIEW','V,X'),
  ('ROLE_CEO','MENU_WMS_INOUT','V,X'),
  ('ROLE_CEO','MENU_WMS_OP','V'),
  ('ROLE_CEO','MENU_WMS_MASTER','V'),
  ('ROLE_CEO','MENU_LOGISTICS','V,X'),
  ('ROLE_CEO','MENU_LOG_DISPATCH','V'),
  ('ROLE_CEO','MENU_LOG_REVIEW','V,A'),
  ('ROLE_CEO','MENU_LOGISTICS_MASTER','V'),
  ('ROLE_CEO','MENU_PRC_MGR','V,A,X'),
  ('ROLE_CEO','MENU_PRC_MASTER','V'),
  ('ROLE_CEO','MENU_ORDER_WH','V'),
  ('ROLE_CEO','MENU_ORDER_FIN','V,X'),
  ('ROLE_CEO','MENU_B2B_SALE','V,X'),
  ('ROLE_CEO','MENU_MASTER','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_HQ_FINANCE  (approval_level=3, 财务审计只读+导出)
  -- ═════════════════════════════════════════════════
  ('ROLE_HQ_FINANCE','MENU_DASHBOARD','V'),
  ('ROLE_HQ_FINANCE','MENU_APPROVAL','V,A'),
  ('ROLE_HQ_FINANCE','MENU_FIN_AUDIT','V,X'),
  ('ROLE_HQ_FINANCE','MENU_FIN_REPORT','V,X'),
  ('ROLE_HQ_FINANCE','MENU_FIN_CLOSE','V'),
  ('ROLE_HQ_FINANCE','MENU_ORDER_MGR','V,X'),
  ('ROLE_HQ_FINANCE','MENU_ORDER_FIN','V,X'),

  -- ═════════════════════════════════════════════════
  -- ROLE_FIN_CFO  (approval_level=3, 财务总监)
  -- ═════════════════════════════════════════════════
  ('ROLE_FIN_CFO','MENU_DASHBOARD','V'),
  ('ROLE_FIN_CFO','MENU_APPROVAL','V,A'),
  ('ROLE_FIN_CFO','MENU_FIN_AUDIT','V,X'),
  ('ROLE_FIN_CFO','MENU_FIN_REPORT','V,X'),
  ('ROLE_FIN_CFO','MENU_FIN_CLOSE','V,A,X'),
  ('ROLE_FIN_CFO','MENU_ORDER_MGR','V,X'),
  ('ROLE_FIN_CFO','MENU_ORDER_FIN','V,X'),
  ('ROLE_FIN_CFO','MENU_PRC_MGR','V,A'),

  -- ═════════════════════════════════════════════════
  -- ROLE_FIN_ACCT  (approval_level=2, 财务会计)
  -- ═════════════════════════════════════════════════
  ('ROLE_FIN_ACCT','MENU_APPROVAL','V,A'),
  ('ROLE_FIN_ACCT','MENU_FIN_AUDIT','V,C,E,X'),
  ('ROLE_FIN_ACCT','MENU_FIN_REPORT','V,X'),
  ('ROLE_FIN_ACCT','MENU_FIN_CLOSE','V,C,E,A'),
  ('ROLE_FIN_ACCT','MENU_ORDER_MGR','V,E'),
  ('ROLE_FIN_ACCT','MENU_ORDER_FIN','V,C,E'),

  -- ═════════════════════════════════════════════════
  -- ROLE_FIN_AR  (approval_level=2, 应收专员)
  -- ═════════════════════════════════════════════════
  ('ROLE_FIN_AR','MENU_APPROVAL','V,A'),
  ('ROLE_FIN_AR','MENU_FIN_AUDIT','V'),
  ('ROLE_FIN_AR','MENU_ORDER_MGR','V,E'),
  ('ROLE_FIN_AR','MENU_ORDER_FIN','V,C,E'),

  -- ═════════════════════════════════════════════════
  -- ROLE_FIN_COST  (approval_level=2, 成本会计)
  -- ═════════════════════════════════════════════════
  ('ROLE_FIN_COST','MENU_FIN_AUDIT','V'),
  ('ROLE_FIN_COST','MENU_FIN_REPORT','V,X'),
  ('ROLE_FIN_COST','MENU_FARM_DATA','V,X'),
  ('ROLE_FIN_COST','MENU_PKG_MGR','V,X'),

  -- ═════════════════════════════════════════════════
  -- ROLE_REGION_MGR  (approval_level=3, 区域督导)
  -- ═════════════════════════════════════════════════
  ('ROLE_REGION_MGR','MENU_DASHBOARD','V,X'),
  ('ROLE_REGION_MGR','MENU_APPROVAL','V,A'),
  ('ROLE_REGION_MGR','MENU_STORE_MGR','V,E'),
  ('ROLE_REGION_MGR','MENU_POS_STORE','V'),
  ('ROLE_REGION_MGR','MENU_FIN_REPORT','V,X'),
  ('ROLE_REGION_MGR','MENU_FIN_CLOSE','V'),
  ('ROLE_REGION_MGR','MENU_ORDER_MGR','V,E,X'),
  ('ROLE_REGION_MGR','MENU_ORDER_FIN','V,X'),
  ('ROLE_REGION_MGR','MENU_B2B_SALE','V,E,X'),
  ('ROLE_REGION_MGR','MENU_FARM_DATA','V,X'),
  ('ROLE_REGION_MGR','MENU_FARM_OVERVIEW','V'),
  ('ROLE_REGION_MGR','MENU_WMS_VIEW','V'),
  ('ROLE_REGION_MGR','MENU_LOGISTICS','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_FARM_MGR  (approval_level=2, 养殖场长)
  -- ═════════════════════════════════════════════════
  ('ROLE_FARM_MGR','MENU_FARM_DATA','V,C,E,X'),
  ('ROLE_FARM_MGR','MENU_FARM_OVERVIEW','V'),
  ('ROLE_FARM_MGR','MENU_FARM_DAILY','V,C,E,X'),
  ('ROLE_FARM_MGR','MENU_FARM_QA','V,C,E'),
  ('ROLE_FARM_MGR','MENU_FARM_VET','V,E'),
  ('ROLE_FARM_MGR','MENU_DEVICE_MONITOR','V'),
  ('ROLE_FARM_MGR','MENU_APPROVAL','V,A'),
  ('ROLE_FARM_MGR','MENU_QA_OP','V'),
  ('ROLE_FARM_MGR','MENU_PKG_OP','V'),
  ('ROLE_FARM_MGR','MENU_WMS_VIEW','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_VET  (approval_level=2, 驻场兽医)
  -- ═════════════════════════════════════════════════
  ('ROLE_VET','MENU_FARM_VET','V,C,E'),
  ('ROLE_VET','MENU_FARM_QA','V,E'),
  ('ROLE_VET','MENU_FARM_DATA','V'),
  ('ROLE_VET','MENU_DEVICE_MONITOR','V'),
  ('ROLE_VET','MENU_QA_OP','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_FARMER  (approval_level=1, 饲养员)
  -- ═════════════════════════════════════════════════
  ('ROLE_FARMER','MENU_FARM_DATA','V'),
  ('ROLE_FARMER','MENU_FARM_DAILY','V,C,E'),
  ('ROLE_FARMER','MENU_FARM_OVERVIEW','V'),
  ('ROLE_FARMER','MENU_DEVICE_MONITOR','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_QA_MGR  (approval_level=2, 品控总监)
  -- ═════════════════════════════════════════════════
  ('ROLE_QA_MGR','MENU_QA_OP','V,X'),
  ('ROLE_QA_MGR','MENU_QA_MGR','V,C,E,A,X'),
  ('ROLE_QA_MGR','MENU_QA_PRODUCT','V,C,E,X'),
  ('ROLE_QA_MGR','MENU_QA_MASTER','V,C,E'),
  ('ROLE_QA_MGR','MENU_APPROVAL','V,A'),
  ('ROLE_QA_MGR','MENU_FARM_QA','V,X'),

  -- ═════════════════════════════════════════════════
  -- ROLE_QA_STAFF  (approval_level=1, 质检专员)
  -- ═════════════════════════════════════════════════
  ('ROLE_QA_STAFF','MENU_QA_OP','V,C,E'),
  ('ROLE_QA_STAFF','MENU_QA_PRODUCT','V,C,E'),
  ('ROLE_QA_STAFF','MENU_FARM_QA','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_PKG_MGR  (approval_level=2, 车间主任)
  -- ═════════════════════════════════════════════════
  ('ROLE_PKG_MGR','MENU_PKG_OP','V,X'),
  ('ROLE_PKG_MGR','MENU_PKG_MGR','V,C,E,X'),
  ('ROLE_PKG_MGR','MENU_PACKAGE_RUN','V,C,E'),
  ('ROLE_PKG_MGR','MENU_QA_OP','V'),
  ('ROLE_PKG_MGR','MENU_APPROVAL','V,A'),
  ('ROLE_PKG_MGR','MENU_WMS_VIEW','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_PKG_OP  (approval_level=1, 包装工人)
  -- ═════════════════════════════════════════════════
  ('ROLE_PKG_OP','MENU_PKG_OP','V,C'),
  ('ROLE_PKG_OP','MENU_PACKAGE_RUN','V,C'),

  -- ═════════════════════════════════════════════════
  -- ROLE_WMS_MGR  (approval_level=2, 仓储经理)
  -- ═════════════════════════════════════════════════
  ('ROLE_WMS_MGR','MENU_WMS_VIEW','V,X'),
  ('ROLE_WMS_MGR','MENU_WMS_INOUT','V,C,E,X'),
  ('ROLE_WMS_MGR','MENU_WMS_OP','V,C,E'),
  ('ROLE_WMS_MGR','MENU_WMS_MASTER','V,C,E'),
  ('ROLE_WMS_MGR','MENU_LOGISTICS','V'),
  ('ROLE_WMS_MGR','MENU_APPROVAL','V,A'),
  ('ROLE_WMS_MGR','MENU_ORDER_WH','V,E'),

  -- ═════════════════════════════════════════════════
  -- ROLE_WMS_OP  (approval_level=1, 仓管理货员)
  -- ═════════════════════════════════════════════════
  ('ROLE_WMS_OP','MENU_WMS_INOUT','V,C'),
  ('ROLE_WMS_OP','MENU_WMS_OP','V'),
  ('ROLE_WMS_OP','MENU_WMS_VIEW','V'),
  ('ROLE_WMS_OP','MENU_ORDER_WH','V,C'),

  -- ═════════════════════════════════════════════════
  -- ROLE_LOG_MGR  (approval_level=2, 物流调度)
  -- ═════════════════════════════════════════════════
  ('ROLE_LOG_MGR','MENU_LOGISTICS','V,C,E,X'),
  ('ROLE_LOG_MGR','MENU_LOG_DISPATCH','V,C,E,X'),
  ('ROLE_LOG_MGR','MENU_LOG_REVIEW','V,E,A'),
  ('ROLE_LOG_MGR','MENU_LOGISTICS_MASTER','V,C,E'),
  ('ROLE_LOG_MGR','MENU_APPROVAL','V,A'),
  ('ROLE_LOG_MGR','MENU_ORDER_WH','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_DRIVER  (approval_level=1, 司机)
  -- ═════════════════════════════════════════════════
  ('ROLE_DRIVER','MENU_LOGISTICS','V,E'),
  ('ROLE_DRIVER','MENU_LOG_DISPATCH','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_PDA_OP  (approval_level=1, PDA 作业员)
  -- ═════════════════════════════════════════════════
  ('ROLE_PDA_OP','MENU_WMS_INOUT','V,C'),
  ('ROLE_PDA_OP','MENU_QA_OP','V,C'),
  ('ROLE_PDA_OP','MENU_LOGISTICS','V,E'),

  -- ═════════════════════════════════════════════════
  -- ROLE_PRC_BUYER  (approval_level=1, 采购专员)
  -- ═════════════════════════════════════════════════
  ('ROLE_PRC_BUYER','MENU_PRC_MGR','V,C,E'),
  ('ROLE_PRC_BUYER','MENU_PRC_MASTER','V,C,E'),
  ('ROLE_PRC_BUYER','MENU_WMS_VIEW','V'),
  ('ROLE_PRC_BUYER','MENU_APPROVAL','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_STORE_MGR  (approval_level=2, 直营店店长)
  -- ═════════════════════════════════════════════════
  ('ROLE_STORE_MGR','MENU_STORE_MGR','V,C,E,X'),
  ('ROLE_STORE_MGR','MENU_POS_CASH','V,E,A'),
  ('ROLE_STORE_MGR','MENU_POS_STORE','V,E'),
  ('ROLE_STORE_MGR','MENU_FIN_CLOSE','V,E'),
  ('ROLE_STORE_MGR','MENU_APPROVAL','V,A'),
  ('ROLE_STORE_MGR','MENU_ORDER_MGR','V,E'),
  ('ROLE_STORE_MGR','MENU_WMS_VIEW','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_CASHIER  (approval_level=1, 前台收银员)
  -- ═════════════════════════════════════════════════
  ('ROLE_CASHIER','MENU_POS_CASH','V,C,E'),
  ('ROLE_CASHIER','MENU_POS_STORE','V'),
  ('ROLE_CASHIER','MENU_STORE_MGR','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_B2B_MGR  (approval_level=2, 大客总监)
  -- ═════════════════════════════════════════════════
  ('ROLE_B2B_MGR','MENU_B2B_SALE','V,C,E,A,X'),
  ('ROLE_B2B_MGR','MENU_ORDER_MGR','V,E,X'),
  ('ROLE_B2B_MGR','MENU_ORDER_FIN','V,X'),
  ('ROLE_B2B_MGR','MENU_APPROVAL','V,A'),

  -- ═════════════════════════════════════════════════
  -- ROLE_SALES_REP  (approval_level=1, 业务员)
  -- ═════════════════════════════════════════════════
  ('ROLE_SALES_REP','MENU_B2B_SALE','V,C,E'),
  ('ROLE_SALES_REP','MENU_ORDER_MGR','V,C,E'),

  -- ═════════════════════════════════════════════════
  -- ROLE_CUSTOMER_B2B  (approval_level=0, 自助订货用户)
  -- ═════════════════════════════════════════════════
  ('ROLE_CUSTOMER_B2B','MENU_B2B_SALE','V,C'),

  -- ═════════════════════════════════════════════════
  -- ROLE_SYSOPS  (approval_level=2, IT 运维)
  -- ═════════════════════════════════════════════════
  ('ROLE_SYSOPS','MENU_SETTINGS_USER','V,C,E'),
  ('ROLE_SYSOPS','MENU_SETTINGS_IT','V,C,E'),
  ('ROLE_SYSOPS','MENU_SETTINGS_DATA','V,C,E'),
  ('ROLE_SYSOPS','MENU_MASTER','V,C,E'),
  ('ROLE_SYSOPS','MENU_DASHBOARD','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_HR_ADMIN  (approval_level=2, HR 主管)
  -- ═════════════════════════════════════════════════
  ('ROLE_HR_ADMIN','MENU_SETTINGS_USER','V,C,E,D'),
  ('ROLE_HR_ADMIN','MENU_SETTINGS_DATA','V'),
  ('ROLE_HR_ADMIN','MENU_DASHBOARD','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_AUDITOR  (approval_level=2, 内审)
  -- ═════════════════════════════════════════════════
  ('ROLE_AUDITOR','MENU_FIN_AUDIT','V,X'),
  ('ROLE_AUDITOR','MENU_FIN_REPORT','V,X'),
  ('ROLE_AUDITOR','MENU_APPROVAL','V'),
  ('ROLE_AUDITOR','MENU_QA_MGR','V,X'),
  ('ROLE_AUDITOR','MENU_QA_PRODUCT','V,X'),
  ('ROLE_AUDITOR','MENU_FARM_DATA','V,X'),
  ('ROLE_AUDITOR','MENU_DASHBOARD','V,X'),
  ('ROLE_AUDITOR','MENU_SETTINGS_IT','V'),

  -- ═════════════════════════════════════════════════
  -- ROLE_LOGISTICS_MGR  (若存在; 同 ROLE_LOG_MGR 的别名)
  -- ═════════════════════════════════════════════════
  ('ROLE_LOGISTICS_MGR','MENU_LOGISTICS','V,C,E,X'),
  ('ROLE_LOGISTICS_MGR','MENU_LOG_DISPATCH','V,C,E,X'),
  ('ROLE_LOGISTICS_MGR','MENU_LOG_REVIEW','V,E,A'),
  ('ROLE_LOGISTICS_MGR','MENU_LOGISTICS_MASTER','V,C,E'),
  ('ROLE_LOGISTICS_MGR','MENU_APPROVAL','V,A'),

  -- ═════════════════════════════════════════════════
  -- ROLE_BREEDER  (若存在; 养殖技术员)
  -- ═════════════════════════════════════════════════
  ('ROLE_BREEDER','MENU_FARM_DATA','V,C,E'),
  ('ROLE_BREEDER','MENU_FARM_DAILY','V,C,E'),
  ('ROLE_BREEDER','MENU_FARM_OVERVIEW','V'),
  ('ROLE_BREEDER','MENU_DEVICE_MONITOR','V'),
  ('ROLE_BREEDER','MENU_FARM_QA','V'),
  ('ROLE_BREEDER','MENU_PKG_OP','V')

) AS perm(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = perm.role_code
JOIN sys_menu m ON m.menu_code = perm.menu_code
ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

COMMIT;

-- 验证结果
SELECT
  r.role_code,
  r.approval_level,
  COUNT(rmp.perm_id) AS menu_count
FROM sys_role r
LEFT JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
GROUP BY r.role_code, r.approval_level
ORDER BY r.approval_level DESC, r.role_code;
