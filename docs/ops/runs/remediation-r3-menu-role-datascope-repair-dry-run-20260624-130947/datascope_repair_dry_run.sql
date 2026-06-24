-- Store Payment DataScope repair candidate SQL.
-- DRY-RUN ONLY. DO NOT EXECUTE unless a later execution Gate explicitly approves it.
-- sys_data_scopes has role/module/scope_type only; user store binding belongs in sys_user_orgs.
WITH expected(role_code, module_code, scope_type) AS (
  VALUES
  ('ROLE_CASHIER', 'MENU_STORE_PAYMENT', 'STORE'),
  ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT', 'STORE'),
  ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT_CONFIRM', 'STORE'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT', 'COMPANY'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT_CONFIRM', 'COMPANY'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT_EXPORT', 'COMPANY'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_ACCOUNT', 'ALL'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT', 'ALL'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_CONFIRM', 'ALL'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_VOID', 'ALL'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_EXPORT', 'ALL')
)
SELECT '-- candidate datascope ' || role_code || ' -> ' || module_code || ':' || scope_type || E'\n' ||
       'INSERT INTO sys_data_scopes (role_code, module_code, scope_type, enabled, created_at) ' ||
       'SELECT ' || quote_literal(role_code) || ', ' || quote_literal(module_code) || ', ' || quote_literal(scope_type) || ', true, now() ' ||
       'WHERE NOT EXISTS (SELECT 1 FROM sys_data_scopes WHERE role_code = ' || quote_literal(role_code) || ' AND module_code = ' || quote_literal(module_code) || ');'
FROM expected e
WHERE NOT EXISTS (
  SELECT 1 FROM sys_data_scopes d WHERE d.role_code = e.role_code AND d.module_code = e.module_code
)
ORDER BY role_code, module_code;
-- Admin ALL scope is a candidate only; A2 must review before any execution.
