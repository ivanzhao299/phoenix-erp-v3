\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';
SELECT schemaname,relname,n_live_tup::bigint AS live_rows,n_dead_tup::bigint AS dead_rows,
       pg_total_relation_size(relid) AS total_bytes
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC;
ROLLBACK;
