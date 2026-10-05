\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';
SELECT ns.nspname AS schema_name,cls.relname AS table_name,t.tgname,t.tgenabled,
       p.proname AS function_name,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class cls ON cls.oid=t.tgrelid
JOIN pg_namespace ns ON ns.oid=cls.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal ORDER BY ns.nspname,cls.relname,t.tgname;
ROLLBACK;
