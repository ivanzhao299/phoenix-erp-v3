-- Sales order inventory-shortage anchor audit. Executed only through the
-- production readonly-audit runner (READ ONLY transaction + rollback).
\echo 'ORDER_SNAPSHOT'
SELECT so.id, so.order_no, so.company_code, so.company_name, so.status,
       so.created_at, so.updated_at
FROM sal_sales_orders so
WHERE so.order_no = 'SO-20260903-00004';

\echo 'ORDER_ITEMS'
SELECT i.id AS item_id, i.sku_code, i.product_code, i.grade_code,
       i.qty, i.allocated_qty, i.allocated_batch_no
FROM sal_sales_orders so
JOIN sal_order_items i ON i.sales_order_id = so.id
WHERE so.order_no = 'SO-20260903-00004'
ORDER BY i.id;

\echo 'SKU_COMPANY_WAREHOUSE_STATUS_DISTRIBUTION'
WITH target AS (
  SELECT i.id AS item_id, i.sku_code, i.product_code, i.grade_code
  FROM sal_sales_orders so
  JOIN sal_order_items i ON i.sales_order_id = so.id
  WHERE so.order_no = 'SO-20260903-00004'
)
SELECT t.item_id, t.sku_code, b.company_code, b.warehouse_code, b.status,
       COUNT(*) AS batch_count, COALESCE(SUM(b.qty), 0) AS qty,
       COALESCE(SUM(b.qty_available), 0) AS qty_available
FROM target t
JOIN inv_batches b ON
  (t.sku_code IS NOT NULL AND b.sku_code = t.sku_code)
  OR (t.sku_code IS NULL AND b.product_code = t.product_code
      AND (t.grade_code IS NULL OR b.quality_grade = t.grade_code))
GROUP BY t.item_id, t.sku_code, b.company_code, b.warehouse_code, b.status
ORDER BY t.item_id, b.company_code, b.warehouse_code, b.status;

\echo 'FIFO_CONDITION_DELTAS'
WITH target AS (
  SELECT so.company_code AS order_company, i.id AS item_id, i.sku_code,
         i.product_code, i.grade_code, i.qty AS requested_qty
  FROM sal_sales_orders so
  JOIN sal_order_items i ON i.sales_order_id = so.id
  WHERE so.order_no = 'SO-20260903-00004'
), matched AS (
  SELECT t.*, b.company_code AS batch_company, b.status, b.qty_available,
         b.expire_date, b.legacy_source
  FROM target t
  JOIN inv_batches b ON
    (t.sku_code IS NOT NULL AND b.sku_code = t.sku_code)
    OR (t.sku_code IS NULL AND b.product_code = t.product_code
        AND (t.grade_code IS NULL OR b.quality_grade = t.grade_code))
), variants(variant) AS (
  VALUES ('FULL_WHERE'), ('WITHOUT_COMPANY'), ('WITHOUT_STATUS'),
         ('WITHOUT_EXPIRY'), ('WITHOUT_LEGACY')
)
SELECT m.item_id, m.sku_code, m.product_code, m.grade_code, m.requested_qty,
       v.variant,
       COUNT(*) FILTER (WHERE
         (v.variant = 'WITHOUT_COMPANY' OR m.batch_company = m.order_company)
         AND (v.variant = 'WITHOUT_STATUS' OR m.status = 'AVAILABLE')
         AND m.qty_available > 0
         AND (v.variant = 'WITHOUT_EXPIRY' OR m.expire_date IS NULL OR m.expire_date >= CURRENT_DATE)
         AND (v.variant = 'WITHOUT_LEGACY' OR m.legacy_source IS NULL)
       ) AS batch_count,
       COALESCE(SUM(m.qty_available) FILTER (WHERE
         (v.variant = 'WITHOUT_COMPANY' OR m.batch_company = m.order_company)
         AND (v.variant = 'WITHOUT_STATUS' OR m.status = 'AVAILABLE')
         AND m.qty_available > 0
         AND (v.variant = 'WITHOUT_EXPIRY' OR m.expire_date IS NULL OR m.expire_date >= CURRENT_DATE)
         AND (v.variant = 'WITHOUT_LEGACY' OR m.legacy_source IS NULL)
       ), 0) AS qty_available
FROM matched m CROSS JOIN variants v
GROUP BY m.item_id, m.sku_code, m.product_code, m.grade_code, m.requested_qty, v.variant
ORDER BY m.item_id, v.variant;

\echo 'XINGCHI_998_CANDIDATE_ASSERTION'
SELECT batch_no, company_code, warehouse_code, status, sku_code, qty_available,
       expire_date, legacy_source
FROM inv_batches
WHERE sku_code IN (
  SELECT i.sku_code FROM sal_sales_orders so
  JOIN sal_order_items i ON i.sales_order_id = so.id
  WHERE so.order_no = 'SO-20260903-00004' AND i.sku_code IS NOT NULL
)
AND company_code = 'COMP-LAO-XINGCHI'
AND qty_available >= 998
ORDER BY qty_available DESC, batch_no;
