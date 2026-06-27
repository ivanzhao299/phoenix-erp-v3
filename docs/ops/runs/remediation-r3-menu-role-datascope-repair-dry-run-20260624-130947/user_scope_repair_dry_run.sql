-- Store Payment user store/company scope repair candidate SQL.
-- DRY-RUN ONLY. DO NOT EXECUTE unless a later execution Gate explicitly approves it.
-- Clear candidate: user_id 97 has ROLE_STORE_MGR and STORE-VTE-001 but no org scope.
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

-- MANUAL_REVIEW_REQUIRED: user_id 296 masked_username=pilot_*** role=ROLE_CASHIER store_code=STORE-MS-01; not Vientiane canonical.
-- MANUAL_REVIEW_REQUIRED: user_id 299 masked_username=pilot_*** role=ROLE_FIN_ACCT store_code=PILOT-MS; not Vientiane canonical.
-- MANUAL_REVIEW_REQUIRED: user_id 1460 masked_username=zhuzhao_*** role=ROLE_FIN_ACCT store_code=ALL; finance scope needs user approval before company/global binding.
-- No unclear user receives ALL scope automatically.
