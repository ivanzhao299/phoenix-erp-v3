\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';
SELECT child_ns.nspname AS child_schema,child.relname AS child_table,
       parent_ns.nspname AS parent_schema,parent.relname AS parent_table,con.conname,
       pg_get_constraintdef(con.oid) AS definition,
       CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT'
       WHEN 'a' THEN 'NO ACTION' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid
JOIN pg_namespace child_ns ON child_ns.oid=child.relnamespace
JOIN pg_class parent ON parent.oid=con.confrelid
JOIN pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
WHERE con.contype='f' ORDER BY child_ns.nspname,child.relname,con.conname;
ROLLBACK;
