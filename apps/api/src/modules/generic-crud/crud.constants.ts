export const ALLOWED_TABLES = [
  // V2 历史名称已下架（sys_users/sys_roles/sys_user_roles 在阶段二收尾时改名为 _v2_archived_*
  // 防止误读；如需查询历史 V2 用户应改走 V3 sys_user / sys_user_role / sys_role）
  'sys_dict', 'sys_approval_flows', 'sys_approval_logs', 'sys_permissions',
  // sys_orgs 已废弃 — 组织管理已迁移至 sys_organizations，由 /api/org/* 统一提供 CRUD
  // V3 RBAC 真实表（与 ddl/01_create_rbac_tables.sql 一致，单数）
  'sys_role', 'sys_user', 'sys_menu', 'sys_user_role', 'sys_role_menu_permission', 'sys_role_conflict',
  'sys_approval_log', 'sys_audit_log', 'sys_approval_rule', 'sys_settings',
  'mst_stores', 'mst_products',
  'product_grades', 'packaging_specs', 'product_skus',
  'inv_batches', 'inv_ledger',
  'wms_warehouses', 'wms_locations', 'wms_inbound', 'wms_inbound_items', 'wms_outbound', 'wms_outbound_items', 'wms_stocktake',
  'wms_zones', 'wms_transfer', 'wms_stock_transfers', 'wms_suppliers',
  'prc_suppliers', 'prc_purchase_orders', 'prc_purchase_items', 'prc_purchase_requests', 'prc_returns', 'prc_receipts',
  'prc_purchase_payments', 'prc_supplier_returns',
  'brd_farms', 'brd_flocks', 'brd_daily_logs', 'brd_vaccinations', 'brd_houses', 'brd_medications', 'brd_medication_records',
  'log_vehicles', 'log_drivers', 'log_dispatch', 'log_routes', 'log_receipts', 'log_exceptions',
  'qa_standards', 'qa_inspections', 'qa_inspection_items', 'qa_product_inspections', 'qa_non_conformance', 'qa_standards_history',
  'fin_accounts', 'fin_transactions', 'fin_payments', 'fin_pay_records', 'fin_store_settlements',
  'crm_members', 'crm_points_ledger', 'crm_levels', 'crm_coupons', 'crm_activities', 'crm_points_log', 'crm_points_rules',
  'b2b_customers', 'b2b_orders', 'b2b_order_items',
  'chn_distributor_grading',
  'store_receiving', 'store_receiving_items', 'store_transfers', 'store_replenish_req', 'store_losses', 'store_inventory',
  'pos_sales', 'pos_sale_items', 'daily_close',
  'pda_terminals',
  'pkg_exceptions',
  'pkg_work_shifts', 'pkg_source_batches', 'pkg_qc_inspections', 'pkg_label_print_logs', 'pkg_audit_logs',
  'pkg_grading_records', 'pkg_packing_records', 'pkg_handover_records',
  'acc_ledger',
  'ws_shipments', 'ws_contracts',
  'ord_customers', 'ord_prices', 'ord_orders', 'ord_order_items', 'ord_approval_log', 'ord_credit_usage',
  'biz_cash_flow',
  'cst_credit_warnings',
  // 注意：biz_purchase_order / biz_sales_order / fin_invoices 已从 ALLOWED_TABLES 移除。
  // 对应数据库表仍然保留，如需历史数据可通过 DBA 直接查询。
];
