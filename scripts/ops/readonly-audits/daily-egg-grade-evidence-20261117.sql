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
       b.created_at, b.updated_at
  FROM inv_batches b
 WHERE b.company_code = 'COMP-LAO-AGRI' AND b.egg_date = DATE '2026-11-17'
   AND b.collection_batch_ref = 'HOUSE-HOUSE_MS_01'
   AND b.source_type = 'TEMP_PRODUCTION'
   AND b.source_no = 'DAILY-2026-11-17-HOUSE_MS_01-4c5f2ca'
   AND COALESCE(b.grade_code_std, b.quality_grade) IN ('GRADE_4', 'GRADE_5')
 ORDER BY b.id LIMIT 20;
