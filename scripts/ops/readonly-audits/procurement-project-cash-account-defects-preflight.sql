\echo '=== target user ==='
SELECT user_id, username, real_name, status, perms_version
FROM sys_user
WHERE lower(username) = 'wanglejin';

\echo '=== role bindings ==='
SELECT r.role_code, r.role_name_zh, r.status, ur.is_primary, ur.is_visible, ur.granted_at
FROM sys_user u
JOIN sys_user_role ur ON ur.user_id = u.user_id
JOIN sys_role r ON r.role_id = ur.role_id
WHERE lower(u.username) = 'wanglejin'
ORDER BY ur.is_primary DESC, r.role_code;

\echo '=== project permission sources (role direct + role sets + user sets) ==='
WITH target AS (
  SELECT user_id FROM sys_user WHERE lower(username) = 'wanglejin'
), sources AS (
  SELECT m.menu_code, rmp.perm_codes, COALESCE(rmp.deny_codes, '') AS deny_codes,
         'role:' || r.role_code AS source
  FROM target t
  JOIN sys_user_role ur ON ur.user_id = t.user_id AND ur.is_visible = true
  JOIN sys_role r ON r.role_id = ur.role_id
  JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
  JOIN sys_menu m ON m.menu_id = rmp.menu_id
  UNION ALL
  SELECT m.menu_code, psi.perm_codes, COALESCE(psi.deny_codes, ''),
         'role_set:' || r.role_code || ':' || ps.set_code
  FROM target t
  JOIN sys_user_role ur ON ur.user_id = t.user_id AND ur.is_visible = true
  JOIN sys_role r ON r.role_id = ur.role_id
  JOIN sys_role_permission_set rps ON rps.role_id = r.role_id
  JOIN sys_permission_set ps ON ps.set_id = rps.set_id
  JOIN sys_permission_set_item psi ON psi.set_id = ps.set_id
  JOIN sys_menu m ON m.menu_id = psi.menu_id
  UNION ALL
  SELECT m.menu_code, psi.perm_codes, COALESCE(psi.deny_codes, ''),
         'user_set:' || ps.set_code
  FROM target t
  JOIN sys_user_permission_set ups ON ups.user_id = t.user_id
  JOIN sys_permission_set ps ON ps.set_id = ups.set_id
  JOIN sys_permission_set_item psi ON psi.set_id = ps.set_id
  JOIN sys_menu m ON m.menu_id = psi.menu_id
)
SELECT menu_code, perm_codes, deny_codes, source
FROM sources
WHERE menu_code IN ('MENU_PRC2_PROJECT', 'MENU_MD_PROJECT')
ORDER BY menu_code, source;

\echo '=== project menu registration and purchasing specialist grants ==='
SELECT m.menu_id, m.menu_code, m.menu_name_zh,
       r.role_code, r.status AS role_status, rmp.perm_codes, COALESCE(rmp.deny_codes, '') AS deny_codes
FROM sys_menu m
CROSS JOIN sys_role r
LEFT JOIN sys_role_menu_permission rmp ON rmp.menu_id = m.menu_id AND rmp.role_id = r.role_id
WHERE m.menu_code IN ('MENU_PRC2_PROJECT', 'MENU_MD_PROJECT')
  AND r.role_code = 'ROLE_PRC_BUYER'
ORDER BY m.menu_code;

\echo '=== permission-set bindings ==='
SELECT 'role_set' AS binding_type, r.role_code AS owner, ps.set_code, ps.set_name_zh
FROM sys_user u
JOIN sys_user_role ur ON ur.user_id = u.user_id AND ur.is_visible = true
JOIN sys_role r ON r.role_id = ur.role_id
JOIN sys_role_permission_set rps ON rps.role_id = r.role_id
JOIN sys_permission_set ps ON ps.set_id = rps.set_id
WHERE lower(u.username) = 'wanglejin'
UNION ALL
SELECT 'user_set', u.username, ps.set_code, ps.set_name_zh
FROM sys_user u
JOIN sys_user_permission_set ups ON ups.user_id = u.user_id
JOIN sys_permission_set ps ON ps.set_id = ups.set_id
WHERE lower(u.username) = 'wanglejin'
ORDER BY binding_type, owner, set_code;

\echo '=== DP-10 canonical ownership ==='
SELECT id, account_code, account_name, company_code, company_name,
       currency_code, status, updated_at
FROM fin_cash_accounts
WHERE account_code = 'DP-10';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys_user WHERE lower(username) = 'wanglejin') THEN
    RAISE EXCEPTION 'wanglejin not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fin_cash_accounts WHERE account_code = 'DP-10') THEN
    RAISE EXCEPTION 'DP-10 not found';
  END IF;
END $$;
