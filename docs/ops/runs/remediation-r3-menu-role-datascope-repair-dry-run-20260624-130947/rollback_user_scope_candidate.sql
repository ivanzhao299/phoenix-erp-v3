-- Rollback candidate for inserted Store Payment user scope rows only.
-- DRY-RUN ONLY.
DELETE FROM sys_user_orgs
WHERE user_id = 97
  AND org_code = 'STORE-VTE-001'
  AND role_scope = 'STORE'
  AND position_title = 'Store Payment pilot manager scope';
