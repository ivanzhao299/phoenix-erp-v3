\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';
SELECT c.relname AS table_name,c.reltuples::bigint AS estimated_rows,
       string_agg(a.attname,',' ORDER BY a.attname) FILTER (WHERE a.attname IN ('run_id','source','po_no','ref_no','created_by','created_at','status')) AS signals
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
WHERE c.relkind IN ('r','p') AND n.nspname='public' AND c.relname ~* '(prc|purchase|procurement|payable|receipt)'
GROUP BY c.relname,c.reltuples ORDER BY c.relname;
ROLLBACK;
