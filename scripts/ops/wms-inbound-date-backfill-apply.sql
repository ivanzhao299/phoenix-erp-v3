\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE inbound_date_apply ON COMMIT DROP AS
WITH evidence AS (
  SELECT DISTINCT l.batch_no, i.date::date AS business_date
    FROM inv_ledger l JOIN wms_inbound i ON i.task_no = l.ref_no WHERE i.date IS NOT NULL
  UNION
  SELECT DISTINCT l.batch_no, r.receipt_date::date
    FROM inv_ledger l JOIN prc2_receipts r ON r.receipt_no = l.ref_no WHERE r.receipt_date IS NOT NULL
), resolved AS (
  SELECT batch_no, min(business_date) AS business_date, count(DISTINCT business_date) AS date_count
    FROM evidence GROUP BY batch_no
)
SELECT b.id, b.batch_no, r.business_date
  FROM resolved r JOIN inv_batches b ON b.batch_no = r.batch_no
 WHERE b.inbound_date IS NULL AND r.date_count = 1
 FOR UPDATE OF b;

-- Capture this result in the change record before COMMIT. It is the guarded reverse SQL.
SELECT format('UPDATE inv_batches SET inbound_date=NULL, updated_at=now() WHERE id=%s AND batch_no=%L AND inbound_date=%L::date;',
              id, batch_no, business_date::text) AS rollback_sql
  FROM inbound_date_apply ORDER BY id;

WITH changed AS (
  UPDATE inv_batches b SET inbound_date=a.business_date, updated_at=now()
    FROM inbound_date_apply a
   WHERE b.id=a.id AND b.batch_no=a.batch_no AND b.inbound_date IS NULL
  RETURNING b.id
)
SELECT count(*) AS applied_rows FROM changed;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM inbound_date_apply a JOIN inv_batches b ON b.id=a.id
     WHERE b.inbound_date IS DISTINCT FROM a.business_date
  ) THEN RAISE EXCEPTION 'apply row assertion failed'; END IF;
END $$;
COMMIT;
