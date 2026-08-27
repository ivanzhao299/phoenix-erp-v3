\pset pager off
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

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
), inserted AS (
 INSERT INTO sys_organizations
   (org_code,org_name,org_name_cn,parent_id,parent_code,org_type,level,path,status,
    company_code,site_code,site_business_type,sort_order,remark,created_at,updated_at)
 SELECT e.site_code,m.store_name||'（组织地点）',m.store_name||'（组织地点）',p.id,e.company_code,
        'SITE',p.level+1,COALESCE(p.path,'/')||e.site_code||'/','ACTIVE',e.company_code,e.site_code,
        'STORE',90,'Store V1-3 approved rollout 2026-08-27',NOW(),NOW()
 FROM expected e JOIN mst_stores m USING(store_code)
 JOIN sys_organizations p ON p.org_code=e.company_code AND p.org_type='COMPANY' AND p.status='ACTIVE'
 WHERE m.company_code=e.company_code
   AND NOT EXISTS (SELECT 1 FROM sys_organizations o WHERE o.org_code=e.site_code)
 RETURNING id,org_code,org_name,parent_id,parent_code,org_type,level,path,status,company_code,site_code,site_business_type
)
SELECT 'SITE_INSERT_RETURNING' section,* FROM inserted ORDER BY org_code;

SELECT count(*)=10 AS inserted_site_count FROM sys_organizations
WHERE org_code=ANY(ARRAY['SITE-BKX-001-STORE','SITE-LPB-001-STORE','SITE-MX-001-STORE','SITE-PSL-001-STORE','SITE-VTE-001-STORE','SITE-VTE-WH-001-STORE','SITE-DP-001-STORE','SITE-HS-001-STORE','SITE-XB-001-STORE','SITE-XC-001-STORE'])
  AND org_type='SITE' AND site_business_type='STORE' AND status='ACTIVE'
\gset
\if :inserted_site_count
\else
  \quit 3
\endif

COMMIT;
\echo 'ROLLBACK_SQL=BEGIN; DELETE FROM sys_organizations WHERE org_code IN (''SITE-BKX-001-STORE'',''SITE-LPB-001-STORE'',''SITE-MX-001-STORE'',''SITE-PSL-001-STORE'',''SITE-VTE-001-STORE'',''SITE-VTE-WH-001-STORE'',''SITE-DP-001-STORE'',''SITE-HS-001-STORE'',''SITE-XB-001-STORE'',''SITE-XC-001-STORE'') AND org_type=''SITE'' AND site_business_type=''STORE''; COMMIT;'
