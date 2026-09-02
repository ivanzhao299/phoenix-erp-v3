SELECT 'READONLY_GUARD' AS assertion,
       current_setting('transaction_read_only') AS value,
       CASE WHEN current_setting('transaction_read_only')='on' THEN 'PASS' ELSE 'FAIL' END AS result;

WITH complete_chain AS (
  SELECT so.id
  FROM sal_sales_orders so
  WHERE EXISTS (SELECT 1 FROM sal_delivery_order_items i JOIN sal_delivery_orders d ON d.id=i.delivery_order_id WHERE i.sales_order_id=so.id)
    AND EXISTS (SELECT 1 FROM sal_receipts r WHERE r.sales_order_id=so.id)
    AND EXISTS (SELECT 1 FROM fin_ar_invoices ar WHERE ar.source_type='SALES_ORDER' AND ar.source_id=so.id AND ar.id=so.ar_invoice_id)
)
SELECT 'COMPLETE_DELIVERY_RECEIPT_AR_SAMPLE' AS assertion, count(*) AS samples,
       CASE WHEN count(*)=0 THEN 'NO_SAMPLE' ELSE 'PASS' END AS result
FROM complete_chain;

SELECT 'RECEIVED_WITHOUT_AR_SAMPLE' AS assertion, count(*) AS samples,
       CASE WHEN count(*)=0 THEN 'NO_SAMPLE' ELSE 'PASS' END AS result
FROM sal_sales_orders so
WHERE so.status='RECEIVED' AND so.ar_invoice_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM fin_ar_invoices ar WHERE ar.source_type='SALES_ORDER' AND ar.source_id=so.id);

SELECT 'DELIVERY_COMPLETED_WITHOUT_RECEIPT_SAMPLE' AS assertion, count(DISTINCT so.id) AS samples,
       CASE WHEN count(DISTINCT so.id)=0 THEN 'NO_SAMPLE' ELSE 'PASS' END AS result
FROM sal_sales_orders so
JOIN sal_delivery_order_items i ON i.sales_order_id=so.id
JOIN sal_delivery_orders d ON d.id=i.delivery_order_id AND d.status='COMPLETED'
WHERE NOT EXISTS (SELECT 1 FROM sal_receipts r WHERE r.sales_order_id=so.id);
