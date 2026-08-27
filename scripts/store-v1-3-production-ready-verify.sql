\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT 'READONLY_GUARD' section,current_setting('transaction_read_only') read_only;

WITH RECURSIVE cashier_orgs AS (
 SELECT o.id,o.parent_id,o.org_code,o.company_code,o.org_type
 FROM sys_user u JOIN sys_user_orgs uo ON uo.user_id=u.user_id JOIN sys_organizations o ON o.id=uo.org_id
 WHERE u.username='cashier'
 UNION ALL
 SELECT p.id,p.parent_id,p.org_code,p.company_code,p.org_type
 FROM cashier_orgs c JOIN sys_organizations p ON p.id=c.parent_id
), cashier_companies AS (
 SELECT DISTINCT COALESCE(company_code,org_code) company_code FROM cashier_orgs WHERE org_type='COMPANY'
), cashier_scope AS (
 SELECT w.warehouse_code FROM wms_warehouses w JOIN cashier_companies c ON c.company_code=w.company_code
 WHERE w.status='ACTIVE' AND w.domain='OPERATIONAL'
), cashier_bindings AS (
 SELECT b.warehouse_code FROM sys_user u JOIN store_memberships m ON m.user_id=u.user_id
 JOIN store_warehouse_bindings b ON b.store_id=m.store_id
 WHERE u.username='cashier' AND m.status='ACTIVE' AND b.status='ACTIVE'
   AND m.effective_from<=NOW() AND (m.effective_to IS NULL OR m.effective_to>=NOW())
   AND b.effective_from<=NOW() AND (b.effective_to IS NULL OR b.effective_to>=NOW())
)
SELECT 'CASHIER_BINDING_SCOPE_INTERSECTION' section,b.warehouse_code,(s.warehouse_code IS NOT NULL) in_scope
FROM cashier_bindings b LEFT JOIN cashier_scope s USING(warehouse_code) ORDER BY b.warehouse_code;

SELECT 'STORE_V1_ERROR_WINDOW' section,id,created_at,error_type,error_message,request_path
FROM sys_error_logs
WHERE created_at >= TIMESTAMPTZ '2026-08-27 06:11:18+00' -- run 33044970951 startedAt
  AND (request_path ILIKE '%inbound%' OR request_path ILIKE '%outbound%' OR request_path ILIKE '%transfer%'
    OR request_path ILIKE '%store-sales%' OR error_message ILIKE '%store_master%'
    OR error_message ILIKE '%store_membership%' OR error_message ILIKE '%store_warehouse_bindings%')
ORDER BY created_at,id;

WITH RECURSIVE expected_store(store_code,company_code,site_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE','ST_LAO_AGRI_LPB_001_SALES'),('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE','ST_LAO_AGRI_MX_001_SALES'),('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE','ST_LAO_AGRI_PSL_001_SALES'),('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE','ST_LAO_AGRI_VTE_WH_001_SALES'),('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE','ST_LAO_XINGCHI_HS_001_SALES'),('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE','ST_LAO_XINGCHI_XC_001_SALES')
), target_zones AS (
 SELECT e.*,'ZN_'||CASE e.company_code WHEN 'COMP-LAO-AGRI' THEN 'AGRI' ELSE 'XINGCHI' END||'_'||replace(replace(e.store_code,'STORE-',''),'-','')||'_'||v.purpose zone_code,v.zone_type
 FROM expected_store e CROSS JOIN (VALUES('SALES','NORMAL'),('RETURNS','QUARANTINE')) v(purpose,zone_type)
), expected_membership(username,role,store_code) AS (VALUES
 ('amei','CASHIER','STORE-HS-001'),('amei','STORE_MANAGER','STORE-HS-001'),('cashier','CASHIER','STORE-VTE-001'),('chenling','STORE_MANAGER','STORE-MX-001'),('alue','STORE_MANAGER','STORE-VTE-001'),('bouavanh','STORE_MANAGER','STORE-BKX-001'),('xiaolan','STORE_MANAGER','STORE-XB-001')
), cashier_orgs AS (
 SELECT o.id,o.parent_id,o.org_code,o.company_code,o.org_type FROM sys_user u JOIN sys_user_orgs uo ON uo.user_id=u.user_id JOIN sys_organizations o ON o.id=uo.org_id WHERE u.username='cashier'
 UNION ALL SELECT p.id,p.parent_id,p.org_code,p.company_code,p.org_type FROM cashier_orgs c JOIN sys_organizations p ON p.id=c.parent_id
), cashier_company AS (
 SELECT DISTINCT COALESCE(company_code,org_code) company_code FROM cashier_orgs WHERE org_type='COMPANY'
), cashier_intersection AS (
 SELECT DISTINCT b.warehouse_code FROM sys_user u JOIN store_memberships m ON m.user_id=u.user_id JOIN store_warehouse_bindings b ON b.store_id=m.store_id JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code JOIN cashier_company c ON c.company_code=w.company_code
 WHERE u.username='cashier' AND m.status='ACTIVE' AND b.status='ACTIVE' AND w.status='ACTIVE' AND w.domain='OPERATIONAL'
)
SELECT current_setting('transaction_read_only')='on'
 AND (SELECT count(*) FROM expected_store e JOIN sys_organizations o ON o.org_code=e.site_code AND o.company_code=e.company_code WHERE o.org_type='SITE' AND o.site_business_type='STORE' AND o.status='ACTIVE')=10
 AND (SELECT count(*) FROM expected_store e JOIN store_master s ON s.store_code=e.store_code WHERE s.company_code=e.company_code AND s.status='ACTIVE')=10
 AND (SELECT count(*) FROM expected_store e JOIN store_master s ON s.store_code=e.store_code JOIN store_aliases a ON a.store_id=s.id AND a.alias_code=e.site_code WHERE a.alias_type='STORE_SITE' AND a.status='ACTIVE')=10
 AND (SELECT count(*) FROM expected_store e JOIN store_master s ON s.store_code=e.store_code JOIN wms_warehouses w ON w.warehouse_code=e.warehouse_code WHERE w.owner_store_id=s.id AND w.company_code=e.company_code AND w.site_code=e.site_code AND w.type='EGG_SALES' AND w.domain='OPERATIONAL' AND w.status='ACTIVE')=10
 AND (SELECT count(*) FROM target_zones t JOIN wms_zones z USING(zone_code) WHERE z.warehouse_code=t.warehouse_code AND z.zone_type=t.zone_type AND z.store_code=t.store_code AND z.status='ACTIVE')=20
 AND (SELECT count(*) FROM target_zones t JOIN wms_locations l ON l.location_code=t.zone_code||'_NORMAL' WHERE l.warehouse_code=t.warehouse_code AND l.zone_code=t.zone_code AND l.store_code=t.store_code AND l.status='ACTIVE')=20
 AND (SELECT count(*) FROM expected_membership e JOIN sys_user u ON u.username=e.username JOIN store_master s ON s.store_code=e.store_code JOIN store_memberships m ON m.user_id=u.user_id AND m.store_id=s.id AND m.role=e.role WHERE m.status='ACTIVE' AND m.effective_to IS NULL)=7
 AND (SELECT count(*) FROM store_warehouse_bindings b JOIN store_master s ON s.id=b.store_id JOIN expected_store e ON e.store_code=s.store_code WHERE b.warehouse_code=e.warehouse_code AND b.purpose IN ('SALES','RETURNS') AND b.priority=1 AND b.status='ACTIVE' AND b.effective_to IS NULL)=20
 AND (SELECT count(*) FROM cashier_intersection)>0
 AND NOT EXISTS (SELECT 1 FROM sys_error_logs WHERE created_at >= TIMESTAMPTZ '2026-08-27 06:11:18+00' AND (request_path ILIKE '%inbound%' OR request_path ILIKE '%outbound%' OR request_path ILIKE '%transfer%' OR request_path ILIKE '%store-sales%' OR error_message ILIKE '%store_master%' OR error_message ILIKE '%store_membership%' OR error_message ILIKE '%store_warehouse_bindings%')) AS assertions_ok
\gset
\if :assertions_ok
 \echo 'STORE_V1_3_READY_ASSERTIONS=PASS'
\else
 \echo 'STORE_V1_3_READY_ASSERTIONS=FAIL'
 SELECT 1/0;
\endif
ROLLBACK;
