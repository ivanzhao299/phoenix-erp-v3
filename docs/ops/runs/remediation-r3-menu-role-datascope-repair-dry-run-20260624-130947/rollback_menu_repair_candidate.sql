-- Rollback candidate for inserted Store Payment menu rows only.
-- DRY-RUN ONLY. Execute only after confirming no dependent grants remain.
DELETE FROM sys_menu WHERE menu_code IN (
  'MENU_STORE_PAYMENT_ACCOUNT',
  'MENU_STORE_PAYMENT',
  'MENU_STORE_PAYMENT_CONFIRM',
  'MENU_STORE_PAYMENT_VOID',
  'MENU_STORE_PAYMENT_EXPORT'
);
