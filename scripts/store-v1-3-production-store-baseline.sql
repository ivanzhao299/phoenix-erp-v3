\pset pager off
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

WITH expected(store_code,company_code,site_code) AS (VALUES
 ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE'),('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE'),
 ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE'),('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE'),
 ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE'),('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE'),
 ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE'),('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE'),
 ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE'),('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE')
), inserted_store AS (
 INSERT INTO store_master(store_code,store_name,company_code,status,timezone,business_day_cutoff)
 SELECT e.store_code,m.store_name,e.company_code,'ACTIVE','Asia/Vientiane','00:00:00'
 FROM expected e JOIN mst_stores m USING(store_code)
 ORDER BY e.store_code
 RETURNING id,store_code,store_name,company_code,status,timezone,business_day_cutoff
)
SELECT 'STORE_MASTER_INSERT_RETURNING' section,* FROM inserted_store ORDER BY store_code;

WITH expected(store_code,site_code) AS (VALUES
 ('STORE-BKX-001','SITE-BKX-001-STORE'),('STORE-LPB-001','SITE-LPB-001-STORE'),
 ('STORE-MX-001','SITE-MX-001-STORE'),('STORE-PSL-001','SITE-PSL-001-STORE'),
 ('STORE-VTE-001','SITE-VTE-001-STORE'),('STORE-VTE-WH-001','SITE-VTE-WH-001-STORE'),
 ('STORE-DP-001','SITE-DP-001-STORE'),('STORE-HS-001','SITE-HS-001-STORE'),
 ('STORE-XB-001','SITE-XB-001-STORE'),('STORE-XC-001','SITE-XC-001-STORE')
), inserted_alias AS (
 INSERT INTO store_aliases(store_id,alias_type,alias_code,status)
 SELECT s.id,'STORE_SITE',e.site_code,'ACTIVE' FROM expected e JOIN store_master s USING(store_code)
 ORDER BY e.store_code
 RETURNING id,store_id,alias_type,alias_code,status
)
SELECT 'STORE_ALIAS_INSERT_RETURNING' section,* FROM inserted_alias ORDER BY alias_code;

SELECT (SELECT count(*) FROM store_master WHERE store_code=ANY(ARRAY['STORE-BKX-001','STORE-LPB-001','STORE-MX-001','STORE-PSL-001','STORE-VTE-001','STORE-VTE-WH-001','STORE-DP-001','STORE-HS-001','STORE-XB-001','STORE-XC-001']))=10
 AND (SELECT count(*) FROM store_aliases WHERE alias_type='STORE_SITE' AND alias_code=ANY(ARRAY['SITE-BKX-001-STORE','SITE-LPB-001-STORE','SITE-MX-001-STORE','SITE-PSL-001-STORE','SITE-VTE-001-STORE','SITE-VTE-WH-001-STORE','SITE-DP-001-STORE','SITE-HS-001-STORE','SITE-XB-001-STORE','SITE-XC-001-STORE']))=10 AS inserted_counts_ok
\gset
\if :inserted_counts_ok
\else
  \quit 3
\endif
COMMIT;
\echo 'ROLLBACK_SQL=BEGIN; DELETE FROM store_aliases WHERE alias_type=''STORE_SITE'' AND alias_code IN (''SITE-BKX-001-STORE'',''SITE-LPB-001-STORE'',''SITE-MX-001-STORE'',''SITE-PSL-001-STORE'',''SITE-VTE-001-STORE'',''SITE-VTE-WH-001-STORE'',''SITE-DP-001-STORE'',''SITE-HS-001-STORE'',''SITE-XB-001-STORE'',''SITE-XC-001-STORE''); DELETE FROM store_master WHERE store_code IN (''STORE-BKX-001'',''STORE-LPB-001'',''STORE-MX-001'',''STORE-PSL-001'',''STORE-VTE-001'',''STORE-VTE-WH-001'',''STORE-DP-001'',''STORE-HS-001'',''STORE-XB-001'',''STORE-XC-001''); COMMIT;'
