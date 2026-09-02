SELECT 'PRODUCTION_PROCUREMENT_LOCALIZED_NAME_ERROR_WINDOW_60M' AS section,
       COUNT(*)::int AS error_count
  FROM sys_error_logs
 WHERE created_at >= NOW() - INTERVAL '60 minutes'
   AND regexp_replace(COALESCE(request_path, ''), '\?.*$', '') IN (
     '/api/v2/analytics/production',
     '/api/farm/egg/ledger',
     '/api/v2/procurement/orders',
     '/api/v2/procurement/dashboard/supplier-performance'
   );

SELECT 'PRODUCTION_GROUP_CARDINALITY' AS section,
       COUNT(DISTINCT farm_code)::int AS farm_code_groups,
       COUNT(DISTINCT house_code)::int AS house_code_groups
  FROM brd_daily_logs
 WHERE log_date > CURRENT_DATE - INTERVAL '30 days';

SELECT 'SUPPLIER_PERFORMANCE_GROUP_CARDINALITY' AS section,
       COUNT(*)::int AS code_currency_groups
  FROM (
    SELECT supplier_code, currency_code
      FROM prc2_purchase_orders
     WHERE status <> 'CANCELLED'
     GROUP BY supplier_code, currency_code
  ) grouped;

DO $$
DECLARE
  error_count integer;
  duplicate_farm_codes integer;
  duplicate_house_codes integer;
  duplicate_supplier_codes integer;
BEGIN
  SELECT COUNT(*)::int INTO error_count
    FROM sys_error_logs
   WHERE created_at >= NOW() - INTERVAL '60 minutes'
     AND regexp_replace(COALESCE(request_path, ''), '\?.*$', '') IN (
       '/api/v2/analytics/production',
       '/api/farm/egg/ledger',
       '/api/v2/procurement/orders',
       '/api/v2/procurement/dashboard/supplier-performance'
     );

  SELECT COUNT(*)::int INTO duplicate_farm_codes
    FROM (SELECT org_code FROM sys_organizations WHERE org_code IS NOT NULL GROUP BY org_code HAVING COUNT(*) > 1) d;
  SELECT COUNT(*)::int INTO duplicate_house_codes
    FROM (SELECT house_code FROM brd_houses WHERE house_code IS NOT NULL GROUP BY house_code HAVING COUNT(*) > 1) d;
  SELECT COUNT(*)::int INTO duplicate_supplier_codes
    FROM (SELECT supplier_code FROM prc2_suppliers WHERE supplier_code IS NOT NULL GROUP BY supplier_code HAVING COUNT(*) > 1) d;

  IF error_count <> 0 THEN
    RAISE EXCEPTION 'production/procurement localized-name error window is not zero: %', error_count;
  END IF;
  IF duplicate_farm_codes <> 0 OR duplicate_house_codes <> 0 OR duplicate_supplier_codes <> 0 THEN
    RAISE EXCEPTION 'name joins are not code-unique: farm=%, house=%, supplier=%',
      duplicate_farm_codes, duplicate_house_codes, duplicate_supplier_codes;
  END IF;
END $$;
