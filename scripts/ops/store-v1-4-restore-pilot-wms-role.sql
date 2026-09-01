\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sys_user_role(user_id,role_id)
SELECT u.user_id,r.role_id FROM sys_user u CROSS JOIN sys_role r
 WHERE u.username='pilot_wms' AND u.status=0 AND r.role_code='ROLE_WMS_MGR'
ON CONFLICT DO NOTHING;
COMMIT;
