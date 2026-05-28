-- ═══════════════════════════════════════════════════════════════════════════
-- Phoenix ERP V3 — V2 Runtime 生产环境健康检查
-- 脚本：apps/api/scripts/check-v2-runtime-tables.sql
-- 用途：验证所有 V2 Runtime 表已在生产数据库中建立
-- 执行：psql -U $DB_USER -d $DB_NAME -f check-v2-runtime-tables.sql
-- 预期：每行 table_status = 'EXISTS'，missing_count = 0
-- ═══════════════════════════════════════════════════════════════════════════

\echo '════════════════════════════════════════════════════════'
\echo '  Phoenix ERP V3 — V2 Runtime Table Health Check'
\echo '════════════════════════════════════════════════════════'

-- ── 1. Finance V2 Tables (DDL 22) ─────────────────────────────────────────
\echo ''
\echo '── Finance V2 Tables (12 expected) ──'

SELECT
  t.table_name,
  CASE WHEN i.table_name IS NOT NULL THEN '✅ EXISTS' ELSE '❌ MISSING' END AS table_status
FROM (VALUES
  ('fin_exchange_rates'),
  ('fin_ap_invoices'),
  ('fin_ar_invoices'),
  ('fin_ar_receipts'),
  ('fin_ar_receipt_allocations'),
  ('fin_cash_accounts'),
  ('fin_cash_transactions'),
  ('fin_fund_transfers'),
  ('fin_shareholder_contributions'),
  ('fin_shareholder_settlements'),
  ('fin_expense_requests'),
  ('fin_reimbursements')
) AS t(table_name)
LEFT JOIN information_schema.tables i
  ON i.table_schema = 'public' AND i.table_name = t.table_name
ORDER BY t.table_name;

-- ── 2. Procurement V2 Tables (DDL 23) ─────────────────────────────────────
\echo ''
\echo '── Procurement V2 Tables (17 expected) ──'

SELECT
  t.table_name,
  CASE WHEN i.table_name IS NOT NULL THEN '✅ EXISTS' ELSE '❌ MISSING' END AS table_status
FROM (VALUES
  ('prc2_suppliers'),
  ('prc2_projects'),
  ('prc2_purchase_requests'),
  ('prc2_request_items'),
  ('prc2_purchase_orders'),
  ('prc2_order_items'),
  ('prc2_payments'),
  ('prc2_payment_allocations'),
  ('prc2_shareholder_funds'),
  ('prc2_ap_ledger'),
  ('prc2_shipments'),
  ('prc2_receipts'),
  ('prc2_receipt_items'),
  ('prc2_approvals'),
  ('prc2_init_batches'),
  ('prc2_init_batch_rows'),
  ('sys_exchange_rates')
) AS t(table_name)
LEFT JOIN information_schema.tables i
  ON i.table_schema = 'public' AND i.table_name = t.table_name
ORDER BY t.table_name;

-- ── 3. Approval Engine Tables (DDL 24) ────────────────────────────────────
\echo ''
\echo '── Approval Engine Tables (4 expected) ──'

SELECT
  t.table_name,
  CASE WHEN i.table_name IS NOT NULL THEN '✅ EXISTS' ELSE '❌ MISSING' END AS table_status
FROM (VALUES
  ('wf_approval_rules'),
  ('wf_approval_rule_steps'),
  ('wf_approval_instances'),
  ('wf_approval_instance_steps')
) AS t(table_name)
LEFT JOIN information_schema.tables i
  ON i.table_schema = 'public' AND i.table_name = t.table_name
ORDER BY t.table_name;

-- ── 4. Sales V2 Tables (migrations/20260527_sales_v2_*.sql) ───────────────
\echo ''
\echo '── Sales V2 Tables (13 expected) ──'

SELECT
  t.table_name,
  CASE WHEN i.table_name IS NOT NULL THEN '✅ EXISTS' ELSE '❌ MISSING' END AS table_status
FROM (VALUES
  ('sal_channels'),
  ('sal_customers'),
  ('sal_sales_orders'),
  ('sal_order_items'),
  ('sal_price_books'),
  ('sal_price_items'),
  ('sal_delivery_orders'),
  ('sal_delivery_order_items'),
  ('sal_drivers'),
  ('sal_vehicles'),
  ('sal_receipts'),
  ('sal_return_orders'),
  ('sal_return_items')
) AS t(table_name)
LEFT JOIN information_schema.tables i
  ON i.table_schema = 'public' AND i.table_name = t.table_name
ORDER BY t.table_name;

-- ── 5. 汇总：缺失表统计 ───────────────────────────────────────────────────
\echo ''
\echo '── Summary: Missing Table Count ──'

WITH expected AS (
  SELECT unnest(ARRAY[
    -- Finance V2
    'fin_exchange_rates','fin_ap_invoices','fin_ar_invoices','fin_ar_receipts',
    'fin_ar_receipt_allocations','fin_cash_accounts','fin_cash_transactions',
    'fin_fund_transfers','fin_shareholder_contributions','fin_shareholder_settlements',
    'fin_expense_requests','fin_reimbursements',
    -- Procurement V2
    'prc2_suppliers','prc2_projects','prc2_purchase_requests','prc2_request_items',
    'prc2_purchase_orders','prc2_order_items','prc2_payments','prc2_payment_allocations',
    'prc2_shareholder_funds','prc2_ap_ledger','prc2_shipments',
    'prc2_receipts','prc2_receipt_items','prc2_approvals',
    'prc2_init_batches','prc2_init_batch_rows','sys_exchange_rates',
    -- Approval Engine
    'wf_approval_rules','wf_approval_rule_steps',
    'wf_approval_instances','wf_approval_instance_steps',
    -- Sales V2
    'sal_channels','sal_customers','sal_sales_orders','sal_order_items',
    'sal_price_books','sal_price_items','sal_delivery_orders','sal_delivery_order_items',
    'sal_drivers','sal_vehicles','sal_receipts','sal_return_orders','sal_return_items'
  ]) AS table_name
),
found AS (
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
),
result AS (
  SELECT
    COUNT(*) FILTER (WHERE f.table_name IS NOT NULL) AS existing_count,
    COUNT(*) FILTER (WHERE f.table_name IS NULL)     AS missing_count,
    COUNT(*)                                          AS total_expected
  FROM expected e
  LEFT JOIN found f ON f.table_name = e.table_name
)
SELECT
  existing_count,
  missing_count,
  total_expected,
  CASE WHEN missing_count = 0
    THEN '✅ ALL V2 RUNTIME TABLES PRESENT — DB HEALTHY'
    ELSE '❌ MISSING TABLES DETECTED — RUN DDL FILES'
  END AS health_status
FROM result;

-- ── 6. 缺失表明细（如有） ─────────────────────────────────────────────────
\echo ''
\echo '── Missing Table Detail (should be empty) ──'

WITH expected AS (
  SELECT unnest(ARRAY[
    'fin_exchange_rates','fin_ap_invoices','fin_ar_invoices','fin_ar_receipts',
    'fin_ar_receipt_allocations','fin_cash_accounts','fin_cash_transactions',
    'fin_fund_transfers','fin_shareholder_contributions','fin_shareholder_settlements',
    'fin_expense_requests','fin_reimbursements',
    'prc2_suppliers','prc2_projects','prc2_purchase_requests','prc2_request_items',
    'prc2_purchase_orders','prc2_order_items','prc2_payments','prc2_payment_allocations',
    'prc2_shareholder_funds','prc2_ap_ledger','prc2_shipments',
    'prc2_receipts','prc2_receipt_items','prc2_approvals',
    'prc2_init_batches','prc2_init_batch_rows','sys_exchange_rates',
    'wf_approval_rules','wf_approval_rule_steps',
    'wf_approval_instances','wf_approval_instance_steps',
    'sal_channels','sal_customers','sal_sales_orders','sal_order_items',
    'sal_price_books','sal_price_items','sal_delivery_orders','sal_delivery_order_items',
    'sal_drivers','sal_vehicles','sal_receipts','sal_return_orders','sal_return_items'
  ]) AS table_name
)
SELECT e.table_name AS missing_table
FROM expected e
LEFT JOIN information_schema.tables i
  ON i.table_schema = 'public' AND i.table_name = e.table_name
WHERE i.table_name IS NULL
ORDER BY e.table_name;

\echo ''
\echo '════════════════════════════════════════════════════════'
\echo '  Health check complete.'
\echo '  Expected: 46 tables (12 fin + 17 prc2 + 4 wf + 13 sal)'
\echo '════════════════════════════════════════════════════════'
