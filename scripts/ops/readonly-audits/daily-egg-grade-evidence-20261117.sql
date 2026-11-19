-- Exact current-state evidence for the two HOLD groups. Never infer a grade
-- allocation from total eggs or change a report/inventory row. updated_at is
-- only the current timestamp, not a recovered historical before-image.
SELECT 'DAILY_EGG_GRADE_CURRENT_20261117' AS section,
       jsonb_build_object(
         'id', d.id, 'log_date', d.log_date, 'house_code', d.house_code,
         'shift', to_jsonb(d)->'shift', 'flock_no', to_jsonb(d)->'flock_no',
         'farm_code', to_jsonb(d)->'farm_code', 'company_code', to_jsonb(d)->'company_code',
         'eggs_produced', to_jsonb(d)->'eggs_produced',
         'eggs_by_grade', CASE WHEN octet_length(d.eggs_by_grade::text) <= 32768 THEN d.eggs_by_grade ELSE NULL END,
         'grade_json_bytes', octet_length(d.eggs_by_grade::text),
         'created_at', to_jsonb(d)->'created_at', 'updated_at', to_jsonb(d)->'updated_at'
       ) AS evidence
  FROM brd_daily_logs d
 WHERE d.log_date = DATE '2026-11-17' AND d.house_code = 'HOUSE_MS_01'
 ORDER BY d.id LIMIT 20;

SELECT 'DAILY_EGG_GRADE_CURRENT_COUNT_20261117' AS section, COUNT(*) AS matching_rows
  FROM brd_daily_logs
 WHERE log_date = DATE '2026-11-17' AND house_code = 'HOUSE_MS_01';

SELECT 'DAILY_EGG_GRADE_BATCH_CURRENT_20261117' AS section,
       b.id, b.batch_no, b.company_code, b.source_no, b.source_type,
       b.egg_date, b.grade_code_std, b.quality_grade, b.qty, b.qty_available,
       b.status, b.warehouse_code, b.location_code, b.sku_code, b.product_code,
       to_jsonb(b)->'store_code' AS store_code, to_jsonb(b)->'unit' AS unit,
       to_jsonb(b)->'spec_code' AS spec_code, to_jsonb(b)->'packaging_spec' AS packaging_spec,
       to_jsonb(b)->'base_quantity_version' AS base_quantity_version,
       to_jsonb(b) ? 'unit_cost' AS unit_cost_column_exists, to_jsonb(b)->'unit_cost' AS unit_cost,
       b.created_at, b.updated_at
  FROM inv_batches b
 WHERE b.company_code = 'COMP-LAO-AGRI' AND b.egg_date = DATE '2026-11-17'
   AND b.collection_batch_ref = 'HOUSE-HOUSE_MS_01'
   AND b.source_type = 'TEMP_PRODUCTION'
   AND b.source_no = 'DAILY-2026-11-17-HOUSE_MS_01-4c5f2ca'
   AND COALESCE(b.grade_code_std, b.quality_grade) IN ('GRADE_4', 'GRADE_5')
   AND b.id IN (413, 415)
 ORDER BY b.id LIMIT 20;

SELECT 'DAILY_EGG_REVERSAL_DICT_20261117' AS section, wanted.code,
       d.dict_code IS NOT NULL AS found, to_jsonb(d)->'status' AS status,
       to_jsonb(d)->'dict_value' AS dict_value,
       to_jsonb(d)->'dict_label_zh' AS label_zh, to_jsonb(d)->'dict_label_lo' AS label_lo,
       to_jsonb(d)->'dict_label_en' AS label_en
  FROM (VALUES ('TEMP_PRODUCTION_REVERSAL'), ('STOCKTAKE_DOWN')) wanted(code)
  LEFT JOIN sys_dict d ON d.dict_type = 'INV_LEDGER_CHANGE_TYPE' AND d.dict_code = wanted.code
 ORDER BY wanted.code LIMIT 10;

SELECT 'DAILY_EGG_LEDGER_CHANGE_TYPE_COLUMN_20261117' AS section,
       a.attname, format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull,
       pg_get_expr(def.adbin, def.adrelid) AS default_expression
  FROM pg_attribute a
  LEFT JOIN pg_attrdef def ON def.adrelid = a.attrelid AND def.adnum = a.attnum
 WHERE a.attrelid = 'public.inv_ledger'::regclass AND a.attname = 'change_type' AND NOT a.attisdropped;

SELECT 'DAILY_EGG_LEDGER_CHANGE_TYPE_CHECK_20261117' AS section,
       c.conname, c.convalidated,
       CASE WHEN octet_length(pg_get_constraintdef(c.oid)) <= 8192 THEN pg_get_constraintdef(c.oid) ELSE 'OVERSIZE_CHECK_HOLD' END AS definition
  FROM pg_constraint c
 WHERE c.conrelid = 'public.inv_ledger'::regclass AND c.contype = 'c'
   AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) AND a.attname = 'change_type')
 ORDER BY c.conname LIMIT 16;

SELECT 'DAILY_EGG_ORIGINAL_LEDGER_DIMENSIONS_20261117' AS section,
       l.id, l.batch_no, l.change_type, l.qty_change, l.log_date, l.ref_no,
       l.company_code, l.warehouse_code, l.location_code, l.sku_code, l.quality_grade,
       to_jsonb(l)->'store_code' AS store_code, to_jsonb(l)->'unit' AS unit,
       to_jsonb(l)->'product_code' AS product_code, to_jsonb(l)->'business_type' AS business_type,
       to_jsonb(l) ? 'cost_change' AS cost_change_column_exists, to_jsonb(l)->'cost_change' AS cost_change,
       to_jsonb(l) ? 'unit_cost' AS unit_cost_column_exists, to_jsonb(l)->'unit_cost' AS unit_cost
  FROM inv_ledger l
  JOIN (VALUES (649, 'EGG-20261117-00005'), (651, 'EGG-20261117-00007')) wanted(id, batch_no)
    ON l.id = wanted.id AND l.batch_no = wanted.batch_no
 WHERE l.company_code = 'COMP-LAO-AGRI' AND l.log_date = DATE '2026-11-17'
   AND l.ref_no = 'DAILY-2026-11-17-HOUSE_MS_01-4c5f2ca'
 ORDER BY l.id LIMIT 2;

SELECT 'DAILY_EGG_SAME_SOURCE_GRADE_SUMMARY_20261117' AS section,
       COALESCE(b.grade_code_std, b.quality_grade) AS grade,
       COUNT(*) AS batch_count, SUM(b.qty) AS qty, SUM(b.qty_available) AS qty_available
  FROM inv_batches b
 WHERE b.company_code = 'COMP-LAO-AGRI' AND b.egg_date = DATE '2026-11-17'
   AND b.source_type = 'TEMP_PRODUCTION' AND b.collection_batch_ref = 'HOUSE-HOUSE_MS_01'
   AND b.source_no = 'DAILY-2026-11-17-HOUSE_MS_01-4c5f2ca'
 GROUP BY COALESCE(b.grade_code_std, b.quality_grade)
 ORDER BY grade LIMIT 20;
