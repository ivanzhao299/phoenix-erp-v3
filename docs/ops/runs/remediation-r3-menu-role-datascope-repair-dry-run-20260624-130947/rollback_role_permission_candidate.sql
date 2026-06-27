-- Rollback candidate for inserted Store Payment role permissions only.
-- DRY-RUN ONLY.
DELETE FROM sys_role_menu_permission p
USING sys_role r, sys_menu m
WHERE p.role_id = r.role_id
  AND p.menu_id = m.menu_id
  AND r.role_code IN ('ROLE_CASHIER','ROLE_STORE_MGR','ROLE_FIN_ACCT','ROLE_ADMIN')
  AND m.menu_code IN ('MENU_STORE_PAYMENT_ACCOUNT','MENU_STORE_PAYMENT','MENU_STORE_PAYMENT_CONFIRM','MENU_STORE_PAYMENT_VOID','MENU_STORE_PAYMENT_EXPORT');
