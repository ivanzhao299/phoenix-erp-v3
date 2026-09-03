BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$
DECLARE
  target_allocation sal_order_item_batch_allocations%ROWTYPE;
  target_ledger inv_ledger%ROWTYPE;
  target_sales_order_id bigint;
  target_delivery_order_id bigint;
  candidate_count integer;
  inserted_count integer;
  ledger_row_count_before bigint;
  ledger_qty_before numeric;
BEGIN
  SELECT * INTO target_allocation
  FROM sal_order_item_batch_allocations
  WHERE id=1
  FOR UPDATE;

  IF NOT FOUND OR target_allocation.sales_order_item_id<>35
     OR target_allocation.batch_no<>'IBN-20260828-VW1SSC'
     OR target_allocation.reserved_qty<>1
     OR target_allocation.outbound_qty<>1
     OR target_allocation.released_qty<>0 THEN
    RAISE EXCEPTION 'target allocation before image mismatch';
  END IF;

  SELECT count(*),COALESCE(sum(qty_change),0)
    INTO ledger_row_count_before,ledger_qty_before
  FROM inv_ledger;

  SELECT count(*) INTO candidate_count
  FROM inv_ledger
  WHERE ref_no='DV-20260903-0001'
    AND created_at=TIMESTAMPTZ '2026-09-03 02:51:23.183384+00'
    AND qty_change=-1.000;
  IF candidate_count<>1 THEN
    RAISE EXCEPTION 'FIFO_OUT ref/time/qty triple is not unique: % rows',candidate_count;
  END IF;

  SELECT * INTO target_ledger
  FROM inv_ledger
  WHERE ref_no='DV-20260903-0001'
    AND created_at=TIMESTAMPTZ '2026-09-03 02:51:23.183384+00'
    AND qty_change=-1.000
  FOR SHARE;
  IF target_ledger.change_type<>'FIFO_OUT'
     OR target_ledger.batch_no<>target_allocation.batch_no
     OR substring(target_ledger.note FROM 'order=([^ ]+)')<>'SO-20260903-00006' THEN
    RAISE EXCEPTION 'unique ledger candidate semantic mismatch';
  END IF;

  SELECT oi.sales_order_id INTO STRICT target_sales_order_id
  FROM sal_order_items oi
  JOIN sal_sales_orders so ON so.id=oi.sales_order_id
  WHERE oi.id=35 AND so.order_no='SO-20260903-00006';
  SELECT id INTO STRICT target_delivery_order_id
  FROM sal_delivery_orders
  WHERE delivery_no='DV-20260903-0001';

  IF EXISTS (SELECT 1 FROM sal_order_item_batch_allocation_actions
             WHERE allocation_id=1 AND action_type='OUTBOUND') THEN
    RAISE EXCEPTION 'allocation 1 already has an OUTBOUND action';
  END IF;
  IF EXISTS (SELECT 1 FROM sal_order_item_batch_allocation_actions
             WHERE ledger_id=target_ledger.id
                OR (allocation_id=1 AND action_type='OUTBOUND'
                    AND action_key='historical-fifo-out:DV-20260903-0001')) THEN
    RAISE EXCEPTION 'idempotency key or ledger relation already exists';
  END IF;

  INSERT INTO sal_order_item_batch_allocation_actions
    (allocation_id,sales_order_id,delivery_order_id,action_type,action_key,qty,ledger_id,created_by)
  VALUES
    (1,target_sales_order_id,target_delivery_order_id,'OUTBOUND',
     'historical-fifo-out:DV-20260903-0001',1,target_ledger.id,
     'governance-approved-20260903');
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  IF inserted_count<>1 THEN
    RAISE EXCEPTION 'expected exactly one inserted action, got %',inserted_count;
  END IF;

  IF (SELECT count(*) FROM inv_ledger)<>ledger_row_count_before
     OR (SELECT COALESCE(sum(qty_change),0) FROM inv_ledger)<>ledger_qty_before THEN
    RAISE EXCEPTION 'ledger rows or quantity changed unexpectedly';
  END IF;
  IF target_allocation.reserved_qty<>1 OR target_allocation.outbound_qty<>1
     OR target_allocation.released_qty<>0 THEN
    RAISE EXCEPTION 'allocation quantities changed unexpectedly';
  END IF;
END $$;

COMMIT;
