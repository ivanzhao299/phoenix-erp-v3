\echo '=== target user ==='
SELECT user_id, username, real_name, status, perms_version
FROM sys_user
WHERE lower(username) = 'wangweihua';

\echo '=== role bindings ==='
SELECT r.role_code, r.role_name_zh, r.status, ur.is_primary, ur.is_visible, ur.granted_at
FROM sys_user u
JOIN sys_user_role ur ON ur.user_id = u.user_id
JOIN sys_role r ON r.role_id = ur.role_id
WHERE lower(u.username) = 'wangweihua'
ORDER BY ur.is_primary DESC, r.role_code;

\echo '=== effective permission sources (receipt and SoD menus first) ==='
WITH target AS (
  SELECT user_id FROM sys_user WHERE lower(username) = 'wangweihua'
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
WHERE menu_code LIKE '%PAYMENT%'
   OR menu_code LIKE '%RECEIPT%'
   OR menu_code IN (
     SELECT menu_a FROM sys_role_conflict
     UNION SELECT menu_b FROM sys_role_conflict
   )
ORDER BY menu_code, source;

\echo '=== permission-set bindings ==='
SELECT 'role_set' AS binding_type, r.role_code AS owner, ps.set_code, ps.set_name_zh
FROM sys_user u
JOIN sys_user_role ur ON ur.user_id = u.user_id AND ur.is_visible = true
JOIN sys_role r ON r.role_id = ur.role_id
JOIN sys_role_permission_set rps ON rps.role_id = r.role_id
JOIN sys_permission_set ps ON ps.set_id = rps.set_id
WHERE lower(u.username) = 'wangweihua'
UNION ALL
SELECT 'user_set', u.username, ps.set_code, ps.set_name_zh
FROM sys_user u
JOIN sys_user_permission_set ups ON ups.user_id = u.user_id
JOIN sys_permission_set ps ON ps.set_id = ups.set_id
WHERE lower(u.username) = 'wangweihua'
ORDER BY binding_type, owner, set_code;

\echo '=== proposed receipt owner role blast radius and current permission ==='
SELECT r.role_code, r.role_name_zh,
       count(DISTINCT ur.user_id) FILTER (WHERE ur.is_visible = true) AS active_bindings,
       COALESCE(max(rmp.perm_codes) FILTER (WHERE m.menu_code = 'MENU_STORE_PAYMENT'), '<none>') AS store_payment_perms
FROM sys_role r
LEFT JOIN sys_user_role ur ON ur.role_id = r.role_id
LEFT JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
LEFT JOIN sys_menu m ON m.menu_id = rmp.menu_id
WHERE r.role_code IN ('ROLE_MENGSAI_DONGPENG_TREASURER', 'ROLE_FIN_ACCT')
GROUP BY r.role_code, r.role_name_zh
ORDER BY r.role_code;

\echo '=== active SoD rules ==='
SELECT menu_a, menu_b, severity, reason_zh
FROM sys_role_conflict
ORDER BY severity, menu_a, menu_b;
