\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT 'READONLY_GUARD' section,current_setting('transaction_read_only') read_only;
WITH expected(store_code,company_code,site_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE','ST_LAO_AGRI_LPB_001_SALES'),
 ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE','ST_LAO_AGRI_MX_001_SALES'),('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE','ST_LAO_AGRI_PSL_001_SALES'),
 ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE','ST_LAO_AGRI_VTE_WH_001_SALES'),
 ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE','ST_LAO_XINGCHI_HS_001_SALES'),
 ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE','ST_LAO_XINGCHI_XC_001_SALES')
), actual AS (
 SELECT e.*,s.id store_id,w.id warehouse_id,w.type,w.domain,w.status warehouse_status,w.owner_store_id,
        z.zone_code,z.zone_type,z.status zone_status,l.location_code,l.status location_status
 FROM expected e JOIN store_master s USING(store_code)
 JOIN wms_warehouses w USING(warehouse_code)
 JOIN wms_zones z ON z.warehouse_code=e.warehouse_code
 JOIN wms_locations l ON l.warehouse_code=e.warehouse_code AND l.zone_code=z.zone_code
)
SELECT 'WAREHOUSE_VERIFY' section,* FROM actual ORDER BY warehouse_code,zone_code;

WITH expected(store_code,company_code,site_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE','ST_LAO_AGRI_LPB_001_SALES'),
 ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE','ST_LAO_AGRI_MX_001_SALES'),('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE','ST_LAO_AGRI_PSL_001_SALES'),
 ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE','ST_LAO_AGRI_VTE_WH_001_SALES'),
 ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE','ST_LAO_XINGCHI_HS_001_SALES'),
 ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE','ST_LAO_XINGCHI_XC_001_SALES')
), target_zones AS (SELECT e.*,e.warehouse_code||'_'||v.purpose zone_code,v.zone_type FROM expected e CROSS JOIN (VALUES('SALES','NORMAL'),('RETURNS','QUARANTINE')) v(purpose,zone_type))
SELECT current_setting('transaction_read_only')='on'
 AND (SELECT count(*) FROM expected e JOIN store_master s USING(store_code) JOIN wms_warehouses w USING(warehouse_code)
      WHERE w.company_code=e.company_code AND w.site_code=e.site_code AND w.type='EGG_SALES' AND w.domain='OPERATIONAL' AND w.status='ACTIVE' AND w.owner_store_id=s.id)=10
 AND (SELECT count(*) FROM target_zones t JOIN wms_zones z USING(zone_code) WHERE z.warehouse_code=t.warehouse_code AND z.warehouse=t.warehouse_code AND z.zone_type=t.zone_type AND z.status='ACTIVE' AND z.store_code=t.store_code)=20
 AND (SELECT count(*) FROM target_zones t JOIN wms_locations l ON l.location_code=t.zone_code||'_NORMAL' WHERE l.warehouse_code=t.warehouse_code AND l.zone_code=t.zone_code AND l.status='ACTIVE' AND l.store_code=t.store_code)=20
 AND (SELECT count(*) FROM wms_warehouses WHERE status='ACTIVE' AND domain='OPERATIONAL')=31 AS assertions_ok
\gset
\if :assertions_ok
 \echo 'WAREHOUSE_VERIFY_ASSERTIONS=PASS'
\else
 \echo 'WAREHOUSE_VERIFY_ASSERTIONS=FAIL'
 \quit 3
\endif
ROLLBACK;
