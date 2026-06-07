-- ═════════════════════════════════════════════════════════════════════════════
-- G12 · 宋明光（ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR）权限扩展
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务方明确的 4 项权限缺口：
--   1. MENU_FARM_FEED          饲料消耗记录（先 INSERT 注册，再 GRANT）
--   2. MENU_WMS_INOUT          原料出库 V,C → V,C,E（补 E 编辑权）
--   3. MENU_INV_MANUAL_INBOUND 手工入库 V,C → V,C,E（同上）
--   4. MENU_FARM_DATA          鸡群档案 V → V,C,E（业务方明确：可编辑鸡群）
--
-- 所有改动用 DO $body$ + EXISTS 兜底，CI 测试库可跳过。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  song_role_id BIGINT;
  feed_menu_id BIGINT;
  wms_inout_menu_id BIGINT;
  manual_inbound_menu_id BIGINT;
  farm_data_menu_id BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='sys_role_menu_permission') THEN
    RAISE NOTICE '[g12] sys_role_menu_permission 不存在（CI），跳过';
    RETURN;
  END IF;

  -- § 1. 确保 MENU_FARM_FEED 在 sys_menu 注册（生产端不存在）
  IF NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='MENU_FARM_FEED') THEN
    INSERT INTO sys_menu (menu_code, menu_name_zh, domain, parent_code, sort_order, icon, route)
    VALUES ('MENU_FARM_FEED', '饲料消耗记录', 'breeding', 'MENU_FARM_DATA', 35, 'Wheat', '/breeding/feed');
    RAISE NOTICE '[g12] sys_menu 注册 MENU_FARM_FEED';
  END IF;

  -- 拉关键 ID
  SELECT role_id INTO song_role_id FROM sys_role WHERE role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR';
  IF song_role_id IS NULL THEN
    RAISE NOTICE '[g12] 宋明光角色不存在，跳过';
    RETURN;
  END IF;
  SELECT menu_id INTO feed_menu_id           FROM sys_menu WHERE menu_code='MENU_FARM_FEED';
  SELECT menu_id INTO wms_inout_menu_id      FROM sys_menu WHERE menu_code='MENU_WMS_INOUT';
  SELECT menu_id INTO manual_inbound_menu_id FROM sys_menu WHERE menu_code='MENU_INV_MANUAL_INBOUND';
  SELECT menu_id INTO farm_data_menu_id      FROM sys_menu WHERE menu_code='MENU_FARM_DATA';

  -- § 2. 授权 MENU_FARM_FEED V,C,E (INSERT NOT EXISTS)
  IF feed_menu_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sys_role_menu_permission WHERE role_id=song_role_id AND menu_id=feed_menu_id
  ) THEN
    INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
    VALUES (song_role_id, feed_menu_id, 'V,C,E');
    RAISE NOTICE '[g12] +MENU_FARM_FEED:V,C,E';
  END IF;

  -- § 3. 升级 MENU_WMS_INOUT V,C → V,C,E
  IF wms_inout_menu_id IS NOT NULL THEN
    UPDATE sys_role_menu_permission
       SET perm_codes='V,C,E'
     WHERE role_id=song_role_id AND menu_id=wms_inout_menu_id AND perm_codes <> 'V,C,E';
    IF FOUND THEN RAISE NOTICE '[g12] MENU_WMS_INOUT 升级 → V,C,E'; END IF;
  END IF;

  -- § 4. 升级 MENU_INV_MANUAL_INBOUND V,C → V,C,E
  IF manual_inbound_menu_id IS NOT NULL THEN
    UPDATE sys_role_menu_permission
       SET perm_codes='V,C,E'
     WHERE role_id=song_role_id AND menu_id=manual_inbound_menu_id AND perm_codes <> 'V,C,E';
    IF FOUND THEN RAISE NOTICE '[g12] MENU_INV_MANUAL_INBOUND 升级 → V,C,E'; END IF;
  END IF;

  -- § 5. 升级 MENU_FARM_DATA V → V,C,E（业务方明确：宋明光可编辑鸡群档案）
  IF farm_data_menu_id IS NOT NULL THEN
    UPDATE sys_role_menu_permission
       SET perm_codes='V,C,E'
     WHERE role_id=song_role_id AND menu_id=farm_data_menu_id AND perm_codes <> 'V,C,E';
    IF FOUND THEN RAISE NOTICE '[g12] MENU_FARM_DATA 升级 → V,C,E'; END IF;
  END IF;
END $body$;

COMMIT;

-- ─── 验证 SQL ─────────────────────────────────────────
-- SELECT m.menu_code, p.perm_codes
--   FROM sys_role_menu_permission p
--   JOIN sys_role r ON r.role_id=p.role_id
--   JOIN sys_menu m ON m.menu_id=p.menu_id
--  WHERE r.role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR'
--    AND m.menu_code IN ('MENU_FARM_FEED','MENU_WMS_INOUT','MENU_INV_MANUAL_INBOUND','MENU_FARM_DATA')
--  ORDER BY m.menu_code;

-- ─── 回滚 ─────────────────────────────────────────────
-- UPDATE sys_role_menu_permission SET perm_codes='V,C' WHERE role_id=(SELECT role_id FROM sys_role WHERE role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR') AND menu_id IN (SELECT menu_id FROM sys_menu WHERE menu_code IN ('MENU_WMS_INOUT','MENU_INV_MANUAL_INBOUND'));
-- UPDATE sys_role_menu_permission SET perm_codes='V'   WHERE role_id=... AND menu_id=(SELECT menu_id FROM sys_menu WHERE menu_code='MENU_FARM_DATA');
-- DELETE FROM sys_role_menu_permission WHERE role_id=... AND menu_id=(SELECT menu_id FROM sys_menu WHERE menu_code='MENU_FARM_FEED');
-- DELETE FROM sys_menu WHERE menu_code='MENU_FARM_FEED';
