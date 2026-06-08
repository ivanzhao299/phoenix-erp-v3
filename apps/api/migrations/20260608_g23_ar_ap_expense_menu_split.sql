-- ═════════════════════════════════════════════════════════════════════════════
-- G23-A · AR/AP/EXPENSE menu 粒度治理（A1 完整收口，同 G20-2 CASH 模式）
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  parent_menu RECORD;
  sub_seed RECORD;
BEGIN
  FOR parent_menu IN
    SELECT * FROM (VALUES
      ('MENU_FIN2_AR',      '应收账款'),
      ('MENU_FIN2_AP',      '应付账款'),
      ('MENU_FIN2_EXPENSE', '费用管理')
    ) AS t(parent_code, parent_zh)
  LOOP
    FOR sub_seed IN
      SELECT * FROM (VALUES
        ('_MASTER', '主档管理',  10),
        ('_TXN',    '业务流水',  20),
        ('_VIEW',   '查询查看',  30)
      ) AS s(suffix, suffix_zh, sort)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM sys_menu WHERE menu_code = parent_menu.parent_code || sub_seed.suffix
      ) THEN
        INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order)
        VALUES (
          parent_menu.parent_code || sub_seed.suffix,
          parent_menu.parent_zh || ' ' || sub_seed.suffix_zh,
          '',
          'FIN2',
          parent_menu.parent_code,
          sub_seed.sort
        );
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE '[g23-a] AR/AP/EXPENSE 9 个子 menu seed 完成';
END $body$;

-- ═════════════════════════════════════════════════════════════════════════════
-- § 权限继承：所有持父 MENU_FIN2_AR/AP/EXPENSE 权限的角色，自动获得子 menu 同等权
-- ═════════════════════════════════════════════════════════════════════════════
-- Why：前端按钮拆分为按子 menu 检查（如"新建 AR"→MENU_FIN2_AR_MASTER:C），
--      若不迁移权限，生产 finance 团队（持父 menu V,C,E）将看不到按钮 → 业务中断。
DO $body$
DECLARE
  v_parent_code TEXT;
  master_id INTEGER; txn_id INTEGER; view_id INTEGER;
  r RECORD;
BEGIN
  FOR v_parent_code IN
    SELECT * FROM (VALUES ('MENU_FIN2_AR'), ('MENU_FIN2_AP'), ('MENU_FIN2_EXPENSE')) AS t(code)
  LOOP
    SELECT menu_id INTO master_id FROM sys_menu WHERE menu_code = v_parent_code || '_MASTER';
    SELECT menu_id INTO txn_id    FROM sys_menu WHERE menu_code = v_parent_code || '_TXN';
    SELECT menu_id INTO view_id   FROM sys_menu WHERE menu_code = v_parent_code || '_VIEW';

    FOR r IN
      SELECT rmp.role_id, rmp.perm_codes
        FROM sys_role_menu_permission rmp
        JOIN sys_menu m ON m.menu_id = rmp.menu_id
       WHERE m.menu_code = v_parent_code
    LOOP
      -- 全部子 menu 继承父 perm_codes
      IF master_id IS NOT NULL THEN
        INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
        VALUES (r.role_id, master_id, r.perm_codes)
        ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;
      END IF;
      IF txn_id IS NOT NULL THEN
        INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
        VALUES (r.role_id, txn_id, r.perm_codes)
        ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;
      END IF;
      IF view_id IS NOT NULL THEN
        INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
        VALUES (r.role_id, view_id, 'V')  -- VIEW 始终只给 V
        ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = 'V';
      END IF;
    END LOOP;
  END LOOP;

  -- bump 所有持 FIN2_AR/AP/EXPENSE 权限的用户 perms_version 强制 JWT 刷新
  UPDATE sys_user u SET perms_version = COALESCE(perms_version, 0) + 1
   WHERE EXISTS (
     SELECT 1 FROM sys_user_role ur
       JOIN sys_role_menu_permission rmp ON rmp.role_id = ur.role_id
       JOIN sys_menu m ON m.menu_id = rmp.menu_id
      WHERE ur.user_id = u.user_id
        AND m.menu_code IN ('MENU_FIN2_AR', 'MENU_FIN2_AP', 'MENU_FIN2_EXPENSE')
   );

  RAISE NOTICE '[g23-a] 子 menu 权限继承完成（finance 团队不会业务中断）';
END $body$;

COMMIT;
