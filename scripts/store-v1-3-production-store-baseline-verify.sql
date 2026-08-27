\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT 'READONLY_GUARD' section,current_setting('transaction_read_only') read_only;
WITH expected(store_code,company_code,site_code) AS (VALUES
 ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE'),('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE'),
 ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE'),('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE'),
 ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE'),('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE'),
 ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE'),('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE'),
 ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE'),('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE')
), actual AS (
 SELECT e.*,s.id,s.store_name,s.status,s.timezone,s.business_day_cutoff,a.id alias_id,a.alias_type,a.status alias_status,
        o.org_type,o.site_business_type,o.status site_status,o.company_code site_company
 FROM expected e JOIN store_master s USING(store_code)
 JOIN store_aliases a ON a.store_id=s.id AND a.alias_type='STORE_SITE' AND a.alias_code=e.site_code
 JOIN sys_organizations o ON o.org_code=e.site_code
)
SELECT 'STORE_BASELINE_VERIFY' section,* FROM actual ORDER BY store_code;

WITH expected(store_code,company_code,site_code) AS (VALUES
 ('STORE-BKX-001','COMP-LAO-AGRI','SITE-BKX-001-STORE'),('STORE-LPB-001','COMP-LAO-AGRI','SITE-LPB-001-STORE'),
 ('STORE-MX-001','COMP-LAO-AGRI','SITE-MX-001-STORE'),('STORE-PSL-001','COMP-LAO-AGRI','SITE-PSL-001-STORE'),
 ('STORE-VTE-001','COMP-LAO-AGRI','SITE-VTE-001-STORE'),('STORE-VTE-WH-001','COMP-LAO-AGRI','SITE-VTE-WH-001-STORE'),
 ('STORE-DP-001','COMP-LAO-XINGCHI','SITE-DP-001-STORE'),('STORE-HS-001','COMP-LAO-XINGCHI','SITE-HS-001-STORE'),
 ('STORE-XB-001','COMP-LAO-XINGCHI','SITE-XB-001-STORE'),('STORE-XC-001','COMP-LAO-XINGCHI','SITE-XC-001-STORE')
)
SELECT current_setting('transaction_read_only')='on'
 AND (SELECT count(*) FROM expected e JOIN store_master s USING(store_code)
      WHERE s.company_code=e.company_code AND s.status='ACTIVE' AND s.timezone='Asia/Vientiane' AND s.business_day_cutoff='00:00:00')=10
 AND (SELECT count(*) FROM expected e JOIN store_master s USING(store_code)
      JOIN store_aliases a ON a.store_id=s.id AND a.alias_type='STORE_SITE' AND a.alias_code=e.site_code AND a.status='ACTIVE'
      JOIN sys_organizations o ON o.org_code=e.site_code
      WHERE o.org_type='SITE' AND o.site_business_type='STORE' AND o.status='ACTIVE' AND o.company_code=s.company_code)=10
 AND (SELECT count(DISTINCT store_id) FROM store_aliases WHERE alias_type='STORE_SITE' AND status='ACTIVE')=10
 AND (SELECT count(DISTINCT alias_code) FROM store_aliases WHERE alias_type='STORE_SITE' AND status='ACTIVE')=10 AS assertions_ok
\gset
\if :assertions_ok
  \echo 'STORE_BASELINE_VERIFY_ASSERTIONS=PASS'
\else
  \echo 'STORE_BASELINE_VERIFY_ASSERTIONS=FAIL'
  \quit 3
\endif
ROLLBACK;
