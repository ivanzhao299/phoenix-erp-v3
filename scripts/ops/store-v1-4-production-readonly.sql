\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SELECT current_setting('transaction_read_only') AS must_be_on;
SELECT menu_code,domain,route FROM sys_menu WHERE menu_code IN ('MENU_FIN2_AR_LEDGER','MENU_STORE_SETTLEMENT') ORDER BY menu_code;
SELECT r.role_code,m.menu_code,p.perm_codes,p.deny_codes
  FROM sys_role_menu_permission p JOIN sys_role r ON r.role_id=p.role_id JOIN sys_menu m ON m.menu_id=p.menu_id
 WHERE m.menu_code IN ('MENU_FIN2_AR_LEDGER','MENU_STORE_SETTLEMENT') ORDER BY r.role_code,m.menu_code;
SELECT u.username,u.status,u.perms_version,r.role_code
  FROM sys_user u LEFT JOIN sys_user_role ur ON ur.user_id=u.user_id LEFT JOIN sys_role r ON r.role_id=ur.role_id
 WHERE u.username='pilot_wms';
SELECT COUNT(*) AS pilot_wms_wms_role_count
  FROM sys_user_role ur JOIN sys_user u ON u.user_id=ur.user_id JOIN sys_role r ON r.role_id=ur.role_id
 WHERE u.username='pilot_wms' AND r.role_code='ROLE_WMS_MGR';
SELECT to_regclass('public.sal_store_sale_tenders') AS tenders,
       to_regclass('public.sal_store_settlements') AS settlements,
       to_regclass('public.sal_store_price_drift_events') AS price_drift;
SELECT COUNT(*) AS posted_with_difference FROM sal_store_settlements WHERE status='POSTED' AND difference_amount<>0;
COMMIT;
