-- Break-glass rollback for workflow Treasurer Store Payment Approved Production Execution.
-- Execute only with a separate rollback approval. The permission trigger will bump
-- wangweihua.perms_version again, invalidating the token minted after the grant.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM sys_role_menu_permission rmp
  USING sys_role r, sys_menu m
  WHERE rmp.role_id=r.role_id
    AND rmp.menu_id=m.menu_id
    AND r.role_code='ROLE_MENGSAI_DONGPENG_TREASURER'
    AND m.menu_code='MENU_STORE_PAYMENT'
    AND replace(rmp.perm_codes,' ','')='V,E';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 1 THEN
    RAISE EXCEPTION 'expected one exact rollback target, got %',deleted_count;
  END IF;
END $$;
COMMIT;
