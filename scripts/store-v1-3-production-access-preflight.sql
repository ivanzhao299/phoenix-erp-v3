\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT 'READONLY_GUARD' section,current_setting('transaction_read_only') read_only;
WITH expected_membership(username,role_code,membership_role,store_code) AS (VALUES
 ('amei','ROLE_CASHIER','CASHIER','STORE-HS-001'),('amei','ROLE_STORE_MGR','STORE_MANAGER','STORE-HS-001'),
 ('cashier','ROLE_CASHIER','CASHIER','STORE-VTE-001'),('chenling','ROLE_STORE_MGR','STORE_MANAGER','STORE-MX-001'),
 ('alue','ROLE_STORE_MGR','STORE_MANAGER','STORE-VTE-001'),('bouavanh','ROLE_STORE_MGR','STORE_MANAGER','STORE-BKX-001'),
 ('xiaolan','ROLE_STORE_MGR','STORE_MANAGER','STORE-XB-001')
), expected_store(store_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','ST_LAO_AGRI_LPB_001_SALES'),
 ('STORE-MX-001','ST_LAO_AGRI_MX_001_SALES'),('STORE-PSL-001','ST_LAO_AGRI_PSL_001_SALES'),
 ('STORE-VTE-001','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','ST_LAO_AGRI_VTE_WH_001_SALES'),
 ('STORE-DP-001','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','ST_LAO_XINGCHI_HS_001_SALES'),
 ('STORE-XB-001','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','ST_LAO_XINGCHI_XC_001_SALES')
), inputs AS (
 SELECT e.*,u.user_id,u.status user_status,u.store_code legacy_store_code,s.id store_id,s.status store_status,
        bool_or(r.role_code=e.role_code) role_present
 FROM expected_membership e JOIN sys_user u USING(username) JOIN store_master s USING(store_code)
 LEFT JOIN sys_user_role ur ON ur.user_id=u.user_id LEFT JOIN sys_role r ON r.role_id=ur.role_id
 GROUP BY e.username,e.role_code,e.membership_role,e.store_code,u.user_id,u.status,u.store_code,s.id,s.status
)
SELECT 'ACCESS_PREFLIGHT_INPUT' section,* FROM inputs ORDER BY username,membership_role;
WITH expected_membership(username,role_code,membership_role,store_code) AS (VALUES
 ('amei','ROLE_CASHIER','CASHIER','STORE-HS-001'),('amei','ROLE_STORE_MGR','STORE_MANAGER','STORE-HS-001'),
 ('cashier','ROLE_CASHIER','CASHIER','STORE-VTE-001'),('chenling','ROLE_STORE_MGR','STORE_MANAGER','STORE-MX-001'),
 ('alue','ROLE_STORE_MGR','STORE_MANAGER','STORE-VTE-001'),('bouavanh','ROLE_STORE_MGR','STORE_MANAGER','STORE-BKX-001'),('xiaolan','ROLE_STORE_MGR','STORE_MANAGER','STORE-XB-001')
), expected_store(store_code,warehouse_code) AS (VALUES
 ('STORE-BKX-001','ST_LAO_AGRI_BKX_001_SALES'),('STORE-LPB-001','ST_LAO_AGRI_LPB_001_SALES'),('STORE-MX-001','ST_LAO_AGRI_MX_001_SALES'),('STORE-PSL-001','ST_LAO_AGRI_PSL_001_SALES'),('STORE-VTE-001','ST_LAO_AGRI_VTE_001_SALES'),('STORE-VTE-WH-001','ST_LAO_AGRI_VTE_WH_001_SALES'),('STORE-DP-001','ST_LAO_XINGCHI_DP_001_SALES'),('STORE-HS-001','ST_LAO_XINGCHI_HS_001_SALES'),('STORE-XB-001','ST_LAO_XINGCHI_XB_001_SALES'),('STORE-XC-001','ST_LAO_XINGCHI_XC_001_SALES')
)
SELECT current_setting('transaction_read_only')='on'
 AND (SELECT count(*) FROM expected_membership e JOIN sys_user u USING(username) JOIN store_master s USING(store_code) JOIN sys_user_role ur ON ur.user_id=u.user_id JOIN sys_role r ON r.role_id=ur.role_id AND r.role_code=e.role_code WHERE u.status=1 AND u.store_code=e.store_code AND s.status='ACTIVE')=7
 AND (SELECT count(*) FROM store_memberships)=0
 AND (SELECT count(*) FROM store_warehouse_bindings)=0
 AND (SELECT count(*) FROM expected_store e JOIN store_master s USING(store_code) JOIN wms_warehouses w USING(warehouse_code) WHERE w.owner_store_id=s.id AND w.status='ACTIVE' AND w.domain='OPERATIONAL')=10 AS assertions_ok
\gset
\if :assertions_ok
 \echo 'ACCESS_PREFLIGHT_ASSERTIONS=PASS'
\else
 \echo 'ACCESS_PREFLIGHT_ASSERTIONS=FAIL'
 SELECT 1/0;
\endif
ROLLBACK;
