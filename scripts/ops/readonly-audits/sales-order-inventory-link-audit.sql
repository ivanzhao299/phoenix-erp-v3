\echo '--- READONLY_GUARD ---'
SELECT current_setting('transaction_read_only') AS transaction_read_only,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'PASS' ELSE 'FAIL' END AS result;

\echo '--- ALLOCATED_VS_RESERVED_SUMMARY ---'
WITH allocated AS (
  SELECT so.order_no,
         so.company_code,
         oi.sku_code,
         SUM(COALESCE(oi.allocated_qty, 0)) AS allocated_qty
  FROM sal_sales_orders so
  JOIN sal_order_items oi ON oi.sales_order_id = so.id
  GROUP BY so.order_no, so.company_code, oi.sku_code
), reserved AS (
  SELECT ref_no AS order_no,
         company_code,
         sku_code,
         SUM(-qty_change) AS reserved_qty
  FROM inv_ledger
  WHERE change_type = 'RESERVED'
  GROUP BY ref_no, company_code, sku_code
), reconciled AS (
  SELECT COALESCE(a.order_no, r.order_no) AS order_no,
         COALESCE(a.company_code, r.company_code) AS company_code,
         COALESCE(a.sku_code, r.sku_code) AS sku_code,
         COALESCE(a.allocated_qty, 0) AS allocated_qty,
         COALESCE(r.reserved_qty, 0) AS reserved_qty
  FROM allocated a
  FULL JOIN reserved r
    ON r.order_no = a.order_no
   AND r.company_code = a.company_code
   AND r.sku_code IS NOT DISTINCT FROM a.sku_code
)
SELECT COUNT(*) AS compared_groups,
       COUNT(*) FILTER (WHERE allocated_qty <> reserved_qty) AS mismatch_groups,
       COALESCE(SUM(ABS(allocated_qty - reserved_qty)) FILTER (WHERE allocated_qty <> reserved_qty), 0) AS absolute_mismatch_qty,
       CASE WHEN COUNT(*) FILTER (WHERE allocated_qty <> reserved_qty) = 0 THEN 'PASS' ELSE 'REVIEW_REQUIRED' END AS result
FROM reconciled;

\echo '--- ALLOCATED_VS_RESERVED_MISMATCH_DETAIL (max 200) ---'
WITH allocated AS (
  SELECT so.order_no, so.company_code, so.status, oi.sku_code,
         SUM(COALESCE(oi.allocated_qty, 0)) AS allocated_qty
  FROM sal_sales_orders so
  JOIN sal_order_items oi ON oi.sales_order_id = so.id
  GROUP BY so.order_no, so.company_code, so.status, oi.sku_code
), reserved AS (
  SELECT ref_no AS order_no, company_code, sku_code,
         SUM(-qty_change) AS reserved_qty,
         COUNT(*) AS reserved_rows
  FROM inv_ledger
  WHERE change_type = 'RESERVED'
  GROUP BY ref_no, company_code, sku_code
)
SELECT COALESCE(a.order_no, r.order_no) AS order_no,
       a.status,
       COALESCE(a.company_code, r.company_code) AS company_code,
       COALESCE(a.sku_code, r.sku_code) AS sku_code,
       COALESCE(a.allocated_qty, 0) AS allocated_qty,
       COALESCE(r.reserved_qty, 0) AS reserved_qty,
       COALESCE(r.reserved_rows, 0) AS reserved_rows
FROM allocated a
FULL JOIN reserved r
  ON r.order_no = a.order_no
 AND r.company_code = a.company_code
 AND r.sku_code IS NOT DISTINCT FROM a.sku_code
WHERE COALESCE(a.allocated_qty, 0) <> COALESCE(r.reserved_qty, 0)
ORDER BY COALESCE(a.order_no, r.order_no), COALESCE(a.sku_code, r.sku_code)
LIMIT 200;

\echo '--- OPEN_ORDER_ALLOCATION_MISMATCH_SUMMARY ---'
WITH open_allocated AS (
  SELECT so.order_no, so.company_code, oi.sku_code,
         SUM(COALESCE(oi.allocated_qty, 0)) AS allocated_qty
  FROM sal_sales_orders so
  JOIN sal_order_items oi ON oi.sales_order_id = so.id
  WHERE so.status IN ('APPROVED', 'ALLOCATED', 'PICKED', 'LOADED', 'SHIPPED', 'DELIVERED')
  GROUP BY so.order_no, so.company_code, oi.sku_code
), reserved AS (
  SELECT ref_no AS order_no, company_code, sku_code, SUM(-qty_change) AS reserved_qty
  FROM inv_ledger
  WHERE change_type = 'RESERVED'
  GROUP BY ref_no, company_code, sku_code
)
SELECT COUNT(*) AS open_allocation_groups,
       COUNT(*) FILTER (WHERE COALESCE(r.reserved_qty, 0) <> a.allocated_qty) AS mismatch_groups,
       COALESCE(SUM(ABS(a.allocated_qty - COALESCE(r.reserved_qty, 0)))
         FILTER (WHERE COALESCE(r.reserved_qty, 0) <> a.allocated_qty), 0) AS absolute_mismatch_qty,
       CASE WHEN COUNT(*) FILTER (WHERE COALESCE(r.reserved_qty, 0) <> a.allocated_qty) = 0
            THEN 'PASS' ELSE 'REVIEW_REQUIRED' END AS result
FROM open_allocated a
LEFT JOIN reserved r
  ON r.order_no = a.order_no
 AND r.company_code = a.company_code
 AND r.sku_code IS NOT DISTINCT FROM a.sku_code;

\echo '--- INVALID_BATCH_BALANCES ---'
SELECT batch_no, company_code, warehouse_code, sku_code, status, qty, qty_available,
       CASE
         WHEN qty < 0 THEN 'NEGATIVE_PHYSICAL'
         WHEN qty_available < 0 THEN 'NEGATIVE_AVAILABLE'
         WHEN qty_available > qty THEN 'AVAILABLE_GT_PHYSICAL'
       END AS violation
FROM inv_batches
WHERE qty < 0 OR qty_available < 0 OR qty_available > qty
ORDER BY company_code, warehouse_code, batch_no
LIMIT 500;

\echo '--- INVALID_BATCH_BALANCE_SUMMARY ---'
SELECT COUNT(*) FILTER (WHERE qty < 0) AS negative_physical,
       COUNT(*) FILTER (WHERE qty_available < 0) AS negative_available,
       COUNT(*) FILTER (WHERE qty_available > qty) AS available_gt_physical,
       CASE WHEN COUNT(*) FILTER (WHERE qty < 0 OR qty_available < 0 OR qty_available > qty) = 0
            THEN 'PASS' ELSE 'REVIEW_REQUIRED' END AS result
FROM inv_batches;

\echo '--- DUPLICATE_FIFO_OUT_CANDIDATE_SUMMARY ---'
WITH facts AS (
  SELECT ref_no AS delivery_no,
         substring(note FROM 'order=([^ ]+)') AS order_no,
         batch_no,
         sku_code,
         COUNT(*) AS ledger_rows,
         SUM(-qty_change) AS fifo_out_qty
  FROM inv_ledger
  WHERE change_type = 'FIFO_OUT'
  GROUP BY ref_no, substring(note FROM 'order=([^ ]+)'), batch_no, sku_code
)
SELECT COUNT(*) FILTER (WHERE ledger_rows > 1) AS duplicate_candidate_facts,
       COALESCE(SUM(ledger_rows - 1) FILTER (WHERE ledger_rows > 1), 0) AS excess_ledger_rows,
       CASE WHEN COUNT(*) FILTER (WHERE ledger_rows > 1) = 0 THEN 'PASS' ELSE 'REVIEW_REQUIRED' END AS result
FROM facts;

\echo '--- DUPLICATE_FIFO_OUT_CANDIDATE_DETAIL (max 200) ---'
SELECT ref_no AS delivery_no,
       substring(note FROM 'order=([^ ]+)') AS order_no,
       batch_no,
       sku_code,
       COUNT(*) AS ledger_rows,
       SUM(-qty_change) AS fifo_out_qty,
       MIN(created_at) AS first_out_at,
       MAX(created_at) AS last_out_at,
       array_agg(id ORDER BY id) AS ledger_ids
FROM inv_ledger
WHERE change_type = 'FIFO_OUT'
GROUP BY ref_no, substring(note FROM 'order=([^ ]+)'), batch_no, sku_code
HAVING COUNT(*) > 1
ORDER BY MAX(created_at) DESC
LIMIT 200;

\echo '--- SALES_RESERVED_STORE_WAREHOUSE_HIT_SUMMARY ---'
WITH active_store_sales_warehouses AS (
  SELECT DISTINCT w.warehouse_code, s.store_code, s.company_code
  FROM store_master s
  JOIN wms_warehouses w
    ON w.owner_store_id = s.id
   AND w.company_code = s.company_code
  JOIN store_warehouse_bindings swb
    ON swb.store_id = s.id
   AND swb.warehouse_code = w.warehouse_code
  WHERE s.status = 'ACTIVE'
    AND w.status = 'ACTIVE'
    AND w.domain = 'OPERATIONAL'
    AND swb.purpose = 'SALES'
    AND swb.status = 'ACTIVE'
    AND swb.effective_to IS NULL
), hits AS (
  SELECT l.id, l.ref_no AS order_no, l.batch_no, l.company_code, l.sku_code,
         -l.qty_change AS reserved_qty, b.warehouse_code, ss.store_code, l.created_at
  FROM inv_ledger l
  JOIN inv_batches b ON b.batch_no = l.batch_no
  JOIN active_store_sales_warehouses ss
    ON ss.warehouse_code = b.warehouse_code
   AND ss.company_code = l.company_code
  WHERE l.change_type = 'RESERVED'
)
SELECT COUNT(*) AS ledger_rows,
       COUNT(DISTINCT order_no) AS orders,
       COALESCE(SUM(reserved_qty), 0) AS reserved_qty,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'REVIEW_REQUIRED' END AS result
FROM hits;

\echo '--- SALES_RESERVED_STORE_WAREHOUSE_HIT_DETAIL (max 200) ---'
WITH active_store_sales_warehouses AS (
  SELECT DISTINCT w.warehouse_code, s.store_code, s.company_code
  FROM store_master s
  JOIN wms_warehouses w
    ON w.owner_store_id = s.id
   AND w.company_code = s.company_code
  JOIN store_warehouse_bindings swb
    ON swb.store_id = s.id
   AND swb.warehouse_code = w.warehouse_code
  WHERE s.status = 'ACTIVE'
    AND w.status = 'ACTIVE'
    AND w.domain = 'OPERATIONAL'
    AND swb.purpose = 'SALES'
    AND swb.status = 'ACTIVE'
    AND swb.effective_to IS NULL
)
SELECT l.id AS ledger_id, l.ref_no AS order_no, l.batch_no, l.company_code,
       l.sku_code, -l.qty_change AS reserved_qty, b.warehouse_code,
       ss.store_code, l.created_at
FROM inv_ledger l
JOIN inv_batches b ON b.batch_no = l.batch_no
JOIN active_store_sales_warehouses ss
  ON ss.warehouse_code = b.warehouse_code
 AND ss.company_code = l.company_code
WHERE l.change_type = 'RESERVED'
ORDER BY l.created_at DESC, l.id DESC
LIMIT 200;
