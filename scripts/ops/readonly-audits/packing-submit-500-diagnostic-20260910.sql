\pset pager off
\x on
BEGIN TRANSACTION READ ONLY;

SELECT 'PACKAGING_HTTP_ERRORS_48H' AS section,
       id, created_at, error_type, http_status, request_method, request_path,
       error_message, pg_error_code, username
  FROM sys_error_logs
 WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
   AND (request_path ILIKE '%packaging%' OR error_message ILIKE '%pack%')
 ORDER BY created_at DESC LIMIT 200;

SELECT 'PACKING_SCHEMA' AS section, c.column_name, c.data_type,
       c.is_nullable, c.column_default
  FROM information_schema.columns c
 WHERE c.table_schema=current_schema() AND c.table_name='pkg_packing_records'
 ORDER BY c.ordinal_position;

SELECT 'PACKING_CONSTRAINTS' AS section, con.conname,
       pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
 WHERE con.conrelid='pkg_packing_records'::regclass
 ORDER BY con.conname;

SELECT 'RECENT_SOURCE_LINKS' AS section, gr.id AS grading_id, gr.code,
       gr.shift_id AS grading_shift_id, gr.status, gr.total_output,
       gsl.source_batch_id, gsl.input_qty, psb.shift_id AS source_shift_id,
       psb.batch_status, psb.house_code
  FROM pkg_grading_records gr
  LEFT JOIN pkg_grading_source_links gsl ON gsl.grading_id=gr.id
  LEFT JOIN pkg_source_batches psb ON psb.id=gsl.source_batch_id
 WHERE gr.created_at >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
 ORDER BY gr.created_at DESC, gsl.source_batch_id;

SELECT 'ACTIVE_PACKING_OWNERS' AS section, gr.code, gr.shift_id,
       BOOL_OR(psb.shift_id=gr.shift_id) AS has_source_in_own_shift,
       COUNT(gsl.source_batch_id)::int AS source_link_count
  FROM pkg_grading_records gr
  LEFT JOIN pkg_grading_source_links gsl ON gsl.grading_id=gr.id
  LEFT JOIN pkg_source_batches psb ON psb.id=gsl.source_batch_id
 WHERE gr.status='ACTIVE'
 GROUP BY gr.code, gr.shift_id
 ORDER BY gr.shift_id DESC NULLS LAST, gr.code;

ROLLBACK;
