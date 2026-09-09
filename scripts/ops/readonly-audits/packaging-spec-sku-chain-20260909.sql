\pset null '[NULL]'
\pset border 2

\echo '=== audit contract: packaging_specs column inventory (product_code must not be assumed) ==='
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'packaging_specs'
   AND column_name IN ('spec_code', 'spec_name', 'product_code', 'status')
 ORDER BY ordinal_position;

\echo '=== authoritative packaging spec and PKG_PACK_SPEC dictionary consistency ==='
SELECT ps.spec_code,
       ps.spec_name,
       ps.status AS spec_status,
       d.dict_code,
       d.name AS dict_name,
       d.dict_label_zh,
       d.dict_label_en,
       d.dict_label_lo,
       d.status AS dict_status,
       (ps.spec_code = d.dict_code) AS code_matches,
       (ps.spec_name = COALESCE(NULLIF(d.dict_label_zh, ''), NULLIF(d.name, ''), d.dict_code)) AS zh_display_name_matches
  FROM packaging_specs ps
  FULL JOIN sys_dict d
    ON d.dict_type = 'PKG_PACK_SPEC'
   AND d.dict_code = ps.spec_code
 WHERE ps.spec_code = 'PKG_PACK_SPEC_3'
    OR d.dict_code = 'PKG_PACK_SPEC_3'
 ORDER BY COALESCE(ps.spec_code, d.dict_code);

\echo '=== all SKU lifecycle rows for authoritative product + grade + gift-box spec ==='
SELECT sku_code,
       product_code,
       product_name,
       grade_code,
       spec_code,
       sku_name,
       status,
       effective_date,
       expire_date,
       created_at,
       updated_at
  FROM product_skus
 WHERE product_code = 'PRD-EGG-GRADE_1'
   AND grade_code = 'GRADE_1'
   AND spec_code = 'PKG_PACK_SPEC_3'
 ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END, sku_code;

\echo '=== affected PACKAGING/TEMP_PRODUCTION batches with FIFO_OUT summary ==='
WITH affected AS (
  SELECT b.*
    FROM inv_batches b
   WHERE b.source_type IN ('PACKAGING', 'TEMP_PRODUCTION')
     AND (b.spec_code IS NULL OR b.sku_code IS NULL)
), fifo AS (
  SELECT l.batch_no,
         COUNT(*) FILTER (WHERE l.change_type = 'FIFO_OUT') AS fifo_out_rows,
         COALESCE(SUM(-l.qty_change) FILTER (WHERE l.change_type = 'FIFO_OUT' AND l.qty_change < 0), 0) AS fifo_out_qty,
         MIN(l.created_at) FILTER (WHERE l.change_type = 'FIFO_OUT') AS first_fifo_out_at,
         MAX(l.created_at) FILTER (WHERE l.change_type = 'FIFO_OUT') AS last_fifo_out_at
    FROM inv_ledger l
    JOIN affected a ON a.batch_no = l.batch_no
   GROUP BY l.batch_no
)
SELECT a.batch_no,
       a.source_type,
       a.source_no,
       a.packaging_batch_ref,
       a.collection_batch_ref,
       a.product_code,
       a.quality_grade,
       a.grade_code_std,
       a.qty,
       a.qty_available,
       a.status,
       a.company_code,
       a.warehouse_code,
       a.location_code,
       a.egg_date,
       a.created_at,
       a.spec_code,
       a.sku_code,
       a.packaging_spec,
       COALESCE(f.fifo_out_rows, 0) AS fifo_out_rows,
       COALESCE(f.fifo_out_qty, 0) AS fifo_out_qty,
       f.first_fifo_out_at,
       f.last_fifo_out_at
  FROM affected a
  LEFT JOIN fifo f ON f.batch_no = a.batch_no
 ORDER BY a.created_at, a.batch_no;

\echo '=== affected PACKAGING batches joined to immutable packing source items ==='
WITH affected AS (
  SELECT batch_no,
         source_no,
         packaging_batch_ref,
         product_code,
         quality_grade,
         grade_code_std,
         qty,
         qty_available,
         spec_code,
         sku_code
    FROM inv_batches
   WHERE source_type = 'PACKAGING'
     AND (spec_code IS NULL OR sku_code IS NULL)
)
SELECT a.batch_no,
       a.source_no,
       a.packaging_batch_ref,
       a.product_code,
       a.quality_grade,
       a.grade_code_std,
       a.qty,
       a.qty_available,
       a.spec_code,
       a.sku_code,
       pr.id AS packing_record_id,
       pr.code AS packing_code,
       pr.shift_id,
       item.ordinality AS source_item_ordinality,
       item.value ->> 'grade' AS source_grade,
       item.value ->> 'specId' AS source_spec_id,
       item.value ->> 'spec' AS source_spec_name,
       item.value ->> 'eggs' AS source_eggs,
       item.value ->> 'boxes' AS source_boxes
  FROM affected a
  LEFT JOIN pkg_packing_records pr
    ON pr.code = COALESCE(a.packaging_batch_ref, a.source_no)
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(pr.batches_json, '[]'::jsonb))
    WITH ORDINALITY AS item(value, ordinality) ON TRUE
   AND item.value ->> 'grade' = COALESCE(a.grade_code_std, a.quality_grade)
 ORDER BY a.batch_no, item.ordinality;

\echo '=== affected-batch FIFO_OUT ledger rows and allocation action order trace ==='
WITH affected AS (
  SELECT batch_no
    FROM inv_batches
   WHERE source_type IN ('PACKAGING', 'TEMP_PRODUCTION')
     AND (spec_code IS NULL OR sku_code IS NULL)
)
SELECT l.id AS ledger_id,
       l.batch_no,
       l.change_type,
       l.qty_change,
       l.ref_no AS ledger_ref_no,
       l.created_at AS ledger_created_at,
       aa.id AS action_id,
       aa.action_type,
       aa.qty AS action_qty,
       aa.allocation_id,
       aa.sales_order_id,
       so.order_no,
       aa.delivery_order_id,
       al.sales_order_item_id,
       oi.product_code AS order_item_product_code,
       oi.grade_code AS order_item_grade_code,
       oi.packaging_spec AS order_item_packaging_spec,
       oi.sku_code AS order_item_sku_code
  FROM inv_ledger l
  JOIN affected a ON a.batch_no = l.batch_no
  LEFT JOIN sal_order_item_batch_allocation_actions aa ON aa.ledger_id = l.id
  LEFT JOIN sal_sales_orders so ON so.id = aa.sales_order_id
  LEFT JOIN sal_order_item_batch_allocations al ON al.id = aa.allocation_id
  LEFT JOIN sal_order_items oi ON oi.id = al.sales_order_item_id
 WHERE l.change_type = 'FIFO_OUT'
 ORDER BY l.batch_no, l.created_at, l.id;

\echo '=== affected-batch allocation actions whose ledger link is not FIFO_OUT or mismatches allocation batch ==='
WITH affected AS (
  SELECT batch_no
    FROM inv_batches
   WHERE source_type IN ('PACKAGING', 'TEMP_PRODUCTION')
     AND (spec_code IS NULL OR sku_code IS NULL)
)
SELECT aa.id AS action_id,
       aa.action_type,
       aa.ledger_id,
       l.batch_no AS ledger_batch_no,
       l.change_type,
       al.batch_no AS allocation_batch_no,
       so.order_no,
       aa.qty
  FROM sal_order_item_batch_allocation_actions aa
  JOIN inv_ledger l ON l.id = aa.ledger_id
  JOIN sal_order_item_batch_allocations al ON al.id = aa.allocation_id
  JOIN sal_sales_orders so ON so.id = aa.sales_order_id
  JOIN affected a ON a.batch_no = l.batch_no OR a.batch_no = al.batch_no
 WHERE l.change_type <> 'FIFO_OUT'
    OR l.batch_no IS DISTINCT FROM al.batch_no
 ORDER BY aa.id;
