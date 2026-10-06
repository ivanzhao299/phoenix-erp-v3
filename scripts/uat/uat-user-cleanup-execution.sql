-- Phoenix ERP V3 — U2C guarded pilot_wms cleanup template
-- U2C guarded execution template. Production execution requires explicit -v flags.
-- Exact target: user_id=298, username=pilot_wms, status=0.
-- Default is DRY_RUN=true and PRODUCTION_DELETE_AUTHORIZED=false.
-- Never widen this predicate to a username prefix or a multi-user batch.

\if :{?DRY_RUN}
\else
  \set DRY_RUN true
\endif

\if :{?PRODUCTION_DELETE_AUTHORIZED}
\else
  \set PRODUCTION_DELETE_AUTHORIZED false
\endif

BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

-- Target identity and all preconditions are rechecked at T0.
DO $$
DECLARE
  locked_user_id bigint;
BEGIN
  IF current_database() <> 'phoenix_erp' THEN
    RAISE EXCEPTION 'wrong database: %', current_database();
  END IF;
  SELECT user_id INTO STRICT locked_user_id
  FROM public.sys_user
  WHERE user_id = 298 AND username = 'pilot_wms' AND status = 0
  FOR UPDATE;
  IF (SELECT count(*) FROM public.sys_user_role WHERE user_id = 298) <> 0 THEN
    RAISE EXCEPTION 'unexpected CASCADE role rows';
  END IF;
  IF (SELECT count(*) FROM public.sys_user_permission_set WHERE user_id = 298) <> 0 THEN
    RAISE EXCEPTION 'unexpected CASCADE permission-set rows';
  END IF;
  IF (SELECT count(*) FROM public.sys_user_orgs WHERE user_id = 298) <> 0
     OR (SELECT count(*) FROM public.sys_user_project_scopes WHERE user_id = 298) <> 0
     OR (SELECT count(*) FROM public.sys_user_warehouse_scopes WHERE user_id = 298) <> 0
     OR (SELECT count(*) FROM public.sys_user_farm_scopes WHERE user_id = 298) <> 0 THEN
    RAISE EXCEPTION 'unexpected active scope rows';
  END IF;
  IF (SELECT count(*) FROM public.pkg_packing_events WHERE actor_id = 298) <> 0
     OR (SELECT count(*) FROM public.pkg_packing_operations WHERE actor_id = 298) <> 0
     OR (SELECT count(*) FROM public.store_memberships WHERE user_id = 298) <> 0 THEN
    RAISE EXCEPTION 'unexpected NO ACTION history rows';
  END IF;
  IF (SELECT count(*) FROM public.sys_permission_set WHERE created_by = 298) <> 0
     OR (SELECT count(*) FROM public.sys_user_permission_set WHERE granted_by = 298) <> 0
     OR (SELECT count(*) FROM public.sys_user_role WHERE granted_by = 298) <> 0 THEN
    RAISE EXCEPTION 'unexpected SET NULL/NO ACTION attribution rows';
  END IF;
  IF (SELECT count(*) FROM public.sys_audit_log WHERE user_id = 298 OR user_name = 'pilot_wms') <> 0
     OR (SELECT count(*) FROM public.sys_operation_logs WHERE user_id = 298 OR username = 'pilot_wms') <> 0
     OR (SELECT count(*) FROM public.sys_notifications WHERE user_id = 298) <> 0 THEN
    RAISE EXCEPTION 'unexpected audit/notification rows';
  END IF;
  IF (SELECT count(*) FROM public.sal_price_books WHERE created_by = 'pilot_wms') <> 0
     OR (SELECT count(*) FROM public.wms_outbound WHERE operator = 'pilot_wms') <> 0
     OR (SELECT count(*) FROM public.wms_inbound WHERE operator = 'pilot_wms') <> 0
     OR (SELECT count(*) FROM public.wms_transfer WHERE operator = 'pilot_wms') <> 0 THEN
    RAISE EXCEPTION 'unexpected logical business rows';
  END IF;
  IF (SELECT last_login_at FROM public.sys_user WHERE user_id = 298) IS NOT NULL THEN
    RAISE EXCEPTION 'target has a login timestamp';
  END IF;
END $$;

SELECT 'WOULD_DELETE_USERS' AS check_name,
       count(*) AS rows
FROM public.sys_user
WHERE user_id = 298 AND username = 'pilot_wms' AND status = 0;

SELECT 'WOULD_DELETE_CASCADE_ROLE_ROWS' AS check_name,
       count(*) AS rows
FROM public.sys_user_role
WHERE user_id = 298;

\if :DRY_RUN
  \echo 'DRY_RUN=true: no production delete is executed'
  ROLLBACK;
\else
  \if :PRODUCTION_DELETE_AUTHORIZED
    DO $$
    DECLARE
      deleted_rows bigint;
    BEGIN
      DELETE FROM public.sys_user
      WHERE user_id = 298 AND username = 'pilot_wms' AND status = 0;
      GET DIAGNOSTICS deleted_rows = ROW_COUNT;
      IF deleted_rows <> 1 THEN
        RAISE EXCEPTION 'exact delete row count was %, expected 1', deleted_rows;
      END IF;
    END $$;
    COMMIT;
    \echo 'DELETE committed only when an independently approved T0 authorization was supplied'
  \else
    \echo 'PRODUCTION_DELETE_AUTHORIZED=false: refusing destructive execution'
    ROLLBACK;
  \endif
\endif
