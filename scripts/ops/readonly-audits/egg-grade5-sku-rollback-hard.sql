-- HARD rollback runbook: DELETE the canonical row, gated on ZERO transaction references.
-- Last resort only (soft rollback is preferred). Never touches legacy rows.
-- Usage: psql -X -v ON_ERROR_STOP=1 -v run_id=<run> -f scripts/ops/readonly-audits/egg-grade5-sku-rollback-hard.sql
\pset pager off
\pset null '[NULL]'

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- gates: exactly one row of ours; ZERO references anywhere; legacy frozen
DO $assert$
BEGIN
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 1 THEN
    RAISE EXCEPTION 'HR-G1 canonical sku row count != 1';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3'
       AND remark LIKE '%source_no=EGG-G5-CANDIDATE%') <> 1 THEN
    RAISE EXCEPTION 'HR-G2 canonical row missing source_no (not ours — ABORT)';
  END IF;
  IF (SELECT count(*) FROM inv_batches WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 0 THEN
    RAISE EXCEPTION 'HR-G3 inv_batches references canonical sku — hard rollback forbidden';
  END IF;
  IF (SELECT count(*) FROM sal_order_items WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 0 THEN
    RAISE EXCEPTION 'HR-G4 sal_order_items references canonical sku — hard rollback forbidden';
  END IF;
  IF (SELECT count(*) FROM chanjet_master_mapping WHERE erp_entity_type='SKU'
       AND erp_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 0 THEN
    RAISE EXCEPTION 'HR-G5 chanjet_master_mapping references canonical sku — hard rollback forbidden';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5') <> 7 THEN
    RAISE EXCEPTION 'HR-G6 legacy rows not intact';
  END IF;
END
$assert$;

DELETE FROM product_skus
 WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3'
   AND remark LIKE '%source_no=EGG-G5-CANDIDATE%';

DO $assert$
BEGIN
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 0 THEN
    RAISE EXCEPTION 'HR-P1 canonical row still present';
  END IF;
  IF (SELECT count(*) FROM product_skus) <> 26 THEN
    RAISE EXCEPTION 'HR-P2 total did not return to baseline 26';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5') <> 7 THEN
    RAISE EXCEPTION 'HR-P3 legacy rows changed';
  END IF;
END
$assert$;

COMMIT;
\echo 'HARD_ROLLBACK_COMMITTED run=' :'run_id'
