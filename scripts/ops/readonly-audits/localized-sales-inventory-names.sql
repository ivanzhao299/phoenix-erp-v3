SELECT 'LOCALIZED_NAME_ERROR_WINDOW_60M' AS section,
       COUNT(*)::int AS error_count
  FROM sys_error_logs
 WHERE created_at >= NOW() - INTERVAL '60 minutes'
   AND regexp_replace(COALESCE(request_path, ''), '\?.*$', '') IN (
     '/api/inventory/batches',
     '/api/v2/sales/activity',
     '/api/v2/sales/returns',
     '/api/v2/sales/analytics/overview'
   );

DO $$
DECLARE error_count integer;
BEGIN
  SELECT COUNT(*)::int INTO error_count
    FROM sys_error_logs
   WHERE created_at >= NOW() - INTERVAL '60 minutes'
     AND regexp_replace(COALESCE(request_path, ''), '\?.*$', '') IN (
       '/api/inventory/batches',
       '/api/v2/sales/activity',
       '/api/v2/sales/returns',
       '/api/v2/sales/analytics/overview'
     );
  IF error_count <> 0 THEN
    RAISE EXCEPTION 'localized sales/inventory error window is not zero: %', error_count;
  END IF;
END $$;
