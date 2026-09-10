\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN RAISE EXCEPTION 'verify must be read only'; END IF;
  IF (SELECT COUNT(*) FROM pkg_grading_records WHERE id IN (73,74,77) AND status='VOID'
       AND voided_by='controlled-repair-20260910' AND void_reason IS NOT NULL AND voided_at IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'void audit state mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM pkg_grading_records WHERE id IN (71,72,75,76) AND status <> 'ACTIVE') THEN
    RAISE EXCEPTION 'legal grading row changed';
  END IF;
  IF (SELECT SUM(total_qty-dirty_qty-cracked_qty) FROM pkg_source_batches WHERE shift_id=55) <> 300
     OR (SELECT SUM(total_output) FROM pkg_grading_records WHERE shift_id=55 AND status='ACTIVE') <> 300 THEN
    RAISE EXCEPTION 'shift 55 not reconciled';
  END IF;
  IF (SELECT SUM(total_qty-dirty_qty-cracked_qty) FROM pkg_source_batches WHERE shift_id=56) <> 196
     OR (SELECT SUM(total_output) FROM pkg_grading_records WHERE shift_id=56 AND status='ACTIVE') <> 196 THEN
    RAISE EXCEPTION 'shift 56 not reconciled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pkg_packing_records WHERE id=31 AND total_boxes=10 AND total_eggs=300
    AND grading_code='GRD-20260909-265670' AND grading_codes_json='["GRD-20260909-265670"]'::jsonb) THEN
    RAISE EXCEPTION 'packing correction verification failed';
  END IF;
  IF (SELECT COUNT(*) FROM pkg_audit_logs WHERE entity_type='GRADING_RECORD' AND action='VOID_TECHNICAL_DUPLICATE'
      AND entity_id IN ('GRD-20260909-267637','GRD-20260909-269652','GRD-20260910-306173')) <> 3 THEN
    RAISE EXCEPTION 'grading audit log mismatch';
  END IF;
END $$;

SELECT 'VERIFY_PASS' AS result,
  (SELECT SUM(total_output) FROM pkg_grading_records WHERE shift_id=55 AND status='ACTIVE') AS shift55_legal,
  (SELECT SUM(total_output) FROM pkg_grading_records WHERE shift_id=56 AND status='ACTIVE') AS shift56_legal,
  (SELECT md5(COALESCE(string_agg(md5(row_to_json(b)::text),'' ORDER BY b.batch_no),'')) FROM inv_batches b) AS inv_batches_hash,
  (SELECT md5(COALESCE(string_agg(md5(row_to_json(l)::text),'' ORDER BY l.id),'')) FROM inv_ledger l) AS inv_ledger_hash;
ROLLBACK;
