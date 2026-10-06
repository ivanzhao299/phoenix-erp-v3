-- PHOENIX ERP V3 — R0 read-only inventory
-- This file is an inventory source only. It must not be used for cleanup.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

SELECT current_database() AS target_database,
       current_user AS database_user,
       current_setting('server_version') AS server_version;
SELECT system_identifier FROM pg_control_system();

SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.oid::bigint AS table_oid,
       c.reltuples::bigint AS estimated_rows,
       pg_total_relation_size(c.oid)::bigint AS total_size_bytes,
       CASE c.relkind WHEN 'r' THEN 'ordinary' WHEN 'p' THEN 'partitioned' ELSE c.relkind::text END AS relation_kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p')
  AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY n.nspname, c.relname;

SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null,
       pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE c.relkind IN ('r','p')
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY n.nspname, c.relname, a.attnum;

SELECT con.oid::bigint AS constraint_oid,
       child_ns.nspname AS child_schema,
       child.relname AS child_table,
       con.conname AS constraint_name,
       parent_ns.nspname AS parent_schema,
       parent.relname AS parent_table,
       pg_get_constraintdef(con.oid, true) AS constraint_definition,
       CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE con.confdeltype::text END AS on_delete,
       CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE con.confupdtype::text END AS on_update
FROM pg_constraint con
JOIN pg_class child ON child.oid = con.conrelid
JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
JOIN pg_class parent ON parent.oid = con.confrelid
JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
WHERE con.contype = 'f'
ORDER BY child_ns.nspname, child.relname, con.conname;

SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       t.tgname AS trigger_name,
       t.tgenabled AS enabled,
       pg_get_triggerdef(t.oid, true) AS trigger_definition,
       p.oid::bigint AS function_oid,
       p.proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
ORDER BY n.nspname, c.relname, t.tgname;

ROLLBACK;
