\echo '=== CREDIT_EVALUATION_ORDER_ANCHOR ==='
SELECT id, order_no, status, company_code, company_name,
       customer_code, customer_name, created_at, updated_at
FROM sal_sales_orders
WHERE order_no = 'SO-20260903-00005';

\echo '=== CREDIT_CUSTOMER_MASTER_MATCH_COUNTS ==='
WITH target AS (
  SELECT customer_code, company_code
  FROM sal_sales_orders
  WHERE order_no = 'SO-20260903-00005'
)
SELECT t.customer_code,
       t.company_code,
       COUNT(*) FILTER (WHERE c.customer_no = t.customer_code) AS standard_match_count,
       COUNT(*) FILTER (WHERE c.legacy_customer_code = t.customer_code) AS legacy_match_count
FROM target t
LEFT JOIN sal_customers c
  ON c.company_code = t.company_code
 AND (c.customer_no = t.customer_code OR c.legacy_customer_code = t.customer_code)
GROUP BY t.customer_code, t.company_code;

\echo '=== CREDIT_CUSTOMER_MASTER_MATCH_ROWS ==='
WITH target AS (
  SELECT customer_code, company_code
  FROM sal_sales_orders
  WHERE order_no = 'SO-20260903-00005'
)
SELECT c.id, c.customer_no, c.legacy_customer_code, c.customer_name,
       c.company_code, c.credit_limit, c.payment_terms,
       c.risk_level, c.status, c.credit_status,
       CASE
         WHEN c.customer_no = t.customer_code THEN 'STANDARD'
         WHEN c.legacy_customer_code = t.customer_code THEN 'LEGACY'
       END AS match_mode
FROM target t
JOIN sal_customers c
  ON c.company_code = t.company_code
 AND (c.customer_no = t.customer_code OR c.legacy_customer_code = t.customer_code)
ORDER BY match_mode, c.id;
