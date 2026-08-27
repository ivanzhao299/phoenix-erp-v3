\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT 'READONLY_GUARD' AS section, current_setting('transaction_read_only') AS read_only;

WITH expected_store(store_code,company_code,site_code,warehouse_code) AS (VALUES
  ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE','ST_LAO_AGRI_BKX_001_SALES'),
  ('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE','ST_LAO_AGRI_LPB_001_SALES'),
  ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE','ST_LAO_AGRI_MX_001_SALES'),
  ('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE','ST_LAO_AGRI_PSL_001_SALES'),
  ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE','ST_LAO_AGRI_VTE_001_SALES'),
  ('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE','ST_LAO_AGRI_VTE_WH_001_SALES'),
  ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE','ST_LAO_XINGCHI_DP_001_SALES'),
  ('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE','ST_LAO_XINGCHI_HS_001_SALES'),
  ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE','ST_LAO_XINGCHI_XB_001_SALES'),
  ('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE','ST_LAO_XINGCHI_XC_001_SALES')
), expected_membership(username,role_code,store_code) AS (VALUES
  ('amei','ROLE_CASHIER','STORE-HS-001'),('amei','ROLE_STORE_MGR','STORE-HS-001'),
  ('cashier','ROLE_CASHIER','STORE-VTE-001'),('chenling','ROLE_STORE_MGR','STORE-MX-001'),
  ('alue','ROLE_STORE_MGR','STORE-VTE-001'),('bouavanh','ROLE_STORE_MGR','STORE-BKX-001'),
  ('xiaolan','ROLE_STORE_MGR','STORE-XB-001')
), orphan AS (
  SELECT e.store_code,m.store_name,m.address,o.org_code,o.org_name,o.company_code,o.site_business_type,
         to_jsonb(o)->>'address' org_address
  FROM expected_store e JOIN mst_stores m USING(store_code)
  JOIN sys_organizations o ON o.org_type='SITE' AND o.status='ACTIVE'
   AND o.company_code=e.company_code AND o.org_code<>e.site_code
   AND (lower(trim(o.org_name)) IN (lower(trim(m.store_name)),lower(trim(m.store_name || '（组织地点）')))
     OR (NULLIF(trim(COALESCE(m.address,'')),'') IS NOT NULL
         AND lower(trim(COALESCE(to_jsonb(o)->>'address','')))=lower(trim(m.address))))
), membership_input AS (
  SELECT e.username,e.role_code,e.store_code,u.user_id,u.status user_status,u.store_code legacy_store_code,
         bool_or(r.role_code=e.role_code) role_present
  FROM expected_membership e LEFT JOIN sys_user u ON u.username=e.username
  LEFT JOIN sys_user_role ur ON ur.user_id=u.user_id LEFT JOIN sys_role r ON r.role_id=ur.role_id
  GROUP BY e.username,e.role_code,e.store_code,u.user_id,u.status,u.store_code
)
SELECT 'MST_STORE_REAL_VALUES' section,to_jsonb(x) evidence FROM (
  SELECT m.store_code,m.store_name,m.company_code,m.address,m.mapped_site_code,
         e.company_code expected_company,e.site_code,e.warehouse_code
  FROM expected_store e LEFT JOIN mst_stores m USING(store_code) ORDER BY e.store_code) x
UNION ALL SELECT 'ORPHAN_SITE_CANDIDATE',to_jsonb(x) FROM (SELECT * FROM orphan ORDER BY store_code,org_code) x
UNION ALL SELECT 'STORE_MASTER_STATE',to_jsonb(x) FROM (
  SELECT e.store_code,s.id,s.store_name,s.company_code,s.status FROM expected_store e
  LEFT JOIN store_master s USING(store_code) ORDER BY e.store_code) x
UNION ALL SELECT 'MEMBERSHIP_INPUT',to_jsonb(x) FROM (SELECT * FROM membership_input ORDER BY username,role_code) x
UNION ALL SELECT 'TARGET_WAREHOUSE_COLLISION',to_jsonb(x) FROM (
  SELECT e.store_code,e.warehouse_code,w.id,w.company_code,w.site_code,w.status FROM expected_store e
  LEFT JOIN wms_warehouses w USING(warehouse_code) ORDER BY e.store_code) x;

WITH expected_store(store_code,company_code,site_code,warehouse_code) AS (VALUES
  ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE','ST_LAO_AGRI_BKX_001_SALES'),
  ('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE','ST_LAO_AGRI_LPB_001_SALES'),
  ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE','ST_LAO_AGRI_MX_001_SALES'),
  ('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE','ST_LAO_AGRI_PSL_001_SALES'),
  ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE','ST_LAO_AGRI_VTE_001_SALES'),
  ('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE','ST_LAO_AGRI_VTE_WH_001_SALES'),
  ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE','ST_LAO_XINGCHI_DP_001_SALES'),
  ('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE','ST_LAO_XINGCHI_HS_001_SALES'),
  ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE','ST_LAO_XINGCHI_XB_001_SALES'),
  ('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE','ST_LAO_XINGCHI_XC_001_SALES')
), expected_membership(username,role_code,store_code) AS (VALUES
  ('amei','ROLE_CASHIER','STORE-HS-001'),('amei','ROLE_STORE_MGR','STORE-HS-001'),
  ('cashier','ROLE_CASHIER','STORE-VTE-001'),('chenling','ROLE_STORE_MGR','STORE-MX-001'),
  ('alue','ROLE_STORE_MGR','STORE-VTE-001'),('bouavanh','ROLE_STORE_MGR','STORE-BKX-001'),
  ('xiaolan','ROLE_STORE_MGR','STORE-XB-001')
)
SELECT current_setting('transaction_read_only')='on'
 AND (SELECT count(*) FROM expected_store e JOIN mst_stores m USING(store_code) WHERE m.company_code=e.company_code)=10
 AND NOT EXISTS (SELECT 1 FROM expected_store e JOIN mst_stores m USING(store_code)
   JOIN sys_organizations o ON o.org_type='SITE' AND o.status='ACTIVE' AND o.company_code=e.company_code AND o.org_code<>e.site_code
   AND (lower(trim(o.org_name)) IN (lower(trim(m.store_name)),lower(trim(m.store_name || '（组织地点）')))
     OR (NULLIF(trim(COALESCE(m.address,'')),'') IS NOT NULL AND lower(trim(COALESCE(to_jsonb(o)->>'address','')))=lower(trim(m.address)))))
 AND (SELECT count(*) FROM wms_warehouses w JOIN expected_store e USING(warehouse_code))=0
 AND (SELECT count(*) FROM expected_membership e JOIN sys_user u ON u.username=e.username AND u.status=1 AND u.store_code=e.store_code
   JOIN sys_user_role ur ON ur.user_id=u.user_id JOIN sys_role r ON r.role_id=ur.role_id AND r.role_code=e.role_code)=7
 AS assertions_ok
\gset
\if :assertions_ok
  \echo 'PREFLIGHT_ASSERTIONS=PASS'
\else
  \echo 'PREFLIGHT_ASSERTIONS=FAIL'
  \quit 3
\endif
ROLLBACK;
