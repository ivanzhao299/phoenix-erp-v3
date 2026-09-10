\echo 'H_DEBUG_SOURCE_FULL_ROW'
SELECT row_to_json(s) AS source_row
  FROM pkg_source_batches s
 WHERE s.batch_code = 'SRC-20260910-H-DEBUG--R3VW';

\echo 'H_DEBUG_HOUSE_MASTER_FULL_ROW'
SELECT row_to_json(h) AS house_row
  FROM brd_houses h
 WHERE h.house_code = 'H-DEBUG-A01';

\echo 'H_DEBUG_HOUSE_SOURCE_HISTORY'
SELECT row_to_json(s) AS source_row
  FROM pkg_source_batches s
 WHERE s.house_code = 'H-DEBUG-A01'
 ORDER BY s.created_at, s.id;

\echo 'H_DEBUG_GRADING_DIRECT_AND_TIME_WINDOW'
WITH target AS (
  SELECT created_at, shift_id
    FROM pkg_source_batches
   WHERE batch_code = 'SRC-20260910-H-DEBUG--R3VW'
)
SELECT row_to_json(g) AS grading_row
  FROM pkg_grading_records g, target t
 WHERE g.source_batch_code = 'SRC-20260910-H-DEBUG--R3VW'
    OR g.shift_id = t.shift_id
    OR g.created_at BETWEEN t.created_at - interval '10 minutes'
                        AND t.created_at + interval '10 minutes'
 ORDER BY g.created_at, g.id;

\echo 'H_DEBUG_GRADING_SOURCE_LINKS'
SELECT row_to_json(x) AS link_row
  FROM (
    SELECT gsl.*, g.code AS grading_code, g.total_output, g.created_at AS grading_created_at,
           s.batch_code AS source_batch_code, s.total_qty, s.dirty_qty, s.cracked_qty,
           s.created_at AS source_created_at
      FROM pkg_grading_source_links gsl
      JOIN pkg_grading_records g ON g.id = gsl.grading_id
      JOIN pkg_source_batches s ON s.id = gsl.source_batch_id
     WHERE s.batch_code = 'SRC-20260910-H-DEBUG--R3VW'
        OR g.id = 77
     ORDER BY gsl.grading_id, gsl.source_batch_id
  ) x;

\echo 'H_DEBUG_OPERATION_LOGS'
WITH target AS (
  SELECT id, batch_code, created_at
    FROM pkg_source_batches
   WHERE batch_code = 'SRC-20260910-H-DEBUG--R3VW'
)
SELECT row_to_json(l) AS operation_log_row
  FROM sys_operation_logs l, target t
 WHERE l.created_at BETWEEN t.created_at - interval '15 minutes'
                        AND t.created_at + interval '15 minutes'
    OR l.biz_no IN ('SRC-20260910-H-DEBUG--R3VW', 'GRD-20260910-306173')
    OR l.biz_id IN (t.id, 77)
    OR COALESCE(l.before_data::text, '') LIKE '%H-DEBUG-A01%'
    OR COALESCE(l.after_data::text, '') LIKE '%H-DEBUG-A01%'
    OR COALESCE(l.before_data::text, '') LIKE '%SRC-20260910-H-DEBUG--R3VW%'
    OR COALESCE(l.after_data::text, '') LIKE '%SRC-20260910-H-DEBUG--R3VW%'
 ORDER BY l.created_at, l.id;

\echo 'H_DEBUG_CREATOR_USER'
WITH source_actor AS (
  SELECT NULLIF(to_jsonb(s)->>'created_by', '') AS created_by,
         NULLIF(to_jsonb(s)->>'received_by', '') AS received_by
    FROM pkg_source_batches s
   WHERE s.batch_code = 'SRC-20260910-H-DEBUG--R3VW'
), actor_ids AS (
  SELECT created_by AS actor_id FROM source_actor WHERE created_by IS NOT NULL
  UNION
  SELECT received_by FROM source_actor WHERE received_by IS NOT NULL
)
SELECT row_to_json(u) AS user_row
  FROM sys_user u
 WHERE u.user_id::text IN (SELECT actor_id FROM actor_ids);
