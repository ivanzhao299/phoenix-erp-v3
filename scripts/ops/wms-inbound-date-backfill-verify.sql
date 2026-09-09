\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';

WITH evidence AS (
  SELECT DISTINCT l.batch_no, i.date::date AS business_date FROM inv_ledger l JOIN wms_inbound i ON i.task_no=l.ref_no WHERE i.date IS NOT NULL
  UNION SELECT DISTINCT l.batch_no, r.receipt_date::date FROM inv_ledger l JOIN prc2_receipts r ON r.receipt_no=l.ref_no WHERE r.receipt_date IS NOT NULL
), resolved AS (
  SELECT batch_no, min(business_date) business_date, count(DISTINCT business_date) date_count FROM evidence GROUP BY batch_no
)
SELECT count(*) AS proven_rows,
       count(*) FILTER (WHERE b.inbound_date=r.business_date) AS verified_rows,
       count(*) FILTER (WHERE b.inbound_date IS NULL) AS unexpected_null_rows,
       count(*) FILTER (WHERE b.inbound_date IS DISTINCT FROM r.business_date) AS mismatched_rows
  FROM resolved r JOIN inv_batches b ON b.batch_no=r.batch_no WHERE r.date_count=1;

DO $$ BEGIN
  IF EXISTS (
    WITH evidence AS (
      SELECT DISTINCT l.batch_no, i.date::date business_date FROM inv_ledger l JOIN wms_inbound i ON i.task_no=l.ref_no WHERE i.date IS NOT NULL
      UNION SELECT DISTINCT l.batch_no, r.receipt_date::date FROM inv_ledger l JOIN prc2_receipts r ON r.receipt_no=l.ref_no WHERE r.receipt_date IS NOT NULL
    ), resolved AS (
      SELECT batch_no, min(business_date) business_date, count(DISTINCT business_date) date_count FROM evidence GROUP BY batch_no
    ) SELECT 1 FROM resolved r JOIN inv_batches b ON b.batch_no=r.batch_no
       WHERE r.date_count=1 AND b.inbound_date IS DISTINCT FROM r.business_date
  ) THEN RAISE EXCEPTION 'verified value differs from its single proven business date'; END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    WITH evidence AS (
      SELECT DISTINCT l.batch_no, i.date::date business_date FROM inv_ledger l JOIN wms_inbound i ON i.task_no=l.ref_no WHERE i.date IS NOT NULL
      UNION SELECT DISTINCT l.batch_no, r.receipt_date::date FROM inv_ledger l JOIN prc2_receipts r ON r.receipt_no=l.ref_no WHERE r.receipt_date IS NOT NULL
    ), ambiguous AS (
      SELECT batch_no FROM evidence GROUP BY batch_no HAVING count(DISTINCT business_date) > 1
    ) SELECT 1 FROM ambiguous a JOIN inv_batches b ON b.batch_no=a.batch_no WHERE b.inbound_date IS NOT NULL
  ) THEN RAISE EXCEPTION 'ambiguous batch must remain NULL'; END IF;
END $$;

SELECT count(*) AS total_batches,
       count(*) FILTER (WHERE inbound_date IS NOT NULL) AS dated_batches,
       count(*) FILTER (WHERE inbound_date IS NULL) AS undated_batches,
       min(inbound_date) AS min_inbound_date, max(inbound_date) AS max_inbound_date
  FROM inv_batches;
ROLLBACK;
