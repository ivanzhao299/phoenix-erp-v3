-- Gate 1: targeted production read-only evidence for grading duplicate-submit governance.
-- The runner enforces connection/transaction read-only mode and appends ROLLBACK.

SELECT 'SOURCE_BATCH_COLUMNS' AS section;
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'pkg_source_batches'
 ORDER BY ordinal_position;

SELECT 'SOURCE_BATCH_ROWS' AS section;
SELECT id, batch_code, shift_id, house_code,
       total_qty AS total, dirty_qty AS dirty, cracked_qty AS cracked,
       received_qty AS received, created_at
  FROM pkg_source_batches
 WHERE shift_id IN (54, 55, 56)
    OR (created_at >= TIMESTAMP '2026-09-09 00:00:00'
        AND created_at < TIMESTAMP '2026-09-11 00:00:00')
 ORDER BY shift_id NULLS LAST, created_at, id;

SELECT 'GRADING_ROWS' AS section;
SELECT id, code, shift_id, source_batch_code, outputs_json, total_output, created_at
  FROM pkg_grading_records
 WHERE shift_id IN (54, 55, 56)
    OR code IN ('GRD-20260909-136133', 'GRD-20260909-265670',
                'GRD-20260909-267637', 'GRD-20260909-269652')
    OR (created_at >= TIMESTAMP '2026-09-09 00:00:00'
        AND created_at < TIMESTAMP '2026-09-11 00:00:00')
 ORDER BY shift_id NULLS LAST, created_at, id;

SELECT 'TARGET_GRADING_OWNERSHIP' AS section;
SELECT gr.id, gr.code, gr.shift_id, gr.source_batch_code,
       gr.outputs_json, gr.total_output, gr.created_at,
       COALESCE(array_agg(DISTINCT pr.shift_id ORDER BY pr.shift_id)
         FILTER (WHERE pr.id IS NOT NULL), ARRAY[]::integer[]) AS packing_shift_ids,
       COALESCE(array_agg(DISTINCT pr.code ORDER BY pr.code)
         FILTER (WHERE pr.id IS NOT NULL), ARRAY[]::varchar[]) AS packing_codes
  FROM pkg_grading_records gr
  LEFT JOIN pkg_packing_records pr
    ON pr.grading_code = gr.code
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(pr.grading_codes_json) AS gc(code)
       WHERE gc.code = gr.code
    )
 WHERE gr.code IN ('GRD-20260909-136133', 'GRD-20260909-265670',
                   'GRD-20260909-267637', 'GRD-20260909-269652')
 GROUP BY gr.id, gr.code, gr.shift_id, gr.source_batch_code,
          gr.outputs_json, gr.total_output, gr.created_at
 ORDER BY gr.created_at, gr.id;

SELECT 'SHIFT_THREE_STAGE_RECONCILIATION' AS section;
WITH shifts AS (
  SELECT unnest(ARRAY[54, 55, 56])::integer AS shift_id
), source AS (
  SELECT shift_id,
         COUNT(*)::integer AS source_rows,
         SUM(total_qty - dirty_qty - cracked_qty)::integer AS net_collected
    FROM pkg_source_batches
   WHERE shift_id IN (54, 55, 56)
   GROUP BY shift_id
), grading AS (
  SELECT shift_id, COUNT(*)::integer AS grading_rows,
         SUM(total_output)::integer AS graded_total
    FROM pkg_grading_records
   WHERE shift_id IN (54, 55, 56)
   GROUP BY shift_id
), packing AS (
  SELECT shift_id, COUNT(*)::integer AS packing_rows,
         SUM(total_eggs)::integer AS packed_total
    FROM pkg_packing_records
   WHERE shift_id IN (54, 55, 56)
   GROUP BY shift_id
)
SELECT s.shift_id,
       COALESCE(src.source_rows, 0) AS source_rows,
       COALESCE(src.net_collected, 0) AS net_collected,
       COALESCE(g.grading_rows, 0) AS grading_rows,
       COALESCE(g.graded_total, 0) AS graded_total,
       COALESCE(p.packing_rows, 0) AS packing_rows,
       COALESCE(p.packed_total, 0) AS packed_total,
       COALESCE(src.net_collected, 0) - COALESCE(g.graded_total, 0) AS source_minus_grading,
       COALESCE(g.graded_total, 0) - COALESCE(p.packed_total, 0) AS grading_minus_packing
  FROM shifts s
  LEFT JOIN source src USING (shift_id)
  LEFT JOIN grading g USING (shift_id)
  LEFT JOIN packing p USING (shift_id)
 ORDER BY s.shift_id;

SELECT 'PACKING_ROWS' AS section;
SELECT id, code, shift_id, grading_code, grading_codes_json,
       total_boxes, total_eggs, created_at
  FROM pkg_packing_records
 WHERE shift_id IN (54, 55, 56)
 ORDER BY shift_id, created_at, id;
