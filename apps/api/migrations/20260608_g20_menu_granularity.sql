-- ═════════════════════════════════════════════════════════════════════════════
-- G20-2 · menu_code 粒度治理 — A1 欠债根治
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：宋明光持 MENU_FIN2_CASH:V,C,E 后**可新建银行账户**。
--   root cause: MENU_FIN2_CASH 一个 menu 包含 [账户主档+收付记账+流水查询]
--               三种语义不可独立赋权 → 给"记账权"的同时不可避免给了"建账户权"。
--
-- 改动：
--   § 1. 加子 menu (sys_menu)：
--        · MENU_FIN2_CASH_MASTER  现金账户主档（建/改/停用账户）
--        · MENU_FIN2_CASH_TXN     现金收付记账（收/付款流水）
--        · MENU_FIN2_CASH_VIEW    现金账户/流水查看
--        旧 MENU_FIN2_CASH 保留为 parent，向后兼容
--   § 2. 收回宋明光（ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR）的 MENU_FIN2_CASH
--        改为：MENU_FIN2_CASH_VIEW:V + MENU_FIN2_CASH_TXN:V,C （只能查+记账，不能建账户）
--   § 3. bump 宋明光 perms_version 强制 JWT 刷新
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  cash_master_id INTEGER;
  cash_txn_id    INTEGER;
  cash_view_id   INTEGER;
  parent_id      INTEGER;
  role_id_var    INTEGER;
BEGIN
  -- § 1. 加子 menu
  -- sys_menu 实列：menu_id/menu_code/menu_name_zh/menu_name_lo/domain/parent_code/sort_order/icon/route
  -- 无 menu_name_en / status 列（之前 mig 写法错）
  IF NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='MENU_FIN2_CASH_MASTER') THEN
    INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order)
    VALUES ('MENU_FIN2_CASH_MASTER', '现金账户主档', '', 'FIN2', 'MENU_FIN2_CASH', 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='MENU_FIN2_CASH_TXN') THEN
    INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order)
    VALUES ('MENU_FIN2_CASH_TXN', '现金收付记账', '', 'FIN2', 'MENU_FIN2_CASH', 20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='MENU_FIN2_CASH_VIEW') THEN
    INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order)
    VALUES ('MENU_FIN2_CASH_VIEW', '现金账户查看', '', 'FIN2', 'MENU_FIN2_CASH', 30);
  END IF;

  RAISE NOTICE '[g20-2] § 1 现金子 menu 已 seed';

  -- § 2. 宋明光角色权限调整
  SELECT role_id INTO role_id_var FROM sys_role WHERE role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR';
  IF role_id_var IS NOT NULL THEN
    -- 收回 MENU_FIN2_CASH 父 menu 的 C,E（保留 V 看 KPI、看历史流水）
    UPDATE sys_role_menu_permission
       SET perm_codes='V'
     WHERE role_id=role_id_var
       AND menu_id=(SELECT menu_id FROM sys_menu WHERE menu_code='MENU_FIN2_CASH');

    -- 加子 menu 权限：MENU_FIN2_CASH_VIEW:V （看账户列表+流水）
    SELECT menu_id INTO cash_view_id FROM sys_menu WHERE menu_code='MENU_FIN2_CASH_VIEW';
    IF cash_view_id IS NOT NULL THEN
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      VALUES (role_id_var, cash_view_id, 'V')
      ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes='V';
    END IF;

    -- 加子 menu 权限：MENU_FIN2_CASH_TXN:V,C （记收付流水）
    SELECT menu_id INTO cash_txn_id FROM sys_menu WHERE menu_code='MENU_FIN2_CASH_TXN';
    IF cash_txn_id IS NOT NULL THEN
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      VALUES (role_id_var, cash_txn_id, 'V,C')
      ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes='V,C';
    END IF;

    -- 显式不给 MENU_FIN2_CASH_MASTER 任何权 → 宋明光看不到"新建账户"按钮
    RAISE NOTICE '[g20-2] § 2 宋明光权限收口完成（无 MASTER:C，有 TXN:V,C）';
  END IF;

  -- § 3. bump perms_version 强制 JWT 刷新
  UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1 WHERE username='songmingguang';
END $body$;

COMMIT;

-- ─── 验证 ───────────────────────────────────────────
-- SELECT menu_code FROM sys_menu WHERE menu_code LIKE 'MENU_FIN2_CASH%';
-- SELECT m.menu_code, rmp.perm_codes FROM sys_role_menu_permission rmp
--   JOIN sys_menu m ON m.menu_id=rmp.menu_id
--   JOIN sys_role r ON r.role_id=rmp.role_id
--  WHERE r.role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR' AND m.menu_code LIKE 'MENU_FIN2_CASH%';
