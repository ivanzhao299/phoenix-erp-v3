\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT 'READONLY_GUARD' section,current_setting('transaction_read_only') read_only;

WITH expected(store_code,company_code,site_code) AS (VALUES
 ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE'),
 ('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE'),
 ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE'),
 ('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE'),
 ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE'),
 ('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE'),
 ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE'),
 ('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE'),
 ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE'),
 ('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE')
)
SELECT 'STORE_BASELINE_PREFLIGHT' section,e.*,m.store_name,s.id store_id,
       o.org_type,o.site_business_type,o.status site_status,o.company_code site_company,
       a.id alias_id
FROM expected e
LEFT JOIN mst_stores m USING(store_code)
LEFT JOIN store_master s USING(store_code)
LEFT JOIN sys_organizations o ON o.org_code=e.site_code
LEFT JOIN store_aliases a ON a.alias_type='STORE_SITE' AND a.alias_code=e.site_code
ORDER BY e.store_code;

WITH expected(store_code,company_code,site_code) AS (VALUES
 ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE'),('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE'),
 ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE'),('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE'),
 ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE'),('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE'),
 ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE'),('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE'),
 ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE'),('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE')
)
SELECT current_setting('transaction_read_only')='on'
 AND (SELECT count(*) FROM expected e JOIN mst_stores m USING(store_code) WHERE m.company_code=e.company_code)=10
 AND (SELECT count(*) FROM expected e JOIN sys_organizations o ON o.org_code=e.site_code
      WHERE o.org_type='SITE' AND o.site_business_type='STORE' AND o.status='ACTIVE' AND o.company_code=e.company_code)=10
 AND (SELECT count(*) FROM store_master s JOIN expected e USING(store_code))=0
 AND (SELECT count(*) FROM store_aliases a JOIN expected e ON a.alias_type='STORE_SITE' AND a.alias_code=e.site_code)=0
 AS assertions_ok
\gset
\if :assertions_ok
  \echo 'STORE_BASELINE_PREFLIGHT_ASSERTIONS=PASS'
\else
  \echo 'STORE_BASELINE_PREFLIGHT_ASSERTIONS=FAIL'
  \quit 3
\endif

SELECT 'PRODUCTION_SCHEMA' section,table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('wms_warehouses','wms_zones','wms_locations')
ORDER BY table_name,ordinal_position;
ROLLBACK;
