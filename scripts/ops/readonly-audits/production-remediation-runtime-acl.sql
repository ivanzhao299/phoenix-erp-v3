-- Single read-only query, run under the real API login (no SET ROLE impersonation).
-- Recheck on the pinned database after expansion. ABSENT is never proof of access.
WITH requirements(rel, need_insert, need_row_lock) AS (VALUES
  ('production_inbound_reissues', true, false),
  ('production_finance_review_files', true, true),
  ('production_cutover_state_receipts', true, false),
  ('production_cutover_state_origins', false, false)
), api_access AS (
  SELECT rel, CASE
    WHEN c.oid IS NULL THEN 'ABSENT'
    WHEN NOT has_table_privilege(current_user,c.oid,'SELECT') THEN 'MISSING_SELECT'
    WHEN need_insert AND NOT has_table_privilege(current_user,c.oid,'INSERT') THEN 'MISSING_INSERT'
    WHEN need_row_lock AND NOT has_any_column_privilege(current_user,c.oid,'UPDATE') THEN 'MISSING_ROW_LOCK_PRIVILEGE'
    ELSE 'AVAILABLE' END AS status
  FROM requirements LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||rel)
), reachable AS (
  -- Include SET-only memberships as well as immediately inherited privileges.
  SELECT oid,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolname
  FROM pg_roles WHERE pg_has_role(current_user,oid,'MEMBER') OR rolname=current_user
), protected_tables(rel) AS (VALUES
  ('production_cutover_control_environments'),('production_cutover_apply_admissions'),('production_cutover_apply_results')
), protected_access AS (
  SELECT rel,CASE WHEN c.oid IS NULL THEN 'ABSENT'
    WHEN EXISTS (SELECT 1 FROM reachable r WHERE
      pg_has_role(r.oid,c.relowner,'MEMBER') OR
      has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') OR
      has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE,REFERENCES')) THEN 'WRITABLE' ELSE 'PROTECTED' END AS status
  FROM protected_tables LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||rel)
), forbidden(fn) AS (VALUES
  ('consume_production_cutover_admission(uuid,text)'),('record_production_cutover_apply_result(uuid)'),
  ('lock_production_cutover_authority(uuid)')
), function_access AS (
  SELECT fn,CASE WHEN f.oid IS NULL THEN 'ABSENT'
    WHEN EXISTS(SELECT 1 FROM reachable r WHERE pg_has_role(r.oid,f.proowner,'MEMBER')
      OR has_function_privilege(r.oid,f.oid,'EXECUTE')) THEN 'EXECUTABLE' ELSE 'PROTECTED' END AS status
  FROM forbidden LEFT JOIN pg_proc f ON f.oid=to_regprocedure('public.'||fn)
), identity AS (
  SELECT EXISTS(SELECT 1 FROM reachable r WHERE r.rolsuper OR r.rolcreaterole OR r.rolcreatedb
    OR r.rolreplication OR r.rolbypassrls OR r.rolname IN ('pg_read_server_files','pg_write_server_files','pg_execute_server_program')
    OR has_schema_privilege(r.oid,'public','CREATE') OR has_database_privilege(r.oid,current_database(),'CREATE')
    OR has_parameter_privilege(r.oid,'session_replication_role','SET')) AS elevated
)
SELECT jsonb_build_object('currentIsSessionUser',current_user=session_user,'elevated',identity.elevated,
  'business',(SELECT jsonb_object_agg(rel,status) FROM api_access),
  'controlTables',(SELECT jsonb_object_agg(rel,status) FROM protected_access),
  'executorFunctions',(SELECT jsonb_object_agg(fn,status) FROM function_access),
  'result',CASE WHEN identity.elevated OR EXISTS(SELECT 1 FROM protected_access WHERE status<>'PROTECTED')
    OR EXISTS(SELECT 1 FROM function_access WHERE status<>'PROTECTED') THEN 'ROLE_BOUNDARY_HOLD'
    WHEN EXISTS(SELECT 1 FROM api_access WHERE status='ABSENT') THEN 'EXPANSION_NOT_INSTALLED'
    WHEN EXISTS(SELECT 1 FROM api_access WHERE status<>'AVAILABLE') THEN 'MISSING_BUSINESS_ACCESS'
    WHEN current_user<>session_user THEN 'SESSION_IDENTITY_HOLD'
    ELSE 'READY' END)
FROM identity;
