\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';
-- Explicit fixture prefixes from seed-uat-fixture.sh; counts only, no row values.
SELECT format('SELECT %L AS table_name,%L AS signal,count(*) AS candidate_rows FROM %I.%I WHERE %I::text LIKE ''UAT-%%'';',table_name,column_name,table_schema,table_name,column_name)
FROM information_schema.columns
WHERE table_schema='public' AND column_name IN ('farm_code','house_code','flock_no','batch_no','customer_code','price_book_id','account_code','store_code','sale_no','session_no','task_no','outbound_no','loss_no','inspect_no','nc_no')
ORDER BY table_name,column_name
\gexec
ROLLBACK;
