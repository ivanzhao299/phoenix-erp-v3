\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';
SELECT current_database() AS database_name, current_setting('server_version') AS server_version,
       current_setting('data_directory') AS data_directory,
       (SELECT system_identifier FROM pg_control_system()) AS system_identifier;
ROLLBACK;
