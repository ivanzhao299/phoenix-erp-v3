\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  batch_count integer;
  ledger_count integer;
BEGIN
  SELECT count(*) INTO batch_count
    FROM inv_batches
   WHERE batch_no='IBN-20260828-VW1SSC'
     AND sku_code='CJ-EGG-8E82312ECAD7'
     AND warehouse_code='ST_LAO_XINGCHI_HS_001_SALES'
     AND company_code='COMP-LAO-XINGCHI'
     AND status='AVAILABLE'
     AND qty_available=1000.000;
  SELECT count(*) INTO ledger_count
    FROM inv_ledger
   WHERE batch_no='IBN-20260828-VW1SSC'
     AND ref_no='INB-20260828-9JPE'
     AND company_code='COMP-LAO-XINGCHI'
     AND qty_change=1000.000;
  IF batch_count <> 1 OR ledger_count <> 1 THEN
    RAISE EXCEPTION 'rollback precondition failed: batch=%, ledger=%; expected 1 each', batch_count, ledger_count;
  END IF;
END $$;

WITH changed AS (
  UPDATE inv_batches
     SET company_code='ALL'
   WHERE batch_no='IBN-20260828-VW1SSC'
     AND sku_code='CJ-EGG-8E82312ECAD7'
     AND warehouse_code='ST_LAO_XINGCHI_HS_001_SALES'
     AND company_code='COMP-LAO-XINGCHI'
     AND status='AVAILABLE'
     AND qty_available=1000.000
  RETURNING batch_no, company_code, status, qty_available
)
SELECT * FROM changed;

WITH changed AS (
  UPDATE inv_ledger
     SET company_code='ALL'
   WHERE batch_no='IBN-20260828-VW1SSC'
     AND ref_no='INB-20260828-9JPE'
     AND company_code='COMP-LAO-XINGCHI'
     AND qty_change=1000.000
  RETURNING batch_no, ref_no, company_code, qty_change
)
SELECT * FROM changed;

COMMIT;
