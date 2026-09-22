SELECT 'table' || E'\t' || n.nspname || '.' || c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
   AND c.relname NOT IN ('schema_migrations','migrations')
UNION ALL
SELECT 'column' || E'\t' || n.nspname || '.' || c.relname || '.' || a.attname || ':' || format_type(a.atttypid,a.atttypmod)
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind='r'
   AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
   AND c.relname NOT IN ('schema_migrations','migrations')
UNION ALL
SELECT 'constraint' || E'\t' || n.nspname || '.' || c.relname || '.' || con.conname || ':' || con.contype || ':' || pg_get_constraintdef(con.oid)
  FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relname NOT IN ('schema_migrations','migrations')
UNION ALL
SELECT 'index' || E'\t' || schemaname || '.' || indexname || ':' || indexdef
  FROM pg_indexes
 WHERE schemaname NOT IN ('pg_catalog','information_schema') AND tablename NOT IN ('schema_migrations','migrations')
UNION ALL
SELECT 'type' || E'\t' || n.nspname || '.' || t.typname || ':' || t.typtype
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND t.typtype IN ('e','d')
ORDER BY 1;
