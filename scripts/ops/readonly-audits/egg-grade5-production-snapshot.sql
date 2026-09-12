BEGIN TRANSACTION READ ONLY;
-- Immutable session/database identity and timing evidence.
SELECT current_database() AS current_database, current_user AS current_user,
       inet_server_addr() AS inet_server_addr, inet_server_port() AS inet_server_port,
       current_setting('search_path') AS search_path, current_schema() AS current_schema,
       pg_backend_pid() AS pg_backend_pid, transaction_timestamp() AS tx_timestamp,
       statement_timestamp() AS statement_timestamp, clock_timestamp() AS clock_timestamp;
SELECT to_regclass('product_skus') AS product_skus_regclass,
       c.oid, c.relpages, c.reltuples, c.relnamespace::regnamespace AS relation_schema
FROM pg_class c WHERE c.oid = to_regclass('product_skus');
SELECT table_schema, table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_name='product_skus'
ORDER BY table_schema, ordinal_position;
SELECT 'pg_stat_activity' AS source, to_jsonb(a)
FROM pg_stat_activity a
WHERE a.datname=current_database()
ORDER BY a.pid;
SELECT 'mst_products' AS source, to_jsonb(x) FROM mst_products x WHERE x.product_code IN ('EGG','PRD-EGG-5','PRD-EGG-GRADE_5');
SELECT 'product_master' AS source, to_jsonb(x) FROM product_master x WHERE x.product_code IN ('EGG','PRD-EGG-5','PRD-EGG-GRADE_5');
SELECT 'product_grades' AS source, to_jsonb(x) FROM product_grades x WHERE x.grade_code='GRADE_5';
SELECT 'packaging_specs' AS source, to_jsonb(x) FROM packaging_specs x WHERE x.spec_code='PKG_PACK_SPEC_3';
SELECT 'product_skus' AS source, to_jsonb(x) FROM product_skus x;
SELECT 'product_skus_total' AS source, count(*) AS total FROM product_skus;
SELECT 'product_skus_distribution' AS source, product_code, grade_code, spec_code, status, count(*) AS row_count
FROM product_skus GROUP BY product_code, grade_code, spec_code, status
ORDER BY product_code, grade_code, spec_code, status;
SELECT 'canonical_rows' AS source, to_jsonb(x) FROM product_skus x
WHERE x.sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3';
SELECT 'legacy_rows' AS source, to_jsonb(x) FROM product_skus x
WHERE x.grade_code='GRADE_5' AND x.sku_code <> 'EGG-GRADE_5-PKG_PACK_SPEC_3';
SELECT 'other_sku_groups' AS source, product_code, grade_code, spec_code, status, count(*) AS row_count
FROM product_skus WHERE NOT (grade_code='GRADE_5' OR sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3')
GROUP BY product_code, grade_code, spec_code, status
ORDER BY product_code, grade_code, spec_code, status;
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
