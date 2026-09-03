\echo '--- TARGET_ALLOCATION_BEFORE_IMAGE ---'
SELECT a.id AS allocation_id,a.sales_order_item_id,a.batch_no,
       a.reserved_qty,a.outbound_qty,a.released_qty,a.reservation_ledger_id,
       oi.sales_order_id,so.order_no
FROM sal_order_item_batch_allocations a
JOIN sal_order_items oi ON oi.id=a.sales_order_item_id
JOIN sal_sales_orders so ON so.id=oi.sales_order_id
WHERE a.id=1
  AND a.sales_order_item_id=35
  AND a.batch_no='IBN-20260828-VW1SSC';

\echo '--- FIFO_OUT_CANDIDATE ---'
WITH target AS (
  SELECT a.id AS allocation_id,a.batch_no,a.outbound_qty,so.order_no
  FROM sal_order_item_batch_allocations a
  JOIN sal_order_items oi ON oi.id=a.sales_order_item_id
  JOIN sal_sales_orders so ON so.id=oi.sales_order_id
  WHERE a.id=1 AND a.sales_order_item_id=35
    AND a.batch_no='IBN-20260828-VW1SSC'
)
SELECT l.id AS ledger_id,l.ref_no,l.created_at,-l.qty_change AS outbound_qty,
       l.batch_no,l.company_code,l.sku_code,l.note
FROM target t
JOIN inv_ledger l ON l.batch_no=t.batch_no
 AND l.change_type='FIFO_OUT'
 AND -l.qty_change=t.outbound_qty
 AND substring(l.note FROM 'order=([^ ]+)')=t.order_no
ORDER BY l.id;

\echo '--- FAIL_CLOSED_ASSERTIONS ---'
DO $$
DECLARE candidate_count integer;
BEGIN
  IF (SELECT count(*) FROM sal_order_item_batch_allocations
      WHERE id=1 AND sales_order_item_id=35
        AND batch_no='IBN-20260828-VW1SSC'
        AND reserved_qty=1 AND outbound_qty=1 AND released_qty=0) <> 1 THEN
    RAISE EXCEPTION 'target allocation before image mismatch';
  END IF;
  IF (SELECT count(*) FROM sal_order_item_batch_allocation_actions
      WHERE allocation_id=1 AND action_type='OUTBOUND') <> 0 THEN
    RAISE EXCEPTION 'target allocation already has an OUTBOUND action';
  END IF;
  SELECT count(*) INTO candidate_count
  FROM sal_order_item_batch_allocations a
  JOIN sal_order_items oi ON oi.id=a.sales_order_item_id
  JOIN sal_sales_orders so ON so.id=oi.sales_order_id
  JOIN inv_ledger l ON l.batch_no=a.batch_no
   AND l.change_type='FIFO_OUT'
   AND -l.qty_change=a.outbound_qty
   AND substring(l.note FROM 'order=([^ ]+)')=so.order_no
  WHERE a.id=1 AND a.sales_order_item_id=35
    AND a.batch_no='IBN-20260828-VW1SSC';
  IF candidate_count <> 1 THEN
    RAISE EXCEPTION 'FIFO_OUT candidate is not unique: % rows',candidate_count;
  END IF;
END $$;

SELECT 'PASS' AS result,
       'exactly one FIFO_OUT candidate; production business writes = 0' AS assertion;
