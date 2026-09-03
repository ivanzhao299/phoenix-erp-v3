\echo '--- OPEN_RESERVED_DUPLICATE_FACTS (0 = PASS) ---'
SELECT COUNT(*) AS duplicate_groups
FROM (
  SELECT oi.id,l.batch_no
  FROM sal_sales_orders so
  JOIN sal_order_items oi ON oi.sales_order_id=so.id
  JOIN inv_ledger l ON l.ref_no=so.order_no AND l.change_type='RESERVED' AND l.qty_change<0
    AND substring(l.note FROM '明细 ([0-9]+)')::bigint=oi.id
  WHERE so.status IN ('APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED')
  GROUP BY oi.id,l.batch_no HAVING COUNT(*)<>1
) duplicates;

\echo '--- OPEN_ALLOCATION_REBUILD_MISMATCH (0 = PASS) ---'
WITH rebuilt AS (
  SELECT oi.id,SUM(-l.qty_change) AS rebuilt_qty
  FROM sal_sales_orders so
  JOIN sal_order_items oi ON oi.sales_order_id=so.id
  JOIN inv_ledger l ON l.ref_no=so.order_no AND l.change_type='RESERVED' AND l.qty_change<0
    AND substring(l.note FROM '明细 ([0-9]+)')::bigint=oi.id
  JOIN inv_batches b ON b.batch_no=l.batch_no
  WHERE so.status IN ('APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED')
  GROUP BY oi.id
)
SELECT COUNT(*) AS mismatch_items
FROM sal_sales_orders so
JOIN sal_order_items oi ON oi.sales_order_id=so.id
LEFT JOIN rebuilt r ON r.id=oi.id
WHERE so.status IN ('APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED')
  AND COALESCE(oi.allocated_qty,0)>0
  AND COALESCE(r.rebuilt_qty,0)<>oi.allocated_qty;

\echo '--- AMBIGUOUS_OPEN_OUTBOUND_ALLOCATION (0 = PASS) ---'
WITH rebuilt AS (
  SELECT oi.id AS sales_order_item_id,oi.sales_order_id,l.batch_no,-l.qty_change AS reserved_qty
  FROM sal_sales_orders so
  JOIN sal_order_items oi ON oi.sales_order_id=so.id
  JOIN inv_ledger l ON l.ref_no=so.order_no AND l.change_type='RESERVED' AND l.qty_change<0
    AND substring(l.note FROM '明细 ([0-9]+)')::bigint=oi.id
  WHERE so.status IN ('APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED')
), outbound AS (
  SELECT so.id AS sales_order_id,l.batch_no,SUM(-l.qty_change) AS qty
  FROM inv_ledger l
  JOIN sal_sales_orders so ON so.order_no=substring(l.note FROM 'order=([^ ]+)')
  WHERE l.change_type='FIFO_OUT' AND l.qty_change<0
    AND so.status IN ('APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED')
  GROUP BY so.id,l.batch_no
), candidates AS (
  SELECT o.sales_order_id,o.batch_no,o.qty,COUNT(r.sales_order_item_id) AS allocation_count,
         COALESCE(SUM(r.reserved_qty),0) AS reserved_qty
  FROM outbound o
  LEFT JOIN rebuilt r ON r.sales_order_id=o.sales_order_id AND r.batch_no=o.batch_no
  GROUP BY o.sales_order_id,o.batch_no,o.qty
)
SELECT COUNT(*) AS ambiguous_groups
FROM candidates WHERE allocation_count<>1 OR qty>reserved_qty;
