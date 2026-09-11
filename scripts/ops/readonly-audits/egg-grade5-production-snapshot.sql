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
ROLLBACK;
