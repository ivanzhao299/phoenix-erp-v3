DO $$ BEGIN
  IF (SELECT count(*) FROM sys_role r WHERE r.role_code='ROLE_MENGSAI_DONGPENG_TREASURER' AND r.status='ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'treasurer ACTIVE role assertion failed';
  END IF;
  IF (SELECT count(*) FROM sys_user_role ur JOIN sys_user u USING(user_id) JOIN sys_role r USING(role_id)
       WHERE r.role_code='ROLE_MENGSAI_DONGPENG_TREASURER' AND r.status='ACTIVE'
         AND u.user_id=3 AND u.username='wangweihua' AND u.status=1 AND COALESCE(ur.is_visible,true)) <> 1 THEN
    RAISE EXCEPTION 'wangweihua effective binding assertion failed';
  END IF;
  IF (SELECT count(*) FROM sys_role_menu_permission rmp JOIN sys_role r USING(role_id) JOIN sys_menu m USING(menu_id)
       WHERE r.role_code='ROLE_MENGSAI_DONGPENG_TREASURER' AND m.menu_code='MENU_STORE_PAYMENT'
         AND 'V'=ANY(string_to_array(replace(rmp.perm_codes,' ',''),','))
         AND 'E'=ANY(string_to_array(replace(rmp.perm_codes,' ',''),','))) <> 1 THEN
    RAISE EXCEPTION 'treasurer V,E grant assertion failed';
  END IF;
  IF (SELECT perms_version FROM sys_user WHERE user_id=3 AND username='wangweihua') < 387 THEN
    RAISE EXCEPTION 'perms_version did not preserve execution bump';
  END IF;
  IF (SELECT count(*) FROM sys_role_conflict) <> 6 THEN
    RAISE EXCEPTION 'sys_role_conflict row count changed';
  END IF;
END $$;

SELECT 'PASS TREASURER_STORE_PAYMENT_POSTFLIGHT' result;
SELECT u.user_id,u.username,u.status,u.perms_version,r.role_code,r.status role_status,rmp.perm_codes
  FROM sys_user u
  JOIN sys_user_role ur USING(user_id)
  JOIN sys_role r USING(role_id)
  JOIN sys_role_menu_permission rmp USING(role_id)
  JOIN sys_menu m USING(menu_id)
 WHERE u.user_id=3 AND u.username='wangweihua'
   AND r.role_code='ROLE_MENGSAI_DONGPENG_TREASURER'
   AND m.menu_code='MENU_STORE_PAYMENT';
SELECT r.role_code,m.menu_code,rmp.perm_codes,rmp.deny_codes,rmp.scope_type,rmp.scope_value
  FROM sys_role r JOIN sys_role_menu_permission rmp USING(role_id) JOIN sys_menu m USING(menu_id)
 WHERE r.role_code='ROLE_FIN_ACCT'
 ORDER BY m.menu_code;
SELECT id,menu_a,menu_b,reason_zh,severity FROM sys_role_conflict ORDER BY menu_a,menu_b;
