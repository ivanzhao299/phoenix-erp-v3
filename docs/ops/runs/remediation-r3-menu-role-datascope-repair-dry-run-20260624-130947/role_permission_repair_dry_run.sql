-- Store Payment role permission repair candidate SQL.
-- DRY-RUN ONLY. DO NOT EXECUTE unless a later execution Gate explicitly approves it.
-- Target policy uses V/E/X. Runtime still contains C/A on some routes; see action_bit_mapping_dry_run.md before execution.
WITH expected(role_code, menu_code, perm_codes) AS (
  VALUES
  ('ROLE_CASHIER', 'MENU_STORE_PAYMENT', 'V,E'),
  ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT', 'V'),
  ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT_CONFIRM', 'V,E'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT', 'V'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT_CONFIRM', 'V,E'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT_EXPORT', 'X'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_ACCOUNT', 'V,E'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT', 'V,E'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_CONFIRM', 'V,E'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_VOID', 'V,E'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_EXPORT', 'X')
)
SELECT '-- candidate grant ' || role_code || ' -> ' || menu_code || ':' || perm_codes || E'\n' ||
       'INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes, deny_codes, scope_type, scope_value) ' ||
       'SELECT r.role_id, m.menu_id, ' || quote_literal(perm_codes) || ', NULL, NULL, NULL ' ||
       'FROM sys_role r JOIN sys_menu m ON m.menu_code = ' || quote_literal(menu_code) || ' ' ||
       'WHERE r.role_code = ' || quote_literal(role_code) || ' ' ||
       'AND NOT EXISTS (SELECT 1 FROM sys_role_menu_permission p WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id);'
FROM expected e
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_menu_permission p
  JOIN sys_role r ON r.role_id = p.role_id
  JOIN sys_menu m ON m.menu_id = p.menu_id
  WHERE r.role_code = e.role_code AND m.menu_code = e.menu_code
)
ORDER BY role_code, menu_code;
-- Over-wide existing grants must be reported and reviewed, not auto-deleted.
-- Duplicate role/menu grants must HOLD.
