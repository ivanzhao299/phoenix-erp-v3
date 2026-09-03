BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$
DECLARE deleted_count integer;
BEGIN
  IF (SELECT count(*) FROM sal_order_item_batch_allocations
      WHERE id=1 AND sales_order_item_id=35
        AND batch_no='IBN-20260828-VW1SSC'
        AND reserved_qty=1 AND outbound_qty=1 AND released_qty=0)<>1 THEN
    RAISE EXCEPTION 'rollback allocation guard failed';
  END IF;
  IF (SELECT count(*) FROM sal_order_item_batch_allocation_actions x
      JOIN inv_ledger l ON l.id=x.ledger_id
      WHERE x.allocation_id=1 AND x.action_type='OUTBOUND'
        AND x.action_key='historical-fifo-out:DV-20260903-0001'
        AND x.qty=1 AND x.created_by='governance-approved-20260903'
        AND l.ref_no='DV-20260903-0001'
        AND l.created_at=TIMESTAMPTZ '2026-09-03 02:51:23.183384+00'
        AND l.change_type='FIFO_OUT' AND l.qty_change=-1)<>1 THEN
    RAISE EXCEPTION 'rollback target is not unique or no longer matches';
  END IF;
  DELETE FROM sal_order_item_batch_allocation_actions
  WHERE allocation_id=1 AND action_type='OUTBOUND'
    AND action_key='historical-fifo-out:DV-20260903-0001'
    AND qty=1 AND created_by='governance-approved-20260903';
  GET DIAGNOSTICS deleted_count=ROW_COUNT;
  IF deleted_count<>1 THEN
    RAISE EXCEPTION 'rollback expected one deleted relation, got %',deleted_count;
  END IF;
END $$;

COMMIT;
