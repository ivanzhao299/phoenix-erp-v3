\pset pager off
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
WITH expected(username,role,store_code) AS (VALUES
 ('amei','CASHIER','STORE-HS-001'),('amei','STORE_MANAGER','STORE-HS-001'),('cashier','CASHIER','STORE-VTE-001'),
 ('chenling','STORE_MANAGER','STORE-MX-001'),('alue','STORE_MANAGER','STORE-VTE-001'),
 ('bouavanh','STORE_MANAGER','STORE-BKX-001'),('xiaolan','STORE_MANAGER','STORE-XB-001')
), inserted AS (
 INSERT INTO store_memberships(user_id,store_id,role,effective_from,status)
 SELECT u.user_id,s.id,e.role,CURRENT_DATE,'ACTIVE' FROM expected e JOIN sys_user u USING(username) JOIN store_master s USING(store_code)
 ORDER BY e.username,e.role RETURNING id,user_id,store_id,role,effective_from,effective_to,status
)
SELECT 'MEMBERSHIP_INSERT_RETURNING' section,* FROM inserted ORDER BY id;
WITH expected(store_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','ST_LAO_AGRI_LPB_001_SALES'),('STORE-MX-001','ST_LAO_AGRI_MX_001_SALES'),('STORE-PSL-001','ST_LAO_AGRI_PSL_001_SALES'),('STORE-VTE-001','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','ST_LAO_AGRI_VTE_WH_001_SALES'),('STORE-DP-001','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','ST_LAO_XINGCHI_HS_001_SALES'),('STORE-XB-001','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','ST_LAO_XINGCHI_XC_001_SALES')
), inserted AS (
 INSERT INTO store_warehouse_bindings(store_id,warehouse_code,purpose,priority,status,effective_from)
 SELECT s.id,e.warehouse_code,p.purpose,1,'ACTIVE',CURRENT_DATE FROM expected e JOIN store_master s USING(store_code) CROSS JOIN (VALUES('SALES'),('RETURNS')) p(purpose)
 ORDER BY e.store_code,p.purpose RETURNING id,store_id,warehouse_code,purpose,priority,status,effective_from,effective_to
)
SELECT 'BINDING_INSERT_RETURNING' section,* FROM inserted ORDER BY id;
SELECT (SELECT count(*) FROM store_memberships WHERE effective_from=CURRENT_DATE AND status='ACTIVE')=7
 AND (SELECT count(*) FROM store_warehouse_bindings WHERE effective_from=CURRENT_DATE AND status='ACTIVE' AND priority=1)=20 AS inserted_counts_ok
\gset
\if :inserted_counts_ok
\else
 SELECT 1/0;
\endif
COMMIT;
\echo 'ROLLBACK_SQL=BEGIN; DELETE FROM store_warehouse_bindings WHERE effective_from=CURRENT_DATE AND priority=1 AND store_id IN (SELECT id FROM store_master WHERE store_code IN (''STORE-BKX-001'',''STORE-LPB-001'',''STORE-MX-001'',''STORE-PSL-001'',''STORE-VTE-001'',''STORE-VTE-WH-001'',''STORE-DP-001'',''STORE-HS-001'',''STORE-XB-001'',''STORE-XC-001'')); DELETE FROM store_memberships WHERE effective_from=CURRENT_DATE AND user_id IN (SELECT user_id FROM sys_user WHERE username IN (''amei'',''cashier'',''chenling'',''alue'',''bouavanh'',''xiaolan'')); COMMIT;'
