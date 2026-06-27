-- Rollback candidate for this approved Store Payment repair execution only.
-- Execute only under a separate rollback approval Gate.
BEGIN;
DELETE FROM sys_user_orgs
WHERE user_id = 97
  AND org_code = 'STORE-VTE-001'
  AND role_scope = 'STORE'
  AND position_title = 'Store Payment pilot manager scope';
DELETE FROM sys_data_scopes
WHERE role_code IN ('ROLE_CASHIER','ROLE_STORE_MGR','ROLE_FIN_ACCT','ROLE_ADMIN')
  AND module_code IN ('MENU_STORE_PAYMENT_ACCOUNT','MENU_STORE_PAYMENT','MENU_STORE_PAYMENT_CONFIRM','MENU_STORE_PAYMENT_VOID','MENU_STORE_PAYMENT_EXPORT');
DELETE FROM sys_role_menu_permission p
USING sys_role r, sys_menu m
WHERE p.role_id = r.role_id
  AND p.menu_id = m.menu_id
  AND r.role_code IN ('ROLE_CASHIER','ROLE_STORE_MGR','ROLE_FIN_ACCT','ROLE_ADMIN')
  AND m.menu_code IN ('MENU_STORE_PAYMENT_ACCOUNT','MENU_STORE_PAYMENT','MENU_STORE_PAYMENT_CONFIRM','MENU_STORE_PAYMENT_VOID','MENU_STORE_PAYMENT_EXPORT');
DELETE FROM sys_menu
WHERE menu_code IN ('MENU_STORE_PAYMENT_ACCOUNT','MENU_STORE_PAYMENT','MENU_STORE_PAYMENT_CONFIRM','MENU_STORE_PAYMENT_VOID','MENU_STORE_PAYMENT_EXPORT');
COMMIT;
