\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';
SELECT table_schema,table_name,
       string_agg(column_name,',' ORDER BY ordinal_position) AS columns,
       bool_or(column_name IN ('created_at','updated_at')) AS has_timestamps,
       bool_or(column_name IN ('run_id','source')) AS has_uat_signals,
       bool_or(column_name IN ('company_code','store_code','warehouse_code','farm_code')) AS has_scope
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema')
GROUP BY table_schema,table_name ORDER BY table_schema,table_name;
ROLLBACK;
