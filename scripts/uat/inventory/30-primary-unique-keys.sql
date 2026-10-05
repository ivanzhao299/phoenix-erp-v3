\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';
SELECT ns.nspname AS schema_name,cls.relname AS table_name,con.contype,con.conname,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class cls ON cls.oid=con.conrelid
JOIN pg_namespace ns ON ns.oid=cls.relnamespace
WHERE con.contype IN ('p','u') ORDER BY ns.nspname,cls.relname,con.conname;
ROLLBACK;
