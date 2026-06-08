-- ═════════════════════════════════════════════════════════════════════════════
-- G21 · 宋明光主数据中心权限补全
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务方反馈：宋明光新增了主数据中心功能但报 MENU_PERMISSION_DENIED。
-- 实证：宋明光持 MENU_MASTER_GRADE/PACKAGING/PRODUCT/SKU 共 4 个子 menu V 权限，
--      但 master-data-runtime/center.controller 全部 @RequireMenu('MENU_MASTER_DATA', 'V')
--      → 父 menu 权限缺失，MenuGuard 拒绝。
--
-- 业务上正确的修：给宋明光的角色补 MENU_MASTER_DATA:V （父级查看权）。
-- 注：业务方愿意给宋明光看主数据中心（产品/SKU/客户/供应商等），但不给 C/E（建主档）。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  role_id_var INTEGER;
  menu_id_var INTEGER;
BEGIN
  SELECT role_id INTO role_id_var FROM sys_role WHERE role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR';
  SELECT menu_id INTO menu_id_var FROM sys_menu WHERE menu_code='MENU_MASTER_DATA';

  IF role_id_var IS NOT NULL AND menu_id_var IS NOT NULL THEN
    INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
    VALUES (role_id_var, menu_id_var, 'V')
    ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes='V';
    RAISE NOTICE '[g21] 宋明光 MENU_MASTER_DATA:V 已补';
  END IF;

  -- bump perms_version 强制 JWT 刷新
  UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1 WHERE username='songmingguang';
END $body$;

COMMIT;
