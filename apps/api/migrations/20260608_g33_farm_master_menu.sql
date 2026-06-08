-- ═════════════════════════════════════════════════════════════════════════════
-- G33-B · 养殖主档 menu 粒度治理（A1 收口·宋明光建鸡舍漏洞）
-- ═════════════════════════════════════════════════════════════════════════════
-- 问题：UAT 实测宋明光持 MENU_FARM_DATA:V,C,E 可建 brd_houses（主档），
--      业务上他是生产数据主管，不该建鸡舍/农场主档。
--
-- 修法：拆 MENU_FARM_MASTER（主档管理） vs MENU_FARM_DATA（业务录入）
--   · brd_houses / brd_farms 后端走 fallbackMenu=MENU_FARM_MASTER
--   · brd_daily_logs / brd_medication_records 仍走 MENU_FARM_DATA
--   · 宋明光保留 MENU_FARM_DATA:V,C,E（业务录入），不给 MENU_FARM_MASTER
--   · ROLE_FARM_MGR / ROLE_FACTORY_MGR / ROLE_ADMIN 应持 MENU_FARM_MASTER
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  master_menu_id INTEGER;
  farm_mgr_role_id INTEGER;
  factory_mgr_role_id INTEGER;
BEGIN
  -- 1. 加 MENU_FARM_MASTER
  IF NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='MENU_FARM_MASTER') THEN
    INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order)
    VALUES ('MENU_FARM_MASTER', '养殖主档管理', '', 'BREEDING', 'MENU_FARM_DATA', 10);
  END IF;

  SELECT menu_id INTO master_menu_id FROM sys_menu WHERE menu_code='MENU_FARM_MASTER';

  -- 2. 给 ROLE_FARM_MGR / ROLE_FACTORY_MGR 默认全权（V,C,E）
  SELECT role_id INTO farm_mgr_role_id    FROM sys_role WHERE role_code='ROLE_FARM_MGR';
  SELECT role_id INTO factory_mgr_role_id FROM sys_role WHERE role_code='ROLE_FACTORY_MGR';

  IF farm_mgr_role_id IS NOT NULL AND master_menu_id IS NOT NULL THEN
    INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
    VALUES (farm_mgr_role_id, master_menu_id, 'V,C,E,D')
    ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes='V,C,E,D';
  END IF;

  IF factory_mgr_role_id IS NOT NULL AND master_menu_id IS NOT NULL THEN
    INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
    VALUES (factory_mgr_role_id, master_menu_id, 'V,C,E,D')
    ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes='V,C,E,D';
  END IF;

  -- 3. 宋明光（ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR）显式不给 MASTER 权
  --    保留 MENU_FARM_DATA:V,C,E（业务录入），不持 MASTER → 建鸡舍/农场主档被拒

  -- 4. bump perms_version 强制 JWT 刷新
  UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1
    WHERE username IN ('songmingguang')
       OR EXISTS (SELECT 1 FROM sys_user_role ur WHERE ur.user_id=sys_user.user_id
                    AND ur.role_id IN (farm_mgr_role_id, factory_mgr_role_id));

  RAISE NOTICE '[g33] MENU_FARM_MASTER seed + 默认 V,C,E,D 给 FARM_MGR/FACTORY_MGR';
END $body$;

COMMIT;
