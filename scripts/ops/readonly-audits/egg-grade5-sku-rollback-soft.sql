-- SOFT rollback runbook: DISABLE the canonical EGG GRADE_5 SKU by source_no (never touches legacy).
-- Gate-hardened, single transaction. Only for use after an apply that committed but failed verification.
-- Usage: psql -X -v ON_ERROR_STOP=1 -v run_id=<run> -f scripts/ops/readonly-audits/egg-grade5-sku-rollback-soft.sql
\pset pager off
\pset null '[NULL]'

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- gates: canonical row exists exactly once, ACTIVE, carrying our source_no; legacy frozen
DO $assert$
BEGIN
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 1 THEN
    RAISE EXCEPTION 'SR-G1 canonical sku row count != 1';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3'
       AND status='ACTIVE' AND remark LIKE '%source_no=EGG-G5-CANDIDATE%') <> 1 THEN
    RAISE EXCEPTION 'SR-G2 canonical row not ACTIVE or missing source_no (not ours?)';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5'
       AND status='ACTIVE') <> 7 THEN
    RAISE EXCEPTION 'SR-G3 legacy 7 rows not intact — ABORT';
  END IF;
  IF (SELECT count(*) FROM product_skus) <> 85 THEN
    RAISE EXCEPTION 'SR-G4 unexpected table total (expected 27)';
  END IF;
END
$assert$;

UPDATE product_skus
   SET status='DISABLED', updated_at=NOW(),
       remark = remark || ' soft_rollback run=' || :'run_id'
 WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3'
   AND remark LIKE '%source_no=EGG-G5-CANDIDATE%'
   AND status='ACTIVE';

DO $assert$
BEGIN
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3'
       AND status='DISABLED' AND remark LIKE '%soft_rollback run=%') <> 1 THEN
    RAISE EXCEPTION 'SR-P1 soft rollback did not disable exactly 1 row';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5'
       AND status='ACTIVE') <> 7 THEN
    RAISE EXCEPTION 'SR-P2 legacy rows changed';
  END IF;
  IF (SELECT count(*) FROM product_skus) <> 85 THEN
    RAISE EXCEPTION 'SR-P3 total changed (soft rollback must not delete)';
  END IF;
END
$assert$;

SELECT sku_code, product_code, grade_code, spec_code, status, remark, updated_at
FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3';

COMMIT;
\echo 'SOFT_ROLLBACK_COMMITTED run=' :'run_id'
