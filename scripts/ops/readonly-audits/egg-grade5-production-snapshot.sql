BEGIN TRANSACTION READ ONLY;
SELECT 'mst_products' AS source, to_jsonb(x) FROM mst_products x WHERE x.product_code IN ('EGG','PRD-EGG-5','PRD-EGG-GRADE_5');
SELECT 'product_master' AS source, to_jsonb(x) FROM product_master x WHERE x.product_code IN ('EGG','PRD-EGG-5','PRD-EGG-GRADE_5');
SELECT 'product_grades' AS source, to_jsonb(x) FROM product_grades x WHERE x.grade_code='GRADE_5';
SELECT 'packaging_specs' AS source, to_jsonb(x) FROM packaging_specs x WHERE x.spec_code='PKG_PACK_SPEC_3';
SELECT 'product_skus' AS source, to_jsonb(x) FROM product_skus x WHERE x.grade_code='GRADE_5' OR x.product_code IN ('EGG','PRD-EGG-5','PRD-EGG-GRADE_5');
SELECT tc.table_name,tc.constraint_name,tc.constraint_type,kcu.column_name
FROM information_schema.table_constraints tc LEFT JOIN information_schema.key_column_usage kcu USING (constraint_catalog,constraint_schema,constraint_name,table_name)
WHERE tc.table_name='product_skus' ORDER BY tc.constraint_name,kcu.ordinal_position;
SELECT indexname,indexdef FROM pg_indexes WHERE tablename='product_skus';
-- Q6 (20260911 ruling): CJ legacy registration relation evidence. The relation lives in
-- chanjet_master_mapping (erp_entity_type='SKU', erp_code=product_skus.sku_code) — see
-- chanjet-erp-master-business-review.service.ts applyCandidate() and gap-closure
-- PRODUCT_SKU_MODEL_REQUIRED (targetTable=product_skus). Minimal verifiable field set.
SELECT 'cj_sku_mapping_by_sku' AS source, m.erp_code, m.mapping_type, m.match_status, m.review_status,
       count(*) OVER (PARTITION BY m.erp_code) AS refs_per_sku
FROM chanjet_master_mapping m
WHERE m.erp_entity_type='SKU'
  AND m.erp_code IN ('SKU-5-LOOSE','SKU-5-TRAY30','SKU-5-TRAY36','SKU-5-BOX360',
                     'SKU-5-BOX720','SKU-5-GIFT12','SKU-5-GIFT24','EGG-GRADE_5-PKG_PACK_SPEC_3')
ORDER BY m.erp_code, m.id;
SELECT count(*) AS cj_sku_mappings_referencing_canonical
FROM chanjet_master_mapping
WHERE erp_entity_type='SKU' AND erp_code='EGG-GRADE_5-PKG_PACK_SPEC_3';
ROLLBACK;
