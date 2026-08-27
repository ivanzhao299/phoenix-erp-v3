\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SELECT current_setting('transaction_read_only') AS readonly_guard;

\echo === ROLE_SEED_FINAL_ROWS ===
WITH expected(role_code,expected_perm) AS (VALUES
  ('ROLE_STORE_MGR','V,C,E'),('ROLE_WMS_OP','V,A,E'),
  ('ROLE_WMS_MGR','V,A,E'),('ROLE_CASHIER',NULL::text)
)
SELECT e.role_code,e.expected_perm,r.status AS role_status,p.perm_codes AS actual_perm,
       COALESCE(p.deny_codes,'') AS deny_codes,
       CASE WHEN e.expected_perm IS NULL THEN p.role_id IS NULL
            ELSE string_to_array(p.perm_codes,',') @> string_to_array(e.expected_perm,',')
              AND string_to_array(e.expected_perm,',') @> string_to_array(p.perm_codes,',')
              AND COALESCE(p.deny_codes,'')='' END AS assertion_pass
FROM expected e LEFT JOIN sys_role r ON r.role_code=e.role_code
LEFT JOIN (sys_role_menu_permission p
  JOIN sys_menu m ON m.menu_id=p.menu_id AND m.menu_code='MENU_STORE_REPLENISH')
  ON p.role_id=r.role_id
ORDER BY e.role_code;

DO $$ BEGIN
  IF EXISTS (
    WITH expected(role_code,expected_perm) AS (VALUES
      ('ROLE_STORE_MGR','V,C,E'),('ROLE_WMS_OP','V,A,E'),
      ('ROLE_WMS_MGR','V,A,E'),('ROLE_CASHIER',NULL::text)
    )
    SELECT 1 FROM expected e LEFT JOIN sys_role r ON r.role_code=e.role_code
    LEFT JOIN (sys_role_menu_permission p
      JOIN sys_menu m ON m.menu_id=p.menu_id AND m.menu_code='MENU_STORE_REPLENISH')
      ON p.role_id=r.role_id
    WHERE r.role_id IS NULL OR (e.expected_perm IS NULL AND p.role_id IS NOT NULL)
       OR (e.expected_perm IS NOT NULL AND (p.role_id IS NULL OR COALESCE(p.deny_codes,'')<>''
         OR NOT (string_to_array(p.perm_codes,',') @> string_to_array(e.expected_perm,',')
           AND string_to_array(e.expected_perm,',') @> string_to_array(p.perm_codes,','))))
  ) THEN RAISE EXCEPTION 'ROLE_SEED_FINAL_ASSERTIONS_FAILED'; END IF;
END $$;
SELECT 'ROLE_SEED_FINAL_ASSERTIONS=PASS' AS result;

\echo === WMS_ROLE_USERS ===
SELECT wanted.role_code,r.status AS role_status,u.user_id,u.username,u.real_name,
       u.status AS user_status,COALESCE(ur.is_visible,true) AS is_visible,u.perms_version
FROM (VALUES ('ROLE_WMS_OP'),('ROLE_WMS_MGR')) wanted(role_code)
LEFT JOIN sys_role r ON r.role_code=wanted.role_code
LEFT JOIN sys_user_role ur ON ur.role_id=r.role_id
LEFT JOIN sys_user u ON u.user_id=ur.user_id
ORDER BY wanted.role_code,u.username;

\echo === WMS_USER_SOURCE_WAREHOUSE_MATRIX ===
WITH wms_users AS (
  SELECT DISTINCT u.user_id,u.username FROM sys_user u
  JOIN sys_user_role ur ON ur.user_id=u.user_id AND COALESCE(ur.is_visible,true)=true
  JOIN sys_role r ON r.role_id=ur.role_id
  WHERE r.role_code IN ('ROLE_WMS_OP','ROLE_WMS_MGR') AND u.status=1
), target_warehouses AS (
  SELECT warehouse_code,company_code,site_code FROM wms_warehouses
  WHERE status='ACTIVE' AND domain='OPERATIONAL'
    AND (warehouse_code LIKE 'LPH_MS_%' OR warehouse_code LIKE 'LPH_DP_%')
), org_scope AS (
  SELECT wu.user_id,tw.warehouse_code,
         bool_or(o.org_type='SITE') FILTER (WHERE o.id IS NOT NULL) AS has_site,
         bool_or(o.org_type='SITE' AND o.site_code=tw.site_code) AS site_match,
         bool_or(o.company_code=tw.company_code AND o.org_type<>'SITE') AS company_match,
         bool_or(o.warehouse_code=tw.warehouse_code) AS org_warehouse_match
  FROM wms_users wu CROSS JOIN target_warehouses tw
  LEFT JOIN sys_user_orgs uo ON uo.user_id=wu.user_id
  LEFT JOIN sys_organizations o ON o.id=uo.org_id
  GROUP BY wu.user_id,tw.warehouse_code
)
SELECT wu.username,tw.warehouse_code,tw.site_code,
       EXISTS (SELECT 1 FROM sys_user_warehouse_scopes s
         WHERE s.user_id=wu.user_id AND s.warehouse_code=tw.warehouse_code) AS explicit_scope,
       CASE WHEN COALESCE(os.has_site,false)
         THEN COALESCE(os.site_match,false) AND EXISTS (
           SELECT 1 FROM sys_user_warehouse_scopes s
           WHERE s.user_id=wu.user_id AND s.warehouse_code=tw.warehouse_code)
         ELSE COALESCE(os.company_match,false) OR COALESCE(os.org_warehouse_match,false)
           OR EXISTS (SELECT 1 FROM sys_user_warehouse_scopes s
             WHERE s.user_id=wu.user_id AND s.warehouse_code=tw.warehouse_code)
       END AS allowed_warehouse_code
FROM wms_users wu CROSS JOIN target_warehouses tw
JOIN org_scope os ON os.user_id=wu.user_id AND os.warehouse_code=tw.warehouse_code
ORDER BY wu.username,tw.warehouse_code;

\echo === PERMS_VERSION_AND_INVALIDATION ===
SELECT DISTINCT r.role_code,u.user_id,u.username,u.status,u.perms_version,
       EXISTS (SELECT 1 FROM pg_trigger t WHERE NOT t.tgisinternal
         AND t.tgrelid='sys_role_menu_permission'::regclass
         AND pg_get_triggerdef(t.oid) ILIKE '%fn_bump_user_perms_version%')
         AS permission_bump_trigger_present
FROM sys_role r
LEFT JOIN sys_user_role ur ON ur.role_id=r.role_id AND COALESCE(ur.is_visible,true)=true
LEFT JOIN sys_user u ON u.user_id=ur.user_id
WHERE r.role_code IN ('ROLE_STORE_MGR','ROLE_WMS_OP','ROLE_WMS_MGR')
ORDER BY r.role_code,u.username;

COMMIT;
