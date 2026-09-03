SELECT 'ORG_COMPANY_NAME_QUALITY' AS section,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(org_name), '') IS NULL)::int AS org_name_missing,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(org_name_cn), '') IS NULL)::int AS org_name_cn_missing
  FROM sys_organizations
 WHERE org_type = 'COMPANY';

SELECT 'ORG_COMPANY_KEY_DUPLICATE' AS section,
       COALESCE(company_code, org_code) AS company_key,
       COUNT(*)::int AS org_count
  FROM sys_organizations
 WHERE org_type = 'COMPANY'
   AND NULLIF(BTRIM(COALESCE(company_code, org_code)), '') IS NOT NULL
 GROUP BY COALESCE(company_code, org_code)
HAVING COUNT(*) > 1
 ORDER BY company_key;

WITH companies AS (
  SELECT COALESCE(company_code, org_code) AS company_key
    FROM sys_organizations
   WHERE org_type = 'COMPANY'
), company_rows AS (
  SELECT 'biz_projects' AS source, company_code FROM biz_projects
  UNION ALL SELECT 'sal_customers', company_code FROM sal_customers
  UNION ALL SELECT 'wms_warehouses', company_code FROM wms_warehouses
  UNION ALL SELECT 'mst_stores', company_code FROM mst_stores
  UNION ALL SELECT 'sal_drivers', company_code FROM sal_drivers
  UNION ALL SELECT 'sal_vehicles', company_code FROM sal_vehicles
  UNION ALL SELECT 'fin_cash_accounts', company_code FROM fin_cash_accounts
  UNION ALL SELECT 'fin_bank_accounts', company_code FROM fin_bank_accounts
), matches AS (
  SELECT r.source, r.company_code,
         (SELECT COUNT(*) FROM companies c WHERE c.company_key = r.company_code) AS match_count
    FROM company_rows r
)
SELECT 'COMPANY_JOIN_COVERAGE' AS section, source,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(company_code), '') IS NULL)::int AS company_missing,
       COUNT(*) FILTER (WHERE match_count = 0)::int AS join_miss,
       COUNT(*) FILTER (WHERE match_count = 1)::int AS join_hit,
       COUNT(*) FILTER (WHERE match_count > 1)::int AS join_duplicate
  FROM matches
 GROUP BY source
 ORDER BY source;

SELECT 'TYPE_DISTRIBUTION' AS section, source, value, row_count
  FROM (
    SELECT 'project.project_type' AS source, COALESCE(project_type, '<NULL>') AS value, COUNT(*)::int AS row_count FROM biz_projects GROUP BY project_type
    UNION ALL SELECT 'supplier.supplier_type', COALESCE(supplier_type, '<NULL>'), COUNT(*)::int FROM prc2_suppliers GROUP BY supplier_type
    UNION ALL SELECT 'warehouse.type', COALESCE(type, '<NULL>'), COUNT(*)::int FROM wms_warehouses GROUP BY type
    UNION ALL SELECT 'cash_account.account_type', COALESCE(account_type, '<NULL>'), COUNT(*)::int FROM fin_cash_accounts GROUP BY account_type
    UNION ALL SELECT 'vehicle.vehicle_type', COALESCE(vehicle_type, '<NULL>'), COUNT(*)::int FROM sal_vehicles GROUP BY vehicle_type
  ) distributions
 ORDER BY source, value;

SELECT 1 / (1 - (EXISTS (
  SELECT 1
    FROM sys_organizations
   WHERE org_type = 'COMPANY'
     AND NULLIF(BTRIM(COALESCE(company_code, org_code)), '') IS NOT NULL
   GROUP BY COALESCE(company_code, org_code)
  HAVING COUNT(*) > 1
))::int) AS company_join_key_unique_assertion;

SELECT 'MASTER_DATA_NINE_PAGE_ERROR_WINDOW_60M' AS section, COUNT(*)::int AS error_count
  FROM sys_error_logs
 WHERE created_at >= NOW() - INTERVAL '60 minutes'
   AND regexp_replace(COALESCE(request_path, ''), '\?.*$', '') LIKE '/api/master-data/runtime/%';
