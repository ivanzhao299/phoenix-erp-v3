\pset pager off
BEGIN TRANSACTION READ ONLY;

SELECT 'READONLY_GUARD' AS section, current_setting('transaction_read_only') AS read_only;

CREATE TEMP TABLE expected_store(
  store_code text PRIMARY KEY, company_code text NOT NULL,
  site_code text NOT NULL, warehouse_code text NOT NULL
) ON COMMIT DROP;
INSERT INTO expected_store VALUES
  ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE','ST_LAO_AGRI_BKX_001_SALES'),
  ('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE','ST_LAO_AGRI_LPB_001_SALES'),
  ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE','ST_LAO_AGRI_MX_001_SALES'),
  ('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE','ST_LAO_AGRI_PSL_001_SALES'),
  ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE','ST_LAO_AGRI_VTE_001_SALES'),
  ('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE','ST_LAO_AGRI_VTE_WH_001_SALES'),
  ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE','ST_LAO_XINGCHI_DP_001_SALES'),
  ('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE','ST_LAO_XINGCHI_HS_001_SALES'),
  ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE','ST_LAO_XINGCHI_XB_001_SALES'),
  ('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE','ST_LAO_XINGCHI_XC_001_SALES');

SELECT 'MST_STORE_REAL_VALUES' section, m.store_code,m.store_name,m.company_code,m.address,m.mapped_site_code,
       e.company_code expected_company,e.site_code,e.warehouse_code
FROM expected_store e LEFT JOIN mst_stores m USING(store_code) ORDER BY e.store_code;

SELECT 'ORPHAN_SITE_CANDIDATE' section,e.store_code,m.store_name,m.address,
       o.org_code,o.org_name,o.company_code,o.site_business_type,
       to_jsonb(o)->>'address' org_address
FROM expected_store e JOIN mst_stores m USING(store_code)
JOIN sys_organizations o ON o.org_type='SITE' AND o.status='ACTIVE'
 AND o.company_code=e.company_code AND o.org_code<>e.site_code
 AND (
   lower(trim(o.org_name)) IN (lower(trim(m.store_name)),lower(trim(m.store_name || '（组织地点）')))
   OR (NULLIF(trim(COALESCE(m.address,'')),'') IS NOT NULL
       AND lower(trim(COALESCE(to_jsonb(o)->>'address','')))=lower(trim(m.address)))
 ) ORDER BY e.store_code,o.org_code;

SELECT 'STORE_MASTER_STATE' section,e.store_code,s.id,s.store_name,s.company_code,s.status
FROM expected_store e LEFT JOIN store_master s USING(store_code) ORDER BY e.store_code;

WITH expected(username,role_code,store_code) AS (VALUES
 ('amei','ROLE_CASHIER','STORE-HS-001'),('amei','ROLE_STORE_MGR','STORE-HS-001'),
 ('cashier','ROLE_CASHIER','STORE-VTE-001'),('chenling','ROLE_STORE_MGR','STORE-MX-001'),
 ('alue','ROLE_STORE_MGR','STORE-VTE-001'),('bouavanh','ROLE_STORE_MGR','STORE-BKX-001'),
 ('xiaolan','ROLE_STORE_MGR','STORE-XB-001')
)
SELECT 'MEMBERSHIP_INPUT' section,e.username,e.role_code,e.store_code,
       u.user_id,u.status user_status,u.store_code legacy_store_code,
       bool_or(r.role_code=e.role_code) role_present
FROM expected e LEFT JOIN sys_user u ON u.username=e.username
LEFT JOIN sys_user_role ur ON ur.user_id=u.user_id
LEFT JOIN sys_role r ON r.role_id=ur.role_id
GROUP BY e.username,e.role_code,e.store_code,u.user_id,u.status,u.store_code
ORDER BY e.username,e.role_code;

SELECT 'TARGET_WAREHOUSE_COLLISION' section,e.store_code,e.warehouse_code,w.id,w.company_code,w.site_code,w.status
FROM expected_store e LEFT JOIN wms_warehouses w USING(warehouse_code) ORDER BY e.store_code;

SELECT 'BASELINE_COUNTS' section,
 (SELECT count(*) FROM mst_stores m JOIN expected_store e USING(store_code)) mst_stores,
 (SELECT count(*) FROM store_master s JOIN expected_store e USING(store_code)) store_master,
 (SELECT count(*) FROM sys_organizations o JOIN expected_store e ON e.site_code=o.org_code) target_sites,
 (SELECT count(*) FROM wms_warehouses w JOIN expected_store e USING(warehouse_code)) target_warehouses,
 (SELECT count(*) FROM wms_warehouses) all_warehouses,
 (SELECT count(*) FROM store_memberships) memberships,
 (SELECT count(*) FROM store_warehouse_bindings) bindings,
 (SELECT count(*) FROM store_aliases) aliases;

DO $$
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN RAISE EXCEPTION 'readonly guard is off'; END IF;
  IF (SELECT count(*) FROM expected_store) <> 10 THEN RAISE EXCEPTION 'manifest count mismatch'; END IF;
  IF (SELECT count(*) FROM expected_store e JOIN mst_stores m USING(store_code)
      WHERE m.company_code=e.company_code) <> 10 THEN RAISE EXCEPTION 'mst_stores 10-row company assertion failed'; END IF;
  IF EXISTS (SELECT 1 FROM expected_store e JOIN mst_stores m USING(store_code)
      JOIN sys_organizations o ON o.org_type='SITE' AND o.status='ACTIVE' AND o.company_code=e.company_code AND o.org_code<>e.site_code
       AND (lower(trim(o.org_name)) IN (lower(trim(m.store_name)),lower(trim(m.store_name || '（组织地点）')))
         OR (NULLIF(trim(COALESCE(m.address,'')),'') IS NOT NULL AND lower(trim(COALESCE(to_jsonb(o)->>'address','')))=lower(trim(m.address)))))
    THEN RAISE EXCEPTION 'suspected orphan SITE exists; stop before DML'; END IF;
  IF (SELECT count(*) FROM wms_warehouses w JOIN expected_store e USING(warehouse_code)) <> 0
    THEN RAISE EXCEPTION 'target warehouse code collision'; END IF;
  IF (SELECT count(*) FROM (VALUES
      ('amei','ROLE_CASHIER','STORE-HS-001'),('amei','ROLE_STORE_MGR','STORE-HS-001'),
      ('cashier','ROLE_CASHIER','STORE-VTE-001'),('chenling','ROLE_STORE_MGR','STORE-MX-001'),
      ('alue','ROLE_STORE_MGR','STORE-VTE-001'),('bouavanh','ROLE_STORE_MGR','STORE-BKX-001'),
      ('xiaolan','ROLE_STORE_MGR','STORE-XB-001')) e(username,role_code,store_code)
      JOIN sys_user u ON u.username=e.username AND u.status=1 AND u.store_code=e.store_code
      JOIN sys_user_role ur ON ur.user_id=u.user_id JOIN sys_role r ON r.role_id=ur.role_id AND r.role_code=e.role_code) <> 7
    THEN RAISE EXCEPTION 'membership role/account ACTIVE assertion failed'; END IF;
END $$;

ROLLBACK;
