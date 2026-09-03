\echo '--- CLOSEOUT_SCHEMA ---'
SELECT to_regclass('sal_order_item_batch_allocations') IS NOT NULL AS allocations_ready,
       to_regclass('sal_order_item_batch_allocation_actions') IS NOT NULL AS actions_ready,
       to_regclass('sal_delivery_exceptions') IS NOT NULL AS exceptions_ready;

\echo '--- ALLOCATION_LEDGER_CONSERVATION ---'
WITH facts AS (
  SELECT a.id,
         a.reserved_qty,
         a.outbound_qty,
         a.released_qty,
         COALESCE(SUM(-l.qty_change) FILTER (WHERE l.change_type='FIFO_OUT'),0) AS ledger_outbound,
         COALESCE(SUM(l.qty_change) FILTER (WHERE l.change_type='RELEASED'),0) AS ledger_released
  FROM sal_order_item_batch_allocations a
  LEFT JOIN sal_order_item_batch_allocation_actions x ON x.allocation_id=a.id
  LEFT JOIN inv_ledger l ON l.id=x.ledger_id
  GROUP BY a.id
)
SELECT COUNT(*) FILTER (WHERE outbound_qty<>ledger_outbound OR released_qty<>ledger_released) AS mismatch_rows,
       COUNT(*) FILTER (WHERE outbound_qty+released_qty>reserved_qty) AS overconsumed_rows,
       CASE WHEN COUNT(*) FILTER (WHERE outbound_qty<>ledger_outbound OR released_qty<>ledger_released
                                  OR outbound_qty+released_qty>reserved_qty)=0 THEN 'PASS' ELSE 'REVIEW_REQUIRED' END AS result
FROM facts;

\echo '--- POST_DEPLOY_STORE_WAREHOUSE_HITS ---'
WITH store_sales_warehouses AS (
  SELECT DISTINCT w.warehouse_code,w.company_code
  FROM wms_warehouses w
  JOIN store_warehouse_bindings swb ON swb.warehouse_code=w.warehouse_code
  WHERE w.owner_store_id IS NOT NULL AND w.status='ACTIVE' AND w.domain='OPERATIONAL'
    AND swb.purpose='SALES' AND swb.status='ACTIVE' AND swb.effective_to IS NULL
)
SELECT COUNT(*) AS post_deploy_hits,
       CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'REVIEW_REQUIRED' END AS result
FROM inv_ledger l
JOIN inv_batches b ON b.batch_no=l.batch_no
JOIN store_sales_warehouses s ON s.warehouse_code=b.warehouse_code AND s.company_code=l.company_code
WHERE l.change_type='RESERVED' AND l.created_at >= TIMESTAMPTZ '2026-09-03 05:07:00+00';
