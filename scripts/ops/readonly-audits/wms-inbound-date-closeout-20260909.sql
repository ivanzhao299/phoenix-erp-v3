SELECT 'WMS_INBOUND_DATE_SCHEMA' AS section,
       COUNT(*) FILTER (WHERE table_name = 'inv_batches' AND column_name = 'inbound_date')::int AS inv_batches_column,
       COUNT(*) FILTER (WHERE table_name = 'wms_inbound' AND column_name = 'date')::int AS wms_inbound_column
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (table_name, column_name) IN (('inv_batches', 'inbound_date'), ('wms_inbound', 'date'));

SELECT 'WMS_INBOUND_DATE_DISTRIBUTION' AS section,
       COUNT(*)::int AS total_batches,
       COUNT(*) FILTER (WHERE inbound_date IS NOT NULL)::int AS dated_batches,
       COUNT(*) FILTER (WHERE inbound_date IS NULL)::int AS undated_batches,
       MIN(inbound_date) AS min_inbound_date,
       MAX(inbound_date) AS max_inbound_date,
       COUNT(*) FILTER (WHERE inbound_date > CURRENT_DATE)::int AS future_date_rows
  FROM inv_batches;

SELECT 'WMS_INBOUND_DATE_SORT_HEAD' AS section, id, batch_no, inbound_date
  FROM inv_batches
 WHERE COALESCE(qty_available, qty, 0) > 0
 ORDER BY inbound_date DESC NULLS LAST, batch_no DESC, id DESC
 LIMIT 25;

WITH ordered AS (
  SELECT inbound_date,
         ROW_NUMBER() OVER (ORDER BY inbound_date DESC NULLS LAST, batch_no DESC, id DESC) AS position
    FROM inv_batches
   WHERE COALESCE(qty_available, qty, 0) > 0
), boundary AS (
  SELECT MAX(position) FILTER (WHERE inbound_date IS NOT NULL) AS last_dated_position,
         MIN(position) FILTER (WHERE inbound_date IS NULL) AS first_null_position
    FROM ordered
)
SELECT 'WMS_INBOUND_DATE_NULL_BOUNDARY' AS section, last_dated_position, first_null_position,
       (first_null_position IS NULL OR last_dated_position IS NULL OR first_null_position > last_dated_position) AS nulls_are_after_dates
  FROM boundary;

SELECT 'WMS_INBOUND_DATE_ERROR_WINDOW_60M' AS section, COUNT(*)::int AS error_count
  FROM sys_error_logs
 WHERE created_at >= NOW() - INTERVAL '60 minutes'
   AND regexp_replace(COALESCE(request_path, ''), '\?.*$', '') = '/api/inventory/batches';

DO $$
DECLARE
  schema_count integer;
  mismatch_count integer;
  error_count integer;
BEGIN
  SELECT COUNT(*)::int INTO schema_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND (table_name, column_name) IN (('inv_batches', 'inbound_date'), ('wms_inbound', 'date'));
  IF schema_count <> 2 THEN
    RAISE EXCEPTION 'inbound-date schema columns missing: %/2', schema_count;
  END IF;

  WITH evidence AS (
    SELECT DISTINCT l.batch_no, i.date::date AS business_date
      FROM inv_ledger l JOIN wms_inbound i ON i.task_no = l.ref_no WHERE i.date IS NOT NULL
    UNION
    SELECT DISTINCT l.batch_no, r.receipt_date::date
      FROM inv_ledger l JOIN prc2_receipts r ON r.receipt_no = l.ref_no WHERE r.receipt_date IS NOT NULL
  ), resolved AS (
    SELECT batch_no, MIN(business_date) AS business_date, COUNT(DISTINCT business_date) AS date_count
      FROM evidence GROUP BY batch_no
  )
  SELECT COUNT(*)::int INTO mismatch_count
    FROM resolved r JOIN inv_batches b ON b.batch_no = r.batch_no
   WHERE r.date_count = 1 AND b.inbound_date IS DISTINCT FROM r.business_date;
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'single-chain inbound-date mismatches: %', mismatch_count;
  END IF;

  SELECT COUNT(*)::int INTO error_count
    FROM sys_error_logs
   WHERE created_at >= NOW() - INTERVAL '60 minutes'
     AND regexp_replace(COALESCE(request_path, ''), '\?.*$', '') = '/api/inventory/batches';
  IF error_count <> 0 THEN
    RAISE EXCEPTION 'inventory batch error window is not zero: %', error_count;
  END IF;
END $$;
