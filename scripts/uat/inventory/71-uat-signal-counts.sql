\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';
-- Generate bounded count-only probes for explicit UAT signals. No identifiers are returned.
SELECT format('SELECT %L AS table_name,%L AS signal,count(*) AS candidate_rows FROM %I.%I WHERE %I::text LIKE ''UAT-%%'' OR upper(%I::text)=''UAT'';',table_name,column_name,table_schema,table_name,column_name,column_name)
FROM information_schema.columns
WHERE table_schema='public' AND column_name IN ('run_id','source','order_no','po_no','ref_no','batch_no','transfer_no','pilot_run_id')
  AND table_name !~* '(^pg_|migration)'
ORDER BY table_name,column_name
\gexec
ROLLBACK;
