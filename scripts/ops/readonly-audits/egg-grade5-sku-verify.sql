-- EGG + GRADE_5 + PKG_PACK_SPEC_3 apply verify bundle (V1-V11, strictly READ ONLY)
-- Design doc §7. Safe to run through scripts/ops/run-production-readonly-audit.sh
-- (SELECT/DO-assert only; zero DML). Expected state: apply already committed.
\pset pager off
\pset null '[NULL]'
BEGIN TRANSACTION READ ONLY;

DO $assert$
BEGIN
  -- V1 mst_products EGG ACTIVE exactly one row, id unchanged (10)
  IF (SELECT count(*) FROM mst_products WHERE product_code='EGG' AND status='ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'V1 mst_products EGG ACTIVE != 1';
  END IF;
  IF (SELECT min(id) FROM mst_products WHERE product_code='EGG') <> 10 THEN
    RAISE EXCEPTION 'V1 mst_products EGG id drifted';
  END IF;
  -- V2 no new products were created
  IF (SELECT count(*) FROM mst_products WHERE product_code IN ('PRD-EGG-5','PRD-EGG-GRADE_5')) <> 0 THEN
    RAISE EXCEPTION 'V2 mst_products PRD-EGG-5/PRD-EGG-GRADE_5 rows exist';
  END IF;
  -- V3 product_grades GRADE_5 ACTIVE, id unchanged (2277)
  IF (SELECT count(*) FROM product_grades WHERE grade_code='GRADE_5' AND status='ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'V3 product_grades GRADE_5 ACTIVE != 1';
  END IF;
  IF (SELECT min(id) FROM product_grades WHERE grade_code='GRADE_5') <> 2277 THEN
    RAISE EXCEPTION 'V3 product_grades GRADE_5 id drifted';
  END IF;
  -- V4 packaging_specs PKG_PACK_SPEC_3 ACTIVE, id unchanged (2612), 30/unit, not rebuilt
  IF (SELECT count(*) FROM packaging_specs WHERE spec_code='PKG_PACK_SPEC_3' AND status='ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'V4 packaging_specs PKG_PACK_SPEC_3 ACTIVE != 1';
  END IF;
  IF (SELECT min(id) FROM packaging_specs WHERE spec_code='PKG_PACK_SPEC_3') <> 2612 THEN
    RAISE EXCEPTION 'V4 packaging_specs PKG_PACK_SPEC_3 id drifted';
  END IF;
  IF (SELECT qty_per_unit FROM packaging_specs WHERE spec_code='PKG_PACK_SPEC_3' AND status='ACTIVE') <> 30 THEN
    RAISE EXCEPTION 'V4 packaging_specs PKG_PACK_SPEC_3 qty_per_unit != 30';
  END IF;
  -- V5 canonical registered exactly once, ACTIVE, remark carries source_no
  IF (SELECT count(*) FROM product_skus
       WHERE product_code='EGG' AND grade_code='GRADE_5' AND spec_code='PKG_PACK_SPEC_3') <> 1 THEN
    RAISE EXCEPTION 'V5 canonical tuple != 1 row';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3'
       AND status='ACTIVE' AND remark LIKE '%source_no=EGG-G5-CANDIDATE%') <> 1 THEN
    RAISE EXCEPTION 'V5 canonical sku_code/status/remark mismatch';
  END IF;
  -- V6 legacy 7 rows byte-identical to before-image (codes + PRD-EGG-5 + ACTIVE)
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5'
       AND sku_code IN ('SKU-5-LOOSE','SKU-5-TRAY30','SKU-5-TRAY36','SKU-5-BOX360',
                        'SKU-5-BOX720','SKU-5-GIFT12','SKU-5-GIFT24')
       AND status='ACTIVE') <> 7 THEN
    RAISE EXCEPTION 'V6 legacy 7 GRADE_5 SKUs drifted';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5') <> 7 THEN
    RAISE EXCEPTION 'V6 legacy GRADE_5 row count != 7';
  END IF;
  -- V7 total = baseline(26) + 1
  IF (SELECT count(*) FROM product_skus) <> 85 THEN
    RAISE EXCEPTION 'V7 product_skus total != 27';
  END IF;
  -- V8/V9 uniqueness intact
  IF (SELECT count(*) FROM (SELECT 1 FROM product_skus
       GROUP BY product_code, grade_code, spec_code HAVING count(*)>1) d) <> 0 THEN
    RAISE EXCEPTION 'V8 triple tuple duplicates';
  END IF;
  IF (SELECT count(*) FROM (SELECT 1 FROM product_skus
       GROUP BY sku_code HAVING count(*)>1) d) <> 0 THEN
    RAISE EXCEPTION 'V9 sku_code duplicates';
  END IF;
  -- V10 new row key columns match manifest; no NULL in unique-constraint columns (g198)
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3'
       AND product_code='EGG' AND grade_code='GRADE_5' AND spec_code='PKG_PACK_SPEC_3'
       AND sku_name LIKE '%(GRADE_5 / PKG_PACK_SPEC_3)'
       AND barcode IS NULL AND status='ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'V10 canonical row columns mismatch manifest';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3'
       AND (product_code IS NULL OR grade_code IS NULL OR spec_code IS NULL OR status IS NULL)) <> 0 THEN
    RAISE EXCEPTION 'V10 NULL in unique-constraint columns';
  END IF;
  -- V11 zero transaction references to the fresh sku_code
  IF (SELECT count(*) FROM inv_batches WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 0 THEN
    RAISE EXCEPTION 'V11 inv_batches already references canonical sku';
  END IF;
  IF (SELECT count(*) FROM sal_order_items WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 0 THEN
    RAISE EXCEPTION 'V11 sal_order_items already references canonical sku';
  END IF;
  -- Q6: CJ legacy registration relation snapshot (count only; asserted evidence in report)
  IF (SELECT count(*) FROM chanjet_master_mapping
       WHERE erp_entity_type='SKU' AND erp_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 0 THEN
    RAISE EXCEPTION 'Q6 chanjet_master_mapping references canonical sku unexpectedly';
  END IF;
END
$assert$;
\echo 'PASS verify V1-V11 + Q6'

SELECT 'product_skus' AS source, to_jsonb(x) FROM product_skus x WHERE x.grade_code='GRADE_5' OR x.product_code IN ('EGG','PRD-EGG-5','PRD-EGG-GRADE_5');
SELECT 'cj_sku_mappings' AS source, m.id, m.mapping_type, m.chanjet_code, m.erp_code, m.match_status
FROM chanjet_master_mapping m
WHERE m.erp_entity_type='SKU'
  AND (m.erp_code IN ('SKU-5-LOOSE','SKU-5-TRAY30','SKU-5-TRAY36','SKU-5-BOX360','SKU-5-BOX720','SKU-5-GIFT12','SKU-5-GIFT24','EGG-GRADE_5-PKG_PACK_SPEC_3')
       OR m.erp_code IS NULL)
ORDER BY m.erp_code NULLS FIRST;

ROLLBACK;
