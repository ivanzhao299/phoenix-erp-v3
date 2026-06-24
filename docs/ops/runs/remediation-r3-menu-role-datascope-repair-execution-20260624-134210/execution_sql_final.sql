\set ON_ERROR_STOP on
BEGIN;
WITH expected(menu_code, menu_name_zh, parent_code, route, sort_order) AS (
  VALUES
  ('MENU_STORE_PAYMENT_ACCOUNT', 'Store Payment 收款账户管理', 'MENU_POS_STORE', '/store-payment/accounts', 610),
  ('MENU_STORE_PAYMENT', 'Store Payment 收款记录', 'MENU_POS_STORE', '/store-payment/records', 620),
  ('MENU_STORE_PAYMENT_CONFIRM', 'Store Payment 收款确认', 'MENU_POS_STORE', '/store-payment/confirm', 630),
  ('MENU_STORE_PAYMENT_VOID', 'Store Payment 收款作废', 'MENU_POS_STORE', '/store-payment/void', 640),
  ('MENU_STORE_PAYMENT_EXPORT', 'Store Payment 收款导出', 'MENU_POS_STORE', '/store-payment/export', 650)
)
INSERT INTO sys_menu (menu_code, menu_name_zh, parent_code, route, domain, sort_order, created_at)
SELECT e.menu_code, e.menu_name_zh, e.parent_code, e.route, 'STORE', e.sort_order, now()
FROM expected e
WHERE NOT EXISTS (SELECT 1 FROM sys_menu m WHERE m.menu_code = e.menu_code);

WITH expected(role_code, menu_code, perm_codes) AS (
  VALUES
  ('ROLE_CASHIER', 'MENU_STORE_PAYMENT', 'V,E,C'),
  ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT', 'V'),
  ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT_CONFIRM', 'V,E,A'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT', 'V'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT_CONFIRM', 'V,E,A'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT_EXPORT', 'X'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_ACCOUNT', 'V,E'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT', 'V,E,C'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_CONFIRM', 'V,E,A'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_VOID', 'V,E,A'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_EXPORT', 'X')
)
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes, deny_codes, scope_type, scope_value)
SELECT r.role_id, m.menu_id, e.perm_codes, NULL, NULL, NULL
FROM expected e
JOIN sys_role r ON r.role_code = e.role_code
JOIN sys_menu m ON m.menu_code = e.menu_code
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_menu_permission p WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
);

WITH expected(role_code, module_code, scope_type) AS (
  VALUES
  ('ROLE_CASHIER', 'MENU_STORE_PAYMENT', 'SELF'),
  ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT', 'COMPANY'),
  ('ROLE_STORE_MGR', 'MENU_STORE_PAYMENT_CONFIRM', 'COMPANY'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT', 'COMPANY'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT_CONFIRM', 'COMPANY'),
  ('ROLE_FIN_ACCT', 'MENU_STORE_PAYMENT_EXPORT', 'COMPANY'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_ACCOUNT', 'GROUP'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT', 'GROUP'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_CONFIRM', 'GROUP'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_VOID', 'GROUP'),
  ('ROLE_ADMIN', 'MENU_STORE_PAYMENT_EXPORT', 'GROUP')
)
INSERT INTO sys_data_scopes (role_code, module_code, scope_type, enabled, created_at)
SELECT e.role_code, e.module_code, e.scope_type, true, now()
FROM expected e
WHERE NOT EXISTS (
  SELECT 1 FROM sys_data_scopes d WHERE d.role_code = e.role_code AND d.module_code = e.module_code
);

INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, position_title, is_manager, created_at, org_code, role_scope)
SELECT u.user_id, o.id, true, 'STORE', 'Store Payment pilot manager scope', true, now(), o.org_code, 'STORE'
FROM sys_user u
JOIN sys_organizations o ON o.org_code = 'STORE-VTE-001' AND o.status = 'ACTIVE'
WHERE u.user_id = 97
  AND u.store_code = 'STORE-VTE-001'
  AND EXISTS (
    SELECT 1 FROM sys_user_role ur JOIN sys_role r ON r.role_id = ur.role_id
    WHERE ur.user_id = u.user_id AND r.role_code = 'ROLE_STORE_MGR'
  )
  AND NOT EXISTS (SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id = u.user_id AND uo.org_id = o.id);
COMMIT;
