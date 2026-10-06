-- Phoenix ERP V3 — U2C pilot_wms postcheck template
-- Read-only. Run only after a separately authorized T0 execution.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

SELECT current_database(), current_setting('server_version'),
       (SELECT system_identifier FROM pg_control_system());
SELECT count(*) AS remaining_target_rows
FROM public.sys_user
WHERE user_id = 298 OR username = 'pilot_wms';
SELECT count(*) AS remaining_role_rows
FROM public.sys_user_role
WHERE user_id = 298;
SELECT count(*) AS remaining_permission_set_rows
FROM public.sys_user_permission_set
WHERE user_id = 298;
SELECT count(*) AS remaining_scope_rows
FROM public.sys_user_orgs WHERE user_id = 298;
SELECT count(*) AS remaining_project_scope_rows
FROM public.sys_user_project_scopes WHERE user_id = 298;
SELECT count(*) AS remaining_warehouse_scope_rows
FROM public.sys_user_warehouse_scopes WHERE user_id = 298;
ROLLBACK;
