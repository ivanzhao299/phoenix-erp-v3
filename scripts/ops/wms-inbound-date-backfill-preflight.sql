\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'preflight must run read-only';
  END IF;
END $$;

WITH evidence AS (
  SELECT DISTINCT l.batch_no, i.date::date AS business_date, 'WMS_INBOUND'::text AS source_kind
    FROM inv_ledger l JOIN wms_inbound i ON i.task_no = l.ref_no
   WHERE i.date IS NOT NULL
  UNION
  SELECT DISTINCT l.batch_no, r.receipt_date::date, 'PRC2_RECEIPT'::text
    FROM inv_ledger l JOIN prc2_receipts r ON r.receipt_no = l.ref_no
   WHERE r.receipt_date IS NOT NULL
), resolved AS (
  SELECT batch_no, min(business_date) AS business_date,
         count(DISTINCT business_date) AS date_count,
         string_agg(DISTINCT source_kind, ',' ORDER BY source_kind) AS sources
    FROM evidence GROUP BY batch_no
)
SELECT b.id, b.batch_no, b.inbound_date, r.business_date, r.date_count, r.sources
  FROM resolved r JOIN inv_batches b ON b.batch_no = r.batch_no
 ORDER BY r.date_count DESC, b.batch_no;

WITH evidence AS (
  SELECT DISTINCT l.batch_no, i.date::date AS business_date
    FROM inv_ledger l JOIN wms_inbound i ON i.task_no = l.ref_no
   WHERE i.date IS NOT NULL
  UNION
  SELECT DISTINCT l.batch_no, r.receipt_date::date
    FROM inv_ledger l JOIN prc2_receipts r ON r.receipt_no = l.ref_no
   WHERE r.receipt_date IS NOT NULL
), resolved AS (
  SELECT batch_no, count(DISTINCT business_date) AS date_count
    FROM evidence GROUP BY batch_no
), candidates AS (
  SELECT b.inbound_date, r.date_count
    FROM resolved r JOIN inv_batches b ON b.batch_no = r.batch_no
)
SELECT count(*) FILTER (WHERE inbound_date IS NULL AND date_count = 1) AS eligible_null_rows,
       count(*) FILTER (WHERE date_count <> 1) AS ambiguous_rows,
       count(*) FILTER (WHERE inbound_date IS NOT NULL) AS preexisting_nonnull_rows
  FROM candidates;

DO $$ BEGIN
  IF EXISTS (
    WITH evidence AS (
      SELECT DISTINCT l.batch_no, i.date::date AS business_date
        FROM inv_ledger l JOIN wms_inbound i ON i.task_no = l.ref_no
       WHERE i.date IS NOT NULL
      UNION
      SELECT DISTINCT l.batch_no, r.receipt_date::date
        FROM inv_ledger l JOIN prc2_receipts r ON r.receipt_no = l.ref_no
       WHERE r.receipt_date IS NOT NULL
    ), resolved AS (
      SELECT batch_no FROM evidence GROUP BY batch_no
    )
    SELECT 1 FROM resolved r JOIN inv_batches b ON b.batch_no = r.batch_no
     WHERE b.inbound_date IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'candidate set is not in the required NULL state';
  END IF;
END $$;
ROLLBACK;
