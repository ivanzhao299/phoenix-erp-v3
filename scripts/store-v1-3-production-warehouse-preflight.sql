\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT 'READONLY_GUARD' section,current_setting('transaction_read_only') read_only;
WITH expected(store_code,company_code,site_code,warehouse_code) AS (VALUES
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
), targets AS (
 SELECT e.*,s.id store_id,s.status store_status,
        'ZN_'||CASE e.company_code WHEN 'COMP-LAO-AGRI' THEN 'AGRI' ELSE 'XINGCHI' END||'_'||replace(replace(e.store_code,'STORE-',''),'-','')||'_'||v.purpose zone_code,
        'ZN_'||CASE e.company_code WHEN 'COMP-LAO-AGRI' THEN 'AGRI' ELSE 'XINGCHI' END||'_'||replace(replace(e.store_code,'STORE-',''),'-','')||'_'||v.purpose||'_NORMAL' location_code
 FROM expected e JOIN store_master s USING(store_code) CROSS JOIN (VALUES('SALES'),('RETURNS')) v(purpose)
)
SELECT 'WAREHOUSE_PREFLIGHT' section,t.*,w.id warehouse_id,z.id zone_id,l.location_code existing_location
FROM targets t LEFT JOIN wms_warehouses w USING(warehouse_code)
LEFT JOIN wms_zones z USING(zone_code) LEFT JOIN wms_locations l USING(location_code)
ORDER BY t.store_code,t.zone_code;

WITH expected(store_code,company_code,site_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE','ST_LAO_AGRI_LPB_001_SALES'),
 ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE','ST_LAO_AGRI_MX_001_SALES'),('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE','ST_LAO_AGRI_PSL_001_SALES'),
 ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE','ST_LAO_AGRI_VTE_WH_001_SALES'),
 ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE','ST_LAO_XINGCHI_HS_001_SALES'),
 ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE','ST_LAO_XINGCHI_XC_001_SALES')
), targets AS (SELECT e.*,'ZN_'||CASE e.company_code WHEN 'COMP-LAO-AGRI' THEN 'AGRI' ELSE 'XINGCHI' END||'_'||replace(replace(e.store_code,'STORE-',''),'-','')||'_'||v.purpose zone_code FROM expected e CROSS JOIN (VALUES('SALES'),('RETURNS')) v(purpose))
SELECT 'WAREHOUSE_PREFLIGHT_COUNTS' section,
 (SELECT count(*) FROM wms_warehouses WHERE domain='OPERATIONAL') operational_total,
 (SELECT count(*) FROM wms_warehouses WHERE status='ACTIVE' AND domain='OPERATIONAL') active_operational_total,
 (SELECT count(*) FROM wms_warehouses w JOIN expected e USING(warehouse_code)) target_warehouses,
 (SELECT count(*) FROM wms_zones z JOIN targets t USING(zone_code)) target_zones,
 (SELECT count(*) FROM wms_locations l JOIN targets t ON l.location_code=t.zone_code||'_NORMAL') target_locations;

WITH expected(store_code,company_code,site_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE','ST_LAO_AGRI_LPB_001_SALES'),
 ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE','ST_LAO_AGRI_MX_001_SALES'),('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE','ST_LAO_AGRI_PSL_001_SALES'),
 ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE','ST_LAO_AGRI_VTE_WH_001_SALES'),
 ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE','ST_LAO_XINGCHI_HS_001_SALES'),
 ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE','ST_LAO_XINGCHI_XC_001_SALES')
), targets AS (SELECT e.*,'ZN_'||CASE e.company_code WHEN 'COMP-LAO-AGRI' THEN 'AGRI' ELSE 'XINGCHI' END||'_'||replace(replace(e.store_code,'STORE-',''),'-','')||'_'||v.purpose zone_code FROM expected e CROSS JOIN (VALUES('SALES'),('RETURNS')) v(purpose))
SELECT current_setting('transaction_read_only')='on'
 AND (SELECT count(*) FROM expected e JOIN store_master s USING(store_code) WHERE s.company_code=e.company_code AND s.status='ACTIVE')=10
 AND (SELECT count(*) FROM expected e JOIN sys_organizations o ON o.org_code=e.site_code WHERE o.company_code=e.company_code AND o.org_type='SITE' AND o.site_business_type='STORE' AND o.status='ACTIVE')=10
 AND (SELECT count(*) FROM wms_warehouses WHERE domain='OPERATIONAL')=21
 AND NOT EXISTS(SELECT 1 FROM wms_warehouses w JOIN expected e USING(warehouse_code))
 AND NOT EXISTS(SELECT 1 FROM wms_zones z JOIN targets t USING(zone_code))
 AND NOT EXISTS(SELECT 1 FROM wms_locations l JOIN targets t ON l.location_code=t.zone_code||'_NORMAL') AS assertions_ok
\gset
\if :assertions_ok
 \echo 'WAREHOUSE_PREFLIGHT_ASSERTIONS=PASS'
\else
 \echo 'WAREHOUSE_PREFLIGHT_ASSERTIONS=FAIL'
 SELECT 1/0;
\endif
ROLLBACK;
