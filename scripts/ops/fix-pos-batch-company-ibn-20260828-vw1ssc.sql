\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  batch_count integer;
  ledger_count integer;
BEGIN
  SELECT count(*) INTO batch_count
    FROM inv_batches b
    JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code
   WHERE b.batch_no='IBN-20260828-VW1SSC'
     AND b.sku_code='CJ-EGG-8E82312ECAD7'
     AND b.warehouse_code='ST_LAO_XINGCHI_HS_001_SALES'
     AND b.company_code='ALL'
     AND w.company_code='COMP-LAO-XINGCHI'
     AND b.status='AVAILABLE'
     AND b.qty_available=1000.000;
  IF batch_count <> 1 THEN
    RAISE EXCEPTION 'precondition failed: expected exactly one unchanged target batch, got %', batch_count;
  END IF;

  SELECT count(*) INTO ledger_count
    FROM inv_ledger
   WHERE batch_no='IBN-20260828-VW1SSC'
     AND ref_no='INB-20260828-9JPE'
     AND company_code='ALL'
     AND qty_change=1000.000;
  IF ledger_count <> 1 THEN
    RAISE EXCEPTION 'precondition failed: expected exactly one unchanged target ledger row, got %', ledger_count;
  END IF;
END $$;

UPDATE inv_batches
   SET company_code='COMP-LAO-XINGCHI', updated_at=NOW()
 WHERE batch_no='IBN-20260828-VW1SSC'
   AND company_code='ALL';

UPDATE inv_ledger
   SET company_code='COMP-LAO-XINGCHI'
 WHERE batch_no='IBN-20260828-VW1SSC'
   AND ref_no='INB-20260828-9JPE'
   AND company_code='ALL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM inv_batches
     WHERE batch_no='IBN-20260828-VW1SSC'
       AND company_code='COMP-LAO-XINGCHI'
       AND status='AVAILABLE'
       AND qty_available=1000.000
  ) THEN
    RAISE EXCEPTION 'postcondition failed: target batch was not corrected';
  END IF;
  IF EXISTS (
    SELECT 1 FROM inv_batches b
    JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code
     WHERE b.batch_no='IBN-20260828-VW1SSC'
       AND b.company_code IS DISTINCT FROM w.company_code
  ) THEN
    RAISE EXCEPTION 'postcondition failed: batch and warehouse company still differ';
  END IF;
END $$;

COMMIT;
