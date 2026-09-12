-- EGG + GRADE_5 + PKG_PACK_SPEC_3 canonical SKU apply bundle (Q1 batch 1 — exactly ONE INSERT)
-- Design: docs/ops/egg-grade5-sku-apply-design-review-20260911.md §3 + 20260911 rulings (Q1–Q8)
-- DRY-RUN variant: identical assertions + INSERT, but ends ROLLBACK (zero commits).
--   psql -X -v ON_ERROR_STOP=1 -v run_id=<run> -v manifest_sha256=<64hex> \
--        -f scripts/ops/readonly-audits/egg-grade5-sku-apply-dryrun.sql
-- Commit variant: egg-grade5-sku-apply.sql
-- Hard boundaries: ONE INSERT only; no UPDATE/DELETE of pre-existing rows; legacy 7
-- GRADE_5 SKUs (PRD-EGG-5) untouched; triple-unique-index conflict must ERROR (fail-closed);
-- only sku_code is an ON CONFLICT DO NOTHING target.
\pset pager off
\pset null '[NULL]'

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── ① six pre-assertions (same transaction = consistent snapshot; DO $assert$ style) ──
DO $assert$
BEGIN
  -- A1 parent product registered & ACTIVE
  IF (SELECT count(*) FROM mst_products WHERE product_code='EGG' AND status='ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'A1 mst_products EGG ACTIVE != 1';
  END IF;
  -- A2 grade registered & ACTIVE
  IF (SELECT count(*) FROM product_grades WHERE grade_code='GRADE_5' AND status='ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'A2 product_grades GRADE_5 ACTIVE != 1';
  END IF;
  -- A3 spec registered & ACTIVE (reused id=2612, never rebuilt)
  IF (SELECT count(*) FROM packaging_specs WHERE spec_code='PKG_PACK_SPEC_3' AND status='ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'A3 packaging_specs PKG_PACK_SPEC_3 ACTIVE != 1';
  END IF;
  -- A4 canonical tuple MUST be unregistered (Q3 ruling: re-apply fails, no ALREADY_APPLIED)
  IF (SELECT count(*) FROM product_skus
       WHERE product_code='EGG' AND grade_code='GRADE_5' AND spec_code='PKG_PACK_SPEC_3') <> 0 THEN
    RAISE EXCEPTION 'A4 canonical EGG/GRADE_5/PKG_PACK_SPEC_3 already registered (re-apply forbidden; run verify)';
  END IF;
  -- A5 legacy baseline frozen
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5') <> 7 THEN
    RAISE EXCEPTION 'A5 legacy GRADE_5 SKU baseline drifted (expected 7)';
  END IF;
  -- A6 whole-table baseline frozen (guards concurrent writes)
  IF (SELECT count(*) FROM product_skus) <> 26 THEN
    RAISE EXCEPTION 'A6 product_skus total baseline drifted (expected 26)';
  END IF;
END
$assert$;
\echo 'PASS pre-assertions A1-A6'

-- baseline evidence for the apply artifact (audit chain)
SELECT (SELECT count(*) FROM mst_products WHERE product_code='EGG' AND status='ACTIVE') AS mst_egg_active,
       (SELECT count(*) FROM product_grades WHERE grade_code='GRADE_5' AND status='ACTIVE') AS grade5_active,
       (SELECT count(*) FROM packaging_specs WHERE spec_code='PKG_PACK_SPEC_3' AND status='ACTIVE') AS spec3_active,
       (SELECT count(*) FROM product_skus WHERE product_code='EGG' AND grade_code='GRADE_5' AND spec_code='PKG_PACK_SPEC_3') AS canonical_before,
       (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5') AS legacy_g5,
       (SELECT count(*) FROM product_skus) AS total_skus_before;

-- ── ② the single INSERT ─────────────────────────────────────────────────────
-- sku_code per generateSkuCode() (product-master.service.ts L312): EGG-GRADE_5-PKG_PACK_SPEC_3
-- product_name / sku_name mirror createSku() semantics (product_name_zh fallback product_name/'鸡蛋')
-- remark = audit chain (Q4/Q8): source_no=EGG-G5-CANDIDATE + run_id + manifest sha256
INSERT INTO product_skus
  (sku_code, product_code, product_name, grade_code, spec_code, sku_name, barcode, status, remark, created_at, updated_at)
VALUES
  ('EGG-GRADE_5-PKG_PACK_SPEC_3', 'EGG',
   (SELECT COALESCE(NULLIF(p.product_name_zh,''), p.product_name, '鸡蛋')
      FROM mst_products p WHERE p.product_code='EGG' AND p.status='ACTIVE'),
   'GRADE_5', 'PKG_PACK_SPEC_3',
   (SELECT COALESCE(NULLIF(p.product_name_zh,''), p.product_name, '鸡蛋') || ' (GRADE_5 / PKG_PACK_SPEC_3)'
      FROM mst_products p WHERE p.product_code='EGG' AND p.status='ACTIVE'),
   NULL, 'ACTIVE',
   'apply run=' || :'run_id' || ' manifest=' || :'manifest_sha256' || ' source_no=EGG-G5-CANDIDATE',
   NOW(), NOW())
ON CONFLICT (sku_code) DO NOTHING;

-- ── ③ post-assertions (still inside the transaction) ───────────────────────
DO $assert$
BEGIN
  -- P0 exactly one row inserted (A4 proved 0 before, so anything but 1 is a conflict/no-insert)
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 1 THEN
    RAISE EXCEPTION 'P0 inserted rows != 1 (sku_code conflict or parent missing)';
  END IF;
  IF (SELECT count(*) FROM product_skus
       WHERE product_code='EGG' AND grade_code='GRADE_5' AND spec_code='PKG_PACK_SPEC_3') <> 1 THEN
    RAISE EXCEPTION 'P1 canonical after != 1';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5'
       AND status='ACTIVE') <> 7 THEN
    RAISE EXCEPTION 'P2 legacy 7 rows changed';
  END IF;
  IF (SELECT count(*) FROM product_skus) <> 27 THEN
    RAISE EXCEPTION 'P3 product_skus total after != 27';
  END IF;
  IF (SELECT count(*) FROM (SELECT 1 FROM product_skus
       GROUP BY product_code, grade_code, spec_code HAVING count(*) > 1) d) <> 0 THEN
    RAISE EXCEPTION 'P4 triple-unique-index violation';
  END IF;
  IF (SELECT count(*) FROM (SELECT 1 FROM product_skus
       GROUP BY sku_code HAVING count(*) > 1) d) <> 0 THEN
    RAISE EXCEPTION 'P5 sku_code duplicate';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3'
       AND (sku_code IS NULL OR product_code IS NULL OR grade_code IS NULL OR spec_code IS NULL
            OR status IS NULL)) <> 0 THEN
    RAISE EXCEPTION 'P6 canonical row has NULL in unique-constraint columns (g198)';
  END IF;
  -- Q6: CJ legacy registration relation must not yet reference the canonical code
  IF (SELECT count(*) FROM chanjet_master_mapping
       WHERE erp_entity_type='SKU' AND erp_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 0 THEN
    RAISE EXCEPTION 'P7 chanjet_master_mapping already references canonical sku';
  END IF;
END
$assert$;
\echo 'PASS post-assertions P0-P7'

-- row evidence for the apply artifact (V5/V10 payload)
SELECT sku_code, product_code, product_name, grade_code, spec_code, sku_name, barcode, status, remark, created_at, updated_at
FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3';

ROLLBACK;
\echo 'DRY_RUN_ROLLED_BACK run=' :'run_id' ' manifest=' :'manifest_sha256'
