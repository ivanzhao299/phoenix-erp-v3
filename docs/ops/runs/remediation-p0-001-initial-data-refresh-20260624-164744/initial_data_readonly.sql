\pset tuples_only on
\pset format unaligned
SELECT 'db_identity|' || current_database() || '|' || current_user || '|' || current_schema() || '|' || now();
SELECT 'table_exists|store_payment_accounts|' || to_regclass('public.store_payment_accounts');
SELECT 'table_exists|store_payment_records|' || to_regclass('public.store_payment_records');
SELECT 'table_exists|file_metadata|' || to_regclass('public.file_metadata');
SELECT 'table_exists|prc2_init_batches|' || to_regclass('public.prc2_init_batches');
SELECT 'table_exists|prc2_init_batch_rows|' || to_regclass('public.prc2_init_batch_rows');
SELECT 'count|store_payment_accounts|' || count(*) FROM store_payment_accounts;
SELECT 'count|store_payment_records|' || count(*) FROM store_payment_records;
SELECT 'count|file_metadata|' || count(*) FROM file_metadata;
SELECT 'count|file_metadata_active|' || count(*) FROM file_metadata WHERE status='ACTIVE';
SELECT 'count|file_metadata_pending|' || count(*) FROM file_metadata WHERE status='PENDING';
SELECT 'count|store_payment_file_metadata|' || count(*) FROM file_metadata WHERE module_code='STORE_PAYMENT';
SELECT 'count|sys_user|' || count(*) FROM sys_user;
SELECT 'count|sys_user_active|' || count(*) FROM sys_user WHERE COALESCE(status,'') IN ('ACTIVE','ENABLED','');
SELECT 'count|sys_role|' || count(*) FROM sys_role;
SELECT 'count|sys_menu|' || count(*) FROM sys_menu;
SELECT 'count|mst_stores|' || count(*) FROM mst_stores;
SELECT 'count|sys_organizations|' || count(*) FROM sys_organizations;
SELECT 'count|store_vte_001|' || count(*) FROM mst_stores WHERE store_code='STORE-VTE-001';
SELECT 'count|comp_lao_agri|' || count(*) FROM sys_organizations WHERE org_code='COMP-LAO-AGRI';
SELECT 'count|menu_store_payment|' || count(*) FROM sys_menu WHERE menu_code LIKE 'MENU_STORE_PAYMENT%';
SELECT 'count|role_perm_store_payment|' || count(*) FROM sys_role_menu_permission rp JOIN sys_menu m ON m.id=rp.menu_id WHERE m.menu_code LIKE 'MENU_STORE_PAYMENT%';
SELECT 'count|datascope_store_payment|' || count(*) FROM sys_data_scopes WHERE module_code LIKE 'MENU_STORE_PAYMENT%';
SELECT 'init_batches_status|' || COALESCE(status,'<null>') || '|' || count(*) FROM prc2_init_batches GROUP BY status ORDER BY status NULLS FIRST;
SELECT 'init_rows_status|' || COALESCE(status,'<null>') || '|' || count(*) FROM prc2_init_batch_rows GROUP BY status ORDER BY status NULLS FIRST;
SELECT 'init_rows_recent_errors|' || count(*) FROM prc2_init_batch_rows WHERE COALESCE(error_message,'') <> '';
