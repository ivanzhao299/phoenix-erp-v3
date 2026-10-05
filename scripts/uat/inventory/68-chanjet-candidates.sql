\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';
SELECT c.relname AS table_name,c.reltuples::bigint AS estimated_rows,
       string_agg(a.attname,',' ORDER BY a.attname) FILTER (WHERE a.attname IN ('source','run_id','created_at','status','direction')) AS signals
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
WHERE c.relkind IN ('r','p') AND n.nspname='public' AND c.relname ~* '(chanjet|sync|recon|writeback|mapping|snapshot)'
GROUP BY c.relname,c.reltuples ORDER BY c.relname;
ROLLBACK;
