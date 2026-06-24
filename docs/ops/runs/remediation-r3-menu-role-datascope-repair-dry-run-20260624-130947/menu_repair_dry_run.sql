-- Store Payment menu repair candidate SQL.
-- DRY-RUN ONLY. DO NOT EXECUTE unless a later execution Gate explicitly approves it.
-- Target parent/module: MENU_POS_STORE / Store Payment controlled pilot.
WITH expected(menu_code, menu_name_zh, parent_code, route, sort_order) AS (
  VALUES
  ('MENU_STORE_PAYMENT_ACCOUNT', 'Store Payment 收款账户管理', 'MENU_POS_STORE', '/store-payment/accounts', 610),
  ('MENU_STORE_PAYMENT', 'Store Payment 收款记录', 'MENU_POS_STORE', '/store-payment/records', 620),
  ('MENU_STORE_PAYMENT_CONFIRM', 'Store Payment 收款确认', 'MENU_POS_STORE', '/store-payment/confirm', 630),
  ('MENU_STORE_PAYMENT_VOID', 'Store Payment 收款作废', 'MENU_POS_STORE', '/store-payment/void', 640),
  ('MENU_STORE_PAYMENT_EXPORT', 'Store Payment 收款导出', 'MENU_POS_STORE', '/store-payment/export', 650)
)
SELECT '-- candidate insert menu ' || menu_code || E'\n' ||
       'INSERT INTO sys_menu (menu_id, menu_code, menu_name_zh, parent_code, route, domain, sort_order, created_at) ' ||
       'SELECT (SELECT COALESCE(MAX(menu_id), 0) + 1 FROM sys_menu), ' || quote_literal(menu_code) || ', ' || quote_literal(menu_name_zh) || ', ' || quote_literal(parent_code) || ', ' || quote_literal(route) || ', ' || quote_literal('STORE') || ', ' || sort_order || ', now() ' ||
       'WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code = ' || quote_literal(menu_code) || ');'
FROM expected e
WHERE NOT EXISTS (SELECT 1 FROM sys_menu m WHERE m.menu_code = e.menu_code)
ORDER BY menu_code;
-- Existing duplicates must be checked separately. If duplicate menu_code exists, HOLD and do not execute generated candidates.
