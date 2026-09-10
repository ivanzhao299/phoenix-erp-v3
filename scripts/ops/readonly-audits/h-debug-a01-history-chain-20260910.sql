\pset pager off
\x off
BEGIN TRANSACTION READ ONLY;

SELECT 'REVISION_AND_TARGETS' AS section,
       current_database() AS database_name,
       CURRENT_TIMESTAMP AS audited_at;

WITH target AS (
  SELECT s.id, s.batch_code, s.shift_id, s.house_code, s.production_date,
         s.total_qty, s.received_qty, s.dirty_qty, s.cracked_qty,
         s.batch_status, s.created_at, s.updated_at,
         ws.shift_code, ws.status AS shift_status,
         GREATEST(COALESCE(NULLIF(s.total_qty, 0), NULLIF(s.received_qty, 0), 0)
           - COALESCE(s.dirty_qty, 0) - COALESCE(s.cracked_qty, 0), 0)::int AS net_qty
    FROM pkg_source_batches s
    LEFT JOIN pkg_work_shifts ws ON ws.id = s.shift_id
   WHERE s.id IN (16, 34, 38)
)
SELECT 'SOURCE_CHAIN' AS section, * FROM target ORDER BY id;

WITH target AS (
  SELECT id, batch_code, shift_id FROM pkg_source_batches WHERE id IN (16, 34, 38)
), grading AS (
  SELECT DISTINCT t.id AS source_id, t.batch_code, t.shift_id AS source_shift_id,
         g.id AS grading_id, g.code AS grading_code, g.shift_id AS grading_shift_id,
         g.source_batch_code, g.status AS grading_status, g.outputs_json,
         g.total_output, gsl.input_qty, g.created_at
    FROM target t
    LEFT JOIN pkg_grading_source_links gsl ON gsl.source_batch_id = t.id
    LEFT JOIN pkg_grading_records g
      ON g.id = gsl.grading_id OR g.source_batch_code = t.batch_code
)
SELECT 'GRADING_CHAIN' AS section, * FROM grading
 ORDER BY source_id, created_at NULLS LAST, grading_id;

WITH target_grading AS (
  SELECT DISTINCT g.id, g.code, g.shift_id, g.status, g.total_output
    FROM pkg_source_batches s
    JOIN pkg_grading_records g ON g.source_batch_code = s.batch_code
   WHERE s.id IN (16, 34, 38)
  UNION
  SELECT DISTINCT g.id, g.code, g.shift_id, g.status, g.total_output
    FROM pkg_grading_source_links gsl
    JOIN pkg_grading_records g ON g.id = gsl.grading_id
   WHERE gsl.source_batch_id IN (16, 34, 38)
), packing AS (
  SELECT DISTINCT tg.id AS grading_id, tg.code AS grading_code,
         tg.shift_id AS grading_shift_id, tg.status AS grading_status,
         p.id AS packing_id, p.code AS packing_code, p.shift_id AS packing_shift_id,
         p.grading_code AS primary_grading_code, p.grading_codes_json,
         p.batches_json, p.total_boxes, p.total_eggs, p.created_at
    FROM target_grading tg
    LEFT JOIN pkg_packing_records p
      ON p.grading_code = tg.code
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.grading_codes_json, '[]'::jsonb)) x(code)
         WHERE x.code = tg.code
      )
)
SELECT 'PACKING_CHAIN' AS section, * FROM packing
 ORDER BY grading_code, created_at NULLS LAST, packing_id;

WITH target_grading AS (
  SELECT DISTINCT g.code
    FROM pkg_source_batches s
    JOIN pkg_grading_records g ON g.source_batch_code = s.batch_code
   WHERE s.id IN (16, 34, 38)
  UNION
  SELECT DISTINCT g.code
    FROM pkg_grading_source_links gsl
    JOIN pkg_grading_records g ON g.id = gsl.grading_id
   WHERE gsl.source_batch_id IN (16, 34, 38)
), packing AS (
  SELECT DISTINCT p.code, p.shift_id, p.total_boxes, p.total_eggs
    FROM pkg_packing_records p
   WHERE p.grading_code IN (SELECT code FROM target_grading)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.grading_codes_json, '[]'::jsonb)) x(code)
         WHERE x.code IN (SELECT code FROM target_grading)
      )
)
SELECT 'INVENTORY_CHAIN' AS section, p.code AS packing_code, p.shift_id,
       p.total_boxes, p.total_eggs, h.code AS handover_code, h.box_count,
       ib.batch_no, ib.qty, ib.qty_available, ib.status AS inventory_status,
       ib.source_type, ib.packaging_batch_ref,
       il.id AS ledger_id, il.change_type, il.qty_change, il.ref_no
  FROM packing p
  LEFT JOIN pkg_handover_records h ON h.packing_code = p.code
  LEFT JOIN inv_batches ib ON ib.packaging_batch_ref = p.code AND ib.source_type = 'PACKAGING'
  LEFT JOIN inv_ledger il ON il.batch_no = ib.batch_no
 ORDER BY p.code, ib.batch_no, il.id;

WITH target_shifts AS (
  SELECT DISTINCT shift_id FROM pkg_source_batches WHERE id IN (16, 34, 38)
), source_totals AS (
  SELECT s.shift_id,
         SUM(GREATEST(COALESCE(NULLIF(s.total_qty, 0), NULLIF(s.received_qty, 0), 0)
           - COALESCE(s.dirty_qty, 0) - COALESCE(s.cracked_qty, 0), 0))::int AS net_collected
    FROM pkg_source_batches s JOIN target_shifts t ON t.shift_id = s.shift_id
   GROUP BY s.shift_id
), grading_totals AS (
  SELECT g.shift_id,
         COALESCE(SUM(g.total_output) FILTER (WHERE g.status = 'ACTIVE'), 0)::int AS active_graded,
         COALESCE(SUM(g.total_output) FILTER (WHERE g.status = 'VOID'), 0)::int AS void_graded
    FROM pkg_grading_records g JOIN target_shifts t ON t.shift_id = g.shift_id
   GROUP BY g.shift_id
), packing_totals AS (
  SELECT p.shift_id, COALESCE(SUM(p.total_eggs), 0)::int AS packed_eggs
    FROM pkg_packing_records p JOIN target_shifts t ON t.shift_id = p.shift_id
   GROUP BY p.shift_id
), inventory_totals AS (
  SELECT p.shift_id, COALESCE(SUM(ib.qty), 0)::numeric AS inventory_qty,
         COALESCE(SUM(il.qty_change) FILTER (WHERE il.change_type = 'PACKAGING_INBOUND'), 0)::numeric AS ledger_inbound_qty
    FROM pkg_packing_records p JOIN target_shifts t ON t.shift_id = p.shift_id
    LEFT JOIN inv_batches ib ON ib.packaging_batch_ref = p.code AND ib.source_type = 'PACKAGING'
    LEFT JOIN inv_ledger il ON il.batch_no = ib.batch_no
   GROUP BY p.shift_id
)
SELECT 'SHIFT_RECONCILIATION' AS section, t.shift_id,
       COALESCE(s.net_collected, 0) AS net_collected,
       COALESCE(g.active_graded, 0) AS active_graded,
       COALESCE(g.void_graded, 0) AS void_graded,
       COALESCE(p.packed_eggs, 0) AS packed_eggs,
       COALESCE(i.inventory_qty, 0) AS inventory_qty,
       COALESCE(i.ledger_inbound_qty, 0) AS ledger_inbound_qty
  FROM target_shifts t
  LEFT JOIN source_totals s USING (shift_id)
  LEFT JOIN grading_totals g USING (shift_id)
  LEFT JOIN packing_totals p USING (shift_id)
  LEFT JOIN inventory_totals i USING (shift_id)
 ORDER BY t.shift_id;

WITH target_shifts AS (
  SELECT DISTINCT shift_id FROM pkg_source_batches WHERE id IN (16, 34, 38)
)
SELECT 'SHIFT_SOURCE_TIMELINE' AS section, s.id, s.batch_code, s.shift_id,
       s.house_code, s.total_qty, s.received_qty, s.dirty_qty, s.cracked_qty,
       GREATEST(COALESCE(NULLIF(s.total_qty, 0), NULLIF(s.received_qty, 0), 0)
         - COALESCE(s.dirty_qty, 0) - COALESCE(s.cracked_qty, 0), 0)::int AS net_qty,
       s.batch_status, s.created_at
  FROM pkg_source_batches s JOIN target_shifts t ON t.shift_id=s.shift_id
 ORDER BY s.shift_id, s.created_at, s.id;

WITH target_shifts AS (
  SELECT DISTINCT shift_id FROM pkg_source_batches WHERE id IN (16, 34, 38)
)
SELECT 'SHIFT_GRADING_TIMELINE' AS section, g.id, g.code, g.shift_id,
       g.source_batch_code, g.outputs_json, g.total_output, g.status, g.created_at,
       COALESCE(jsonb_agg(jsonb_build_object('source_batch_id', gsl.source_batch_id,
                                             'input_qty', gsl.input_qty))
                FILTER (WHERE gsl.source_batch_id IS NOT NULL), '[]'::jsonb) AS source_links
  FROM pkg_grading_records g
  JOIN target_shifts t ON t.shift_id=g.shift_id
  LEFT JOIN pkg_grading_source_links gsl ON gsl.grading_id=g.id
 GROUP BY g.id, g.code, g.shift_id, g.source_batch_code, g.outputs_json,
          g.total_output, g.status, g.created_at
 ORDER BY g.shift_id, g.created_at, g.id;

WITH target_shifts AS (
  SELECT DISTINCT shift_id FROM pkg_source_batches WHERE id IN (16, 34, 38)
)
SELECT 'SHIFT_PACKING_TIMELINE' AS section, p.id, p.code, p.shift_id,
       p.grading_code, p.grading_codes_json, p.batches_json,
       p.total_boxes, p.total_eggs, p.created_at
  FROM pkg_packing_records p JOIN target_shifts t ON t.shift_id=p.shift_id
 ORDER BY p.shift_id, p.created_at, p.id;

ROLLBACK;
