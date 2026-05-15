export const ALLOWED_TABLES = [
  // V2 历史名称已下架（sys_users/sys_roles/sys_user_roles 在阶段二收尾时改名为 _v2_archived_*
  // 防止误读；如需查询历史 V2 用户应改走 V3 sys_user / sys_user_role / sys_role）
  'sys_dict', 'sys_orgs', 'sys_approval_flows', 'sys_approval_logs', 'sys_permissions',
  // V3 RBAC 真实表（与 ddl/01_create_rbac_tables.sql 一致，单数）
  'sys_role', 'sys_user', 'sys_menu', 'sys_user_role', 'sys_role_menu_permission', 'sys_role_conflict',
  'sys_approval_log', 'sys_audit_log', 'sys_store', 'sys_approval_rule', 'sys_settings',
  'mst_stores', 'mst_products',
  'inv_batches', 'inv_ledger',
  'wms_warehouses', 'wms_locations', 'wms_inbound', 'wms_inbound_items', 'wms_outbound', 'wms_outbound_items', 'wms_stocktake',
  'wms_zones', 'wms_transfer', 'wms_stock_transfers', 'wms_suppliers',
  'prc_suppliers', 'prc_purchase_orders', 'prc_purchase_items', 'prc_purchase_requests', 'prc_returns', 'prc_receipts',
  'prc_purchase_payments', 'prc_supplier_returns',
  'brd_farms', 'brd_flocks', 'brd_daily_logs', 'brd_vaccinations', 'brd_houses', 'brd_medications',
  'log_vehicles', 'log_drivers', 'log_dispatch', 'log_routes', 'log_receipts', 'log_exceptions',
  'qa_standards', 'qa_inspections', 'qa_inspection_items', 'qa_product_inspections', 'qa_non_conformance', 'qa_standards_history',
  'fin_accounts', 'fin_transactions', 'fin_payments', 'fin_pay_records', 'fin_store_settlements',
  'crm_members', 'crm_points_ledger', 'crm_levels', 'crm_coupons', 'crm_activities', 'crm_points_log', 'crm_points_rules',
  'b2b_customers', 'b2b_orders', 'b2b_order_items',
  'chn_distributor_grading',
  'store_receiving', 'store_receiving_items', 'store_transfers', 'store_replenish_req', 'store_losses', 'store_inventory',
  'pos_sales', 'pos_sale_items', 'daily_close',
  'pkg_shifts', 'pkg_tasks', 'pkg_exceptions', 'pkg_label_prints', 'pkg_grading_tasks',
  'acc_ledger',
  'ws_shipments', 'ws_contracts',
  'ord_customers', 'ord_prices', 'ord_orders', 'ord_order_items', 'ord_approval_log', 'ord_credit_usage',
  'biz_cash_flow',
  'cst_credit_warnings',
  // 注意：biz_purchase_order / biz_sales_order / fin_invoices 已从 ALLOWED_TABLES 移除。
  // 对应数据库表仍然保留，如需历史数据可通过 DBA 直接查询。
];


export const TABLE_PERM_MAP: Record<string, string[]> = {
  // 系统管理（仅管理员）— V2 历史名（兼容老 settings/* 页面）
  sys_users:        ['ROLE_ADMIN', 'ROLE_HR_ADMIN', 'ROLE_SYSOPS'],
  sys_roles:        ['ROLE_ADMIN', 'ROLE_SYSOPS'],
  sys_permissions:  ['ROLE_ADMIN'],
  sys_orgs:         ['ROLE_ADMIN', 'ROLE_HR_ADMIN', 'ROLE_SYSOPS'],
  sys_dict:         ['ROLE_ADMIN', 'ROLE_SYSOPS'],
  sys_approval_logs:['ROLE_ADMIN', 'ROLE_AUDITOR', 'ROLE_CEO'],
  // V3 真实表名（单数，与 ddl/01_create_rbac_tables.sql 一致；roles/page.tsx 经此调用）
  sys_user:                  ['ROLE_ADMIN', 'ROLE_HR_ADMIN', 'ROLE_SYSOPS'],
  sys_role:                  ['ROLE_ADMIN', 'ROLE_SYSOPS'],
  sys_menu:                  ['ROLE_ADMIN', 'ROLE_SYSOPS'],
  sys_user_role:             ['ROLE_ADMIN', 'ROLE_SYSOPS', 'ROLE_HR_ADMIN'],
  sys_role_menu_permission:  ['ROLE_ADMIN', 'ROLE_SYSOPS'],
  sys_role_conflict:         ['ROLE_ADMIN', 'ROLE_SYSOPS'],
  sys_store:                 ['ROLE_ADMIN', 'ROLE_SYSOPS'],
  sys_approval_rule:         ['ROLE_ADMIN', 'ROLE_SYSOPS', 'ROLE_CEO'],
  sys_approval_log:          ['ROLE_ADMIN', 'ROLE_AUDITOR', 'ROLE_CEO'],
  sys_audit_log:             ['ROLE_ADMIN', 'ROLE_AUDITOR', 'ROLE_CEO'],
  sys_settings:              ['ROLE_ADMIN', 'ROLE_SYSOPS'],

  // 财务（需财务权限）
  fin_accounts:     ['ROLE_ADMIN', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT'],
  fin_transactions: ['ROLE_ADMIN', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT', 'ROLE_FIN_AR'],
  fin_payments:     ['ROLE_ADMIN', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT'],
  fin_store_settlements: ['ROLE_ADMIN', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT', 'ROLE_REGION_MGR'],

  // 采购（仅采购和管理员）
  prc_purchase_orders:  ['ROLE_ADMIN', 'ROLE_PRC_BUYER'],
  prc_purchase_items:   ['ROLE_ADMIN', 'ROLE_PRC_BUYER'],
  prc_purchase_payments:['ROLE_ADMIN', 'ROLE_PRC_BUYER', 'ROLE_FIN_ACCT'],

  // POS销售（门店相关角色）
  pos_sales:      ['ROLE_ADMIN', 'ROLE_STORE_MGR', 'ROLE_CASHIER', 'ROLE_REGION_MGR', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT'],
  pos_sale_items: ['ROLE_ADMIN', 'ROLE_STORE_MGR', 'ROLE_CASHIER', 'ROLE_REGION_MGR'],
  daily_close:    ['ROLE_ADMIN', 'ROLE_STORE_MGR', 'ROLE_CASHIER', 'ROLE_REGION_MGR', 'ROLE_FIN_CFO'],
  acc_ledger:     ['ROLE_ADMIN', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT', 'ROLE_STORE_MGR'],

  // 繁育模块
  brd_farms:        ['ROLE_ADMIN', 'ROLE_FARM_MGR'],
  brd_flocks:       ['ROLE_ADMIN', 'ROLE_FARM_MGR'],
  brd_houses:       ['ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_PKG_MGR', 'ROLE_PKG_OP'],
  brd_daily_logs:   ['ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_BREEDER'],
  brd_vaccinations: ['ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_VET'],
  brd_medications:        ['ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_VET'],

  // 仓储与库存
  wms_warehouses:     ['ROLE_ADMIN', 'ROLE_WMS_MGR', 'ROLE_SYSOPS'],
  wms_locations:      ['ROLE_ADMIN', 'ROLE_WMS_MGR', 'ROLE_SYSOPS'],
  wms_inbound:        ['ROLE_ADMIN', 'ROLE_WMS_MGR', 'ROLE_WMS_OP'],
  wms_inbound_items:  ['ROLE_ADMIN', 'ROLE_WMS_MGR', 'ROLE_WMS_OP'],
  wms_outbound:       ['ROLE_ADMIN', 'ROLE_WMS_MGR', 'ROLE_WMS_OP'],
  wms_outbound_items: ['ROLE_ADMIN', 'ROLE_WMS_MGR', 'ROLE_WMS_OP'],
  wms_stocktake:      ['ROLE_ADMIN', 'ROLE_WMS_MGR'],
  inv_batches:        ['ROLE_ADMIN', 'ROLE_WMS_MGR', 'ROLE_WMS_OP', 'ROLE_FARM_MGR'],
  inv_ledger:         ['ROLE_ADMIN', 'ROLE_WMS_MGR', 'ROLE_WMS_OP', 'ROLE_FIN_ACCT'],

  // 物流调度
  log_vehicles: ['ROLE_ADMIN', 'ROLE_LOGISTICS_MGR'],
  log_drivers:  ['ROLE_ADMIN', 'ROLE_LOGISTICS_MGR'],
  log_dispatch: ['ROLE_ADMIN', 'ROLE_LOGISTICS_MGR', 'ROLE_DRIVER'],
  log_routes:   ['ROLE_ADMIN', 'ROLE_LOGISTICS_MGR'],

  // 核心财务现金流 (V3)
  biz_cash_flow:      ['ROLE_ADMIN', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT', 'ROLE_FIN_AR', 'ROLE_CEO'],
  // 注意：biz_purchase_order / biz_sales_order 已从 API 访问权限移除（V2 历史表）。
  // DB 表仍保留，如需查询请通过 DBA 执行直接 SQL。

  // 客户信用管控
  cst_credit_warnings: ['ROLE_ADMIN', 'ROLE_FIN_CFO', 'ROLE_FIN_AR', 'ROLE_REGION_MGR'],

  // 门店损耗
  store_losses:       ['ROLE_ADMIN', 'ROLE_STORE_MGR', 'ROLE_REGION_MGR'],
  store_inventory:    ['ROLE_ADMIN', 'ROLE_STORE_MGR', 'ROLE_WMS_MGR', 'ROLE_REGION_MGR'],

  // 供应商
  wms_suppliers:      ['ROLE_ADMIN', 'ROLE_PRC_BUYER', 'ROLE_WMS_MGR'],

  // CRM 积分
  crm_points_ledger:  ['ROLE_ADMIN', 'ROLE_CRM_MGR', 'ROLE_STORE_MGR'],   // 积分台账（余额快照）
  crm_points_log:     ['ROLE_ADMIN', 'ROLE_CRM_MGR', 'ROLE_STORE_MGR'],   // 积分流水（事件日志）

  // 经销商分级管理
  chn_distributor_grading: ['ROLE_ADMIN', 'ROLE_REGION_MGR', 'ROLE_HEADOFFICE'],
};
