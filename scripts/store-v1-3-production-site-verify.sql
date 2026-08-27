\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT 'READONLY_GUARD' section,current_setting('transaction_read_only') read_only;
SELECT 'SITE_VERIFY' section,o.id,o.org_code,o.org_name,o.parent_code,o.org_type,o.level,o.path,
       o.status,o.company_code,o.site_code,o.site_business_type
FROM sys_organizations o
WHERE o.org_code=ANY(ARRAY['SITE-BKX-001-STORE','SITE-LPB-001-STORE','SITE-MX-001-STORE','SITE-PSL-001-STORE','SITE-VTE-001-STORE','SITE-VTE-WH-001-STORE','SITE-DP-001-STORE','SITE-HS-001-STORE','SITE-XB-001-STORE','SITE-XC-001-STORE'])
ORDER BY o.org_code;
SELECT count(*)=10 AND bool_and(org_type='SITE' AND site_business_type='STORE' AND status='ACTIVE'
  AND company_code=parent_code AND site_code=org_code) assertions_ok
FROM sys_organizations WHERE org_code=ANY(ARRAY['SITE-BKX-001-STORE','SITE-LPB-001-STORE','SITE-MX-001-STORE','SITE-PSL-001-STORE','SITE-VTE-001-STORE','SITE-VTE-WH-001-STORE','SITE-DP-001-STORE','SITE-HS-001-STORE','SITE-XB-001-STORE','SITE-XC-001-STORE'])
\gset
\if :assertions_ok
  \echo 'SITE_VERIFY_ASSERTIONS=PASS'
\else
  \quit 3
\endif
ROLLBACK;
