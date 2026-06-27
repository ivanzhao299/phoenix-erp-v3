\pset tuples_only on
\pset format unaligned
SELECT 'role_perm|' || COALESCE(r.role_code,'<no_role>') || '|' || m.menu_code || '|' || COALESCE(rp.perm_codes,'')
FROM sys_role_menu_permission rp
JOIN sys_menu m ON m.menu_id = rp.menu_id
LEFT JOIN sys_role r ON r.role_id = rp.role_id
WHERE m.menu_code LIKE 'MENU_STORE_PAYMENT%'
ORDER BY m.menu_code, r.role_code;
