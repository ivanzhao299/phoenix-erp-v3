-- Fixed preamble for every metadata query. No application bootstrap or writes.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SELECT json_build_object(
 'transaction_read_only', current_setting('transaction_read_only'),
 'default_transaction_read_only', current_setting('default_transaction_read_only'),
 'server_version_num', current_setting('server_version_num'),
 'role_safe', NOT EXISTS (
   SELECT 1 FROM pg_roles r WHERE pg_has_role(current_user,r.oid,'MEMBER')
   AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolname IN ('pg_execute_server_program','pg_write_server_files'))
 ) AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname <> current_user AND pg_has_role(current_user,r.oid,'MEMBER'))
   AND NOT has_database_privilege(current_database(),'CREATE')
   AND NOT has_database_privilege(current_database(),'TEMP')
   AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
     AND has_schema_privilege(n.oid,'CREATE'))
   AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND
       ((c.relkind IN ('r','p','v','f') AND has_table_privilege(c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'))
       OR (c.relkind='S' AND has_sequence_privilege(c.oid,'USAGE,UPDATE'))))
   AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND p.prosecdef
     AND has_function_privilege(p.oid,'EXECUTE'))
);
