\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- U0 read-only inventory. This file intentionally contains no DML/DDL.
\echo '== DATABASE_IDENTITY =='
SELECT current_database() AS database_name, current_setting('server_version') AS server_version,
       current_setting('data_directory') AS data_directory,
       (SELECT system_identifier FROM pg_control_system()) AS system_identifier;

\echo '== TABLE_INVENTORY =='
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.reltuples::bigint AS estimated_rows,
       COALESCE(s.n_live_tup,0)::bigint AS live_rows,
       pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY n.nspname,c.relname;

\echo '== COLUMN_CAPABILITIES =='
SELECT table_schema, table_name,
       string_agg(column_name, ',' ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema')
GROUP BY table_schema,table_name ORDER BY table_schema,table_name;

\echo '== PRIMARY_AND_UNIQUE_KEYS =='
SELECT ns.nspname AS schema_name, cls.relname AS table_name,
       con.contype, con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class cls ON cls.oid=con.conrelid
JOIN pg_namespace ns ON ns.oid=cls.relnamespace
WHERE con.contype IN ('p','u') ORDER BY ns.nspname,cls.relname,con.conname;

\echo '== FK_DEPENDENCY_GRAPH =='
SELECT child_ns.nspname AS child_schema, child.relname AS child_table,
       parent_ns.nspname AS parent_schema, parent.relname AS parent_table,
       con.conname, pg_get_constraintdef(con.oid) AS definition,
       CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT'
         WHEN 'a' THEN 'NO ACTION' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid
JOIN pg_namespace child_ns ON child_ns.oid=child.relnamespace
JOIN pg_class parent ON parent.oid=con.confrelid
JOIN pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
WHERE con.contype='f' ORDER BY child_ns.nspname,child.relname,con.conname;

\echo '== TRIGGER_INVENTORY =='
SELECT ns.nspname AS schema_name, cls.relname AS table_name, t.tgname,
       t.tgenabled, p.proname AS function_name, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class cls ON cls.oid=t.tgrelid
JOIN pg_namespace ns ON ns.oid=cls.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal ORDER BY ns.nspname,cls.relname,t.tgname;

\echo '== UAT_SIGNAL_CAPABILITY =='
SELECT table_schema,table_name,
       bool_or(column_name IN ('run_id','source')) AS has_run_or_source,
       bool_or(column_name IN ('created_at','updated_at')) AS has_timestamps,
       bool_or(column_name IN ('created_by','company_code','store_code','warehouse_code','farm_code')) AS has_scope_fields,
       bool_or(column_name IN ('order_no','po_no','ref_no','batch_no','transfer_no','pilot_run_id')) AS has_business_numbers
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema')
GROUP BY table_schema,table_name ORDER BY table_schema,table_name;

ROLLBACK;
