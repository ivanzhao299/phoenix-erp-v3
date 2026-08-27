\pset pager off
BEGIN TRANSACTION READ ONLY;
WITH expected(username,role,store_code) AS (VALUES
 ('amei','CASHIER','STORE-HS-001'),('amei','STORE_MANAGER','STORE-HS-001'),('cashier','CASHIER','STORE-VTE-001'),('chenling','STORE_MANAGER','STORE-MX-001'),('alue','STORE_MANAGER','STORE-VTE-001'),('bouavanh','STORE_MANAGER','STORE-BKX-001'),('xiaolan','STORE_MANAGER','STORE-XB-001')
)
SELECT 'MEMBERSHIP_VERIFY' section,u.username,m.role,s.store_code,m.effective_from,m.effective_to,m.status FROM expected e JOIN sys_user u USING(username) JOIN store_master s USING(store_code) JOIN store_memberships m ON m.user_id=u.user_id AND m.store_id=s.id AND m.role=e.role ORDER BY u.username,m.role;
WITH expected(store_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','ST_LAO_AGRI_LPB_001_SALES'),('STORE-MX-001','ST_LAO_AGRI_MX_001_SALES'),('STORE-PSL-001','ST_LAO_AGRI_PSL_001_SALES'),('STORE-VTE-001','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','ST_LAO_AGRI_VTE_WH_001_SALES'),('STORE-DP-001','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','ST_LAO_XINGCHI_HS_001_SALES'),('STORE-XB-001','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','ST_LAO_XINGCHI_XC_001_SALES')
)
SELECT 'BINDING_VERIFY' section,s.store_code,b.warehouse_code,b.purpose,b.priority,b.status,w.owner_store_id FROM expected e JOIN store_master s USING(store_code) JOIN store_warehouse_bindings b ON b.store_id=s.id AND b.warehouse_code=e.warehouse_code JOIN wms_warehouses w USING(warehouse_code) ORDER BY s.store_code,b.purpose;
WITH expected_membership(username,role,store_code) AS (VALUES ('amei','CASHIER','STORE-HS-001'),('amei','STORE_MANAGER','STORE-HS-001'),('cashier','CASHIER','STORE-VTE-001'),('chenling','STORE_MANAGER','STORE-MX-001'),('alue','STORE_MANAGER','STORE-VTE-001'),('bouavanh','STORE_MANAGER','STORE-BKX-001'),('xiaolan','STORE_MANAGER','STORE-XB-001'))
SELECT current_setting('transaction_read_only')='on'
 AND (SELECT count(*) FROM expected_membership e JOIN sys_user u USING(username) JOIN store_master s USING(store_code) JOIN store_memberships m ON m.user_id=u.user_id AND m.store_id=s.id AND m.role=e.role WHERE m.status='ACTIVE' AND m.effective_from::date=CURRENT_DATE AND m.effective_to IS NULL)=7
 AND (SELECT count(*) FROM store_warehouse_bindings b JOIN store_master s ON s.id=b.store_id JOIN wms_warehouses w USING(warehouse_code) WHERE b.status='ACTIVE' AND b.effective_from::date=CURRENT_DATE AND b.effective_to IS NULL AND b.priority=1 AND w.owner_store_id=s.id AND w.status='ACTIVE' AND w.domain='OPERATIONAL')=20 AS assertions_ok
\gset
\if :assertions_ok
 \echo 'ACCESS_VERIFY_ASSERTIONS=PASS'
\else
 \echo 'ACCESS_VERIFY_ASSERTIONS=FAIL'
 SELECT 1/0;
\endif
ROLLBACK;
