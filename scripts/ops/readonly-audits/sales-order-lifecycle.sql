SELECT 'READONLY_GUARD' AS assertion,
       current_setting('transaction_read_only') AS value,
       CASE WHEN current_setting('transaction_read_only')='on' THEN 'PASS' ELSE 'FAIL' END AS result;

WITH old_orders AS (
  SELECT id FROM sal_sales_orders
  WHERE created_at <= (SELECT max(occurred_at) FROM sal_order_lifecycle_events WHERE event_type='MIGRATED_SNAPSHOT')
), per_order AS (
  SELECT o.id,count(e.id) AS snapshots FROM old_orders o
  LEFT JOIN sal_order_lifecycle_events e ON e.sales_order_id=o.id AND e.event_type='MIGRATED_SNAPSHOT'
  GROUP BY o.id
)
SELECT 'MIGRATED_SNAPSHOT' AS assertion,count(*) AS old_orders,
       coalesce(sum(snapshots),0) AS snapshot_events,coalesce(min(snapshots),0) AS min_per_order,
       coalesce(max(snapshots),0) AS max_per_order,
       CASE WHEN count(*)=coalesce(sum(snapshots),0) AND coalesce(min(snapshots),0)=1 AND coalesce(max(snapshots),0)=1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM per_order;

WITH post_migration AS (
  SELECT so.id,so.order_no,so.created_at,count(e.id) FILTER (WHERE e.event_type<>'MIGRATED_SNAPSHOT') AS real_events
  FROM sal_sales_orders so LEFT JOIN sal_order_lifecycle_events e ON e.sales_order_id=so.id
  WHERE so.created_at > (SELECT max(occurred_at) FROM sal_order_lifecycle_events WHERE event_type='MIGRATED_SNAPSHOT')
  GROUP BY so.id,so.order_no,so.created_at
)
SELECT 'NEW_ORDER_REAL_EVENTS' AS assertion,count(*) AS new_orders,
       count(*) FILTER (WHERE real_events>0) AS orders_with_real_events,
       CASE WHEN count(*)=0 THEN 'NO_SAMPLE' WHEN count(*) FILTER (WHERE real_events=0)=0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM post_migration;

SELECT 'APPEND_ONLY_DEFINITION' AS assertion,
       count(*) FILTER (WHERE tgname='trg_sal_order_lifecycle_events_append_only') AS trigger_count,
       has_table_privilege('public','sal_order_lifecycle_events','UPDATE') AS public_update,
       has_table_privilege('public','sal_order_lifecycle_events','DELETE') AS public_delete,
       CASE WHEN count(*) FILTER (WHERE tgname='trg_sal_order_lifecycle_events_append_only')=1
                  AND NOT has_table_privilege('public','sal_order_lifecycle_events','UPDATE')
                  AND NOT has_table_privilege('public','sal_order_lifecycle_events','DELETE') THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_trigger WHERE tgrelid='sal_order_lifecycle_events'::regclass AND NOT tgisinternal;

WITH received AS (
  SELECT so.id,so.ar_invoice_id,count(ar.id) FILTER (WHERE ar.source_type='SALES_ORDER' AND ar.source_id=so.id) AS ar_count,
         count(ar.id) FILTER (WHERE ar.id=so.ar_invoice_id AND ar.source_type='SALES_ORDER' AND ar.source_id=so.id) AS backlink_count
  FROM sal_sales_orders so LEFT JOIN fin_ar_invoices ar ON ar.source_type='SALES_ORDER' AND ar.source_id=so.id
  WHERE so.status='RECEIVED' GROUP BY so.id,so.ar_invoice_id
)
SELECT 'RECEIVED_SALES_AR' AS assertion,count(*) AS received_orders,
       count(*) FILTER (WHERE ar_count<>1) AS non_unique_ar,
       count(*) FILTER (WHERE ar_invoice_id IS NULL OR backlink_count<>1) AS backlink_mismatch,
       CASE WHEN count(*) FILTER (WHERE ar_count<>1 OR ar_invoice_id IS NULL OR backlink_count<>1)=0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM received;

DO $$
DECLARE bad bigint;
BEGIN
  SELECT count(*) INTO bad FROM (
    SELECT so.id FROM sal_sales_orders so
    LEFT JOIN sal_order_lifecycle_events e ON e.sales_order_id=so.id AND e.event_type='MIGRATED_SNAPSHOT'
    WHERE so.created_at <= (SELECT max(occurred_at) FROM sal_order_lifecycle_events WHERE event_type='MIGRATED_SNAPSHOT')
    GROUP BY so.id HAVING count(e.id)<>1
  ) x;
  IF bad<>0 THEN RAISE EXCEPTION 'FAIL MIGRATED_SNAPSHOT bad_orders=%',bad; END IF;
  SELECT count(*) INTO bad FROM (
    SELECT so.id FROM sal_sales_orders so
    LEFT JOIN fin_ar_invoices ar ON ar.source_type='SALES_ORDER' AND ar.source_id=so.id
    WHERE so.status='RECEIVED'
    GROUP BY so.id,so.ar_invoice_id
    HAVING count(ar.id)<>1 OR so.ar_invoice_id IS NULL OR count(ar.id) FILTER (WHERE ar.id=so.ar_invoice_id)<>1
  ) x;
  IF bad<>0 THEN RAISE EXCEPTION 'FAIL RECEIVED_SALES_AR bad_orders=%',bad; END IF;
END $$;

\echo '--- SALES_ORDER_APPROVAL_TRIGGER_DISTRIBUTION ---'
SELECT code AS trigger_code, COUNT(*) AS instance_count
FROM wf_approval_instances i
CROSS JOIN LATERAL unnest(i.trigger_codes) AS code
WHERE i.biz_type='SALES_ORDER'
GROUP BY code ORDER BY code;

\echo '--- SALES_ORDER_APPROVAL_TERMINAL_CONSISTENCY (0 rows = PASS; no instances = NO_SAMPLE) ---'
WITH wf AS (
  SELECT biz_id::bigint AS sales_order_id, COUNT(*) AS instance_count,
         COUNT(*) FILTER (WHERE status='PENDING') AS pending_instances,
         COUNT(*) FILTER (WHERE status='APPROVED') AS approved_instances,
         COUNT(*) FILTER (WHERE status='REJECTED') AS rejected_instances,
         COUNT(*) FILTER (WHERE status='CANCELLED') AS cancelled_instances
  FROM wf_approval_instances WHERE biz_type='SALES_ORDER' GROUP BY biz_id
)
SELECT so.id,so.order_no,so.status,wf.*
FROM sal_sales_orders so JOIN wf ON wf.sales_order_id=so.id
WHERE (so.status='PENDING_APPROVAL' AND (wf.pending_instances<>1 OR wf.instance_count<>1))
   OR (so.status IN ('APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED','RECEIVED','RECONCILED')
       AND (wf.approved_instances<>1 OR wf.pending_instances<>0))
   OR (so.status='REJECTED' AND (wf.rejected_instances<>1 OR wf.pending_instances<>0))
   OR (so.status='CANCELLED' AND (wf.cancelled_instances<>1 OR wf.pending_instances<>0));

\echo '--- SALES_ORDER_APPROVAL_NO_FORK ---'
SELECT COUNT(*) FILTER (WHERE instance_count>1) AS forked_orders,
       COALESCE(MAX(instance_count),0) AS max_instances_per_order,
       CASE WHEN COUNT(*)=0 THEN 'NO_SAMPLE'
            WHEN COUNT(*) FILTER (WHERE instance_count>1)=0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM (
  SELECT biz_id,COUNT(*) AS instance_count
  FROM wf_approval_instances WHERE biz_type='SALES_ORDER' GROUP BY biz_id
) x;
