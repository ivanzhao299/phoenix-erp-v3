\pset pager off
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
WITH expected(store_code,company_code,site_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE','ST_LAO_AGRI_LPB_001_SALES'),
 ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE','ST_LAO_AGRI_MX_001_SALES'),('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE','ST_LAO_AGRI_PSL_001_SALES'),
 ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE','ST_LAO_AGRI_VTE_WH_001_SALES'),
 ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE','ST_LAO_XINGCHI_HS_001_SALES'),
 ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE','ST_LAO_XINGCHI_XC_001_SALES')
), inserted AS (
 INSERT INTO wms_warehouses(warehouse_code,warehouse_name,warehouse_name_zh,type,status,site_code,company_code,domain,owner_store_id,remark)
 SELECT e.warehouse_code,m.store_name||'销售仓',m.store_name||'销售仓','EGG_SALES','ACTIVE',e.site_code,e.company_code,'OPERATIONAL',s.id,'Store V1-3 approved rollout 2026-08-27'
 FROM expected e JOIN mst_stores m USING(store_code) JOIN store_master s USING(store_code)
 ORDER BY e.store_code RETURNING id,warehouse_code,warehouse_name,type,status,site_code,company_code,domain,owner_store_id
)
SELECT 'WAREHOUSE_INSERT_RETURNING' section,* FROM inserted ORDER BY warehouse_code;

WITH expected(store_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','ST_LAO_AGRI_LPB_001_SALES'),('STORE-MX-001','ST_LAO_AGRI_MX_001_SALES'),
 ('STORE-PSL-001','ST_LAO_AGRI_PSL_001_SALES'),('STORE-VTE-001','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','ST_LAO_AGRI_VTE_WH_001_SALES'),
 ('STORE-DP-001','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','ST_LAO_XINGCHI_HS_001_SALES'),('STORE-XB-001','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','ST_LAO_XINGCHI_XC_001_SALES')
), inserted AS (
 INSERT INTO wms_zones(zone_code,zone_name,warehouse,warehouse_code,zone_type,status,store_code)
 SELECT e.warehouse_code||'_'||v.purpose,v.zone_name,e.warehouse_code,e.warehouse_code,v.zone_type,'ACTIVE',e.store_code
 FROM expected e CROSS JOIN (VALUES('SALES','销售区','NORMAL'),('RETURNS','退货区','QUARANTINE')) v(purpose,zone_name,zone_type)
 ORDER BY e.store_code,v.purpose RETURNING id,zone_code,zone_name,warehouse,warehouse_code,zone_type,status,store_code
)
SELECT 'ZONE_INSERT_RETURNING' section,* FROM inserted ORDER BY zone_code;

WITH expected(store_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','ST_LAO_AGRI_LPB_001_SALES'),('STORE-MX-001','ST_LAO_AGRI_MX_001_SALES'),
 ('STORE-PSL-001','ST_LAO_AGRI_PSL_001_SALES'),('STORE-VTE-001','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','ST_LAO_AGRI_VTE_WH_001_SALES'),
 ('STORE-DP-001','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','ST_LAO_XINGCHI_HS_001_SALES'),('STORE-XB-001','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','ST_LAO_XINGCHI_XC_001_SALES')
), inserted AS (
 INSERT INTO wms_locations(location_code,warehouse_code,zone_code,location_name,capacity_qty,status,store_code)
 SELECT e.warehouse_code||'_'||v.purpose||'_NORMAL',e.warehouse_code,e.warehouse_code||'_'||v.purpose,v.location_name,0,'ACTIVE',e.store_code
 FROM expected e CROSS JOIN (VALUES('SALES','销售区标准位'),('RETURNS','退货区标准位')) v(purpose,location_name)
 ORDER BY e.store_code,v.purpose RETURNING location_code,warehouse_code,zone_code,location_name,capacity_qty,status,store_code
)
SELECT 'LOCATION_INSERT_RETURNING' section,* FROM inserted ORDER BY location_code;

SELECT (SELECT count(*) FROM wms_warehouses WHERE owner_store_id IN (SELECT id FROM store_master WHERE store_code LIKE 'STORE-%') AND remark='Store V1-3 approved rollout 2026-08-27')=10
 AND (SELECT count(*) FROM wms_zones z JOIN wms_warehouses w USING(warehouse_code) WHERE w.remark='Store V1-3 approved rollout 2026-08-27')=20
 AND (SELECT count(*) FROM wms_locations l JOIN wms_warehouses w USING(warehouse_code) WHERE w.remark='Store V1-3 approved rollout 2026-08-27')=20 AS inserted_counts_ok
\gset
\if :inserted_counts_ok
\else
 \quit 3
\endif
COMMIT;
\echo 'ROLLBACK_SQL=BEGIN; DELETE FROM wms_locations WHERE warehouse_code IN (SELECT warehouse_code FROM wms_warehouses WHERE remark=''Store V1-3 approved rollout 2026-08-27''); DELETE FROM wms_zones WHERE warehouse_code IN (SELECT warehouse_code FROM wms_warehouses WHERE remark=''Store V1-3 approved rollout 2026-08-27''); DELETE FROM wms_warehouses WHERE remark=''Store V1-3 approved rollout 2026-08-27''; COMMIT;'
