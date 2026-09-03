\echo '--- TARGET_RELATION_AFTER ---'
SELECT a.id AS allocation_id,a.reserved_qty,a.outbound_qty,a.released_qty,
       x.action_type,x.action_key,x.qty AS action_qty,x.ledger_id,
       l.ref_no,l.created_at,l.change_type,l.qty_change
FROM sal_order_item_batch_allocations a
JOIN sal_order_item_batch_allocation_actions x ON x.allocation_id=a.id
JOIN inv_ledger l ON l.id=x.ledger_id
WHERE a.id=1 AND x.action_type='OUTBOUND';

DO $$
BEGIN
  IF (SELECT count(*) FROM sal_order_item_batch_allocations
      WHERE id=1 AND sales_order_item_id=35
        AND batch_no='IBN-20260828-VW1SSC'
        AND reserved_qty=1 AND outbound_qty=1 AND released_qty=0)<>1 THEN
    RAISE EXCEPTION 'allocation quantity conservation failed';
  END IF;
  IF (SELECT count(*) FROM sal_order_item_batch_allocation_actions x
      JOIN inv_ledger l ON l.id=x.ledger_id
      WHERE x.allocation_id=1 AND x.action_type='OUTBOUND'
        AND x.action_key='historical-fifo-out:DV-20260903-0001'
        AND x.qty=1 AND l.ref_no='DV-20260903-0001'
        AND l.created_at=TIMESTAMPTZ '2026-09-03 02:51:23.183384+00'
        AND l.change_type='FIFO_OUT' AND l.qty_change=-1)<>1 THEN
    RAISE EXCEPTION 'action to ledger source relation is not normalized';
  END IF;
  IF EXISTS (
    WITH facts AS (
      SELECT a.id,a.reserved_qty,a.outbound_qty,a.released_qty,
             COALESCE(sum(-l.qty_change) FILTER (WHERE l.change_type='FIFO_OUT'),0) ledger_outbound,
             COALESCE(sum(l.qty_change) FILTER (WHERE l.change_type='RELEASED'),0) ledger_released
      FROM sal_order_item_batch_allocations a
      LEFT JOIN sal_order_item_batch_allocation_actions x ON x.allocation_id=a.id
      LEFT JOIN inv_ledger l ON l.id=x.ledger_id GROUP BY a.id
    )
    SELECT 1 FROM facts
    WHERE outbound_qty<>ledger_outbound OR released_qty<>ledger_released
       OR outbound_qty+released_qty>reserved_qty
  ) THEN
    RAISE EXCEPTION 'allocation/action/ledger closeout still has differences';
  END IF;
END $$;

SELECT 0 AS mismatch_rows,0 AS overconsumed_rows,'PASS' AS result;
