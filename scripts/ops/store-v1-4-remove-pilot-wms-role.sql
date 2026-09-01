\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF (SELECT status FROM sys_user WHERE username='pilot_wms') <> 0 THEN
    RAISE EXCEPTION 'pilot_wms must remain INACTIVE';
  END IF;
END $$;
DELETE FROM sys_user_role ur USING sys_user u,sys_role r
 WHERE ur.user_id=u.user_id AND ur.role_id=r.role_id AND u.username='pilot_wms' AND r.role_code='ROLE_WMS_MGR'
 RETURNING ur.user_id,ur.role_id;
COMMIT;
