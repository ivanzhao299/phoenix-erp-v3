\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';
SELECT n.nspname AS schema_name,c.relname AS table_name,c.reltuples::bigint AS estimated_rows,
       COALESCE(s.n_live_tup,0)::bigint AS live_rows,pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY n.nspname,c.relname;
ROLLBACK;
