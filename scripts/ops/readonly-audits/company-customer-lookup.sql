SELECT 'LOOKUP_ERROR_WINDOW_60M' AS section,
       COUNT(*)::int AS error_count
  FROM sys_error_logs
 WHERE created_at >= NOW() - INTERVAL '60 minutes'
   AND regexp_replace(COALESCE(request_path, ''), '\?.*$', '')
       IN ('/api/lookup/companies', '/api/lookup/customers');

DO $$
DECLARE
  error_count integer;
BEGIN
  SELECT COUNT(*)::int INTO error_count
    FROM sys_error_logs
   WHERE created_at >= NOW() - INTERVAL '60 minutes'
     AND regexp_replace(COALESCE(request_path, ''), '\?.*$', '')
         IN ('/api/lookup/companies', '/api/lookup/customers');
  IF error_count <> 0 THEN
    RAISE EXCEPTION 'lookup company/customer error window is not zero: %', error_count;
  END IF;
END $$;
