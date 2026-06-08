-- ═════════════════════════════════════════════════════════════════════════════
-- G35 · fin_cash 父子菜单粒度统一（前后端权限一致性治理）
-- ═════════════════════════════════════════════════════════════════════════════
-- A1 延伸欠债（G34 暴露）：
--   后端 fin-cash.controller.ts 17 endpoint 全用父菜单 MENU_FIN2_CASH
--   前端 page.tsx 已按子菜单 (MASTER/TXN/VIEW) 分流
--   G34 临时给王玮华 MENU_FIN2_CASH:V,C 父菜单兜底
--
-- 本 mig 三步：
--   A. 新建 MENU_FIN2_CASH_TRANSFER 子菜单（转账业务）
--   B. 6 老角色父菜单 perm_codes → 复制到 4 子菜单（避免 controller 改子菜单后 regression）
--   C. 收回 ROLE_MENGSAI_DONGPENG_TREASURER 父菜单 C 兜底（保留 V 让侧栏树展开）
--
-- 配合 commit：fin-cash.controller.ts 改 17 endpoint @RequireMenu 按子菜单
-- 幂等：所有 INSERT NOT EXISTS / ON CONFLICT DO NOTHING；UPDATE 限定 WHERE
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── A. 新建 MENU_FIN2_CASH_TRANSFER 子菜单 ─────────────────────────────────
INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order)
SELECT 'MENU_FIN2_CASH_TRANSFER', '资金转账', 'Fund Transfer', 'FINANCE', 'MENU_FIN2_CASH', 40
 WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='MENU_FIN2_CASH_TRANSFER');

-- ─── B. 6 老角色父菜单 perm_codes 下沉到 4 子菜单 ────────────────────────────
-- 规则：父菜单 perm_codes 完整复制到 MASTER/TXN/VIEW/TRANSFER 4 子菜单
--       VIEW 只保留 V（其他权限对 VIEW 无意义）
WITH old_perms AS (
  SELECT r.role_id, r.role_code, p.perm_codes
    FROM sys_role r
    JOIN sys_role_menu_permission p ON p.role_id=r.role_id
    JOIN sys_menu m ON m.menu_id=p.menu_id
   WHERE m.menu_code='MENU_FIN2_CASH'
     AND r.role_code IN ('ROLE_ADMIN','ROLE_CASH','ROLE_FIN_ACCT','ROLE_FIN_CFO','ROLE_HQ_FINANCE','ROLE_TREASURY_MANAGER')
)
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT op.role_id, m.menu_id, op.perm_codes
  FROM old_perms op, sys_menu m
 WHERE m.menu_code IN ('MENU_FIN2_CASH_MASTER','MENU_FIN2_CASH_TXN','MENU_FIN2_CASH_TRANSFER')
   AND NOT EXISTS (
     SELECT 1 FROM sys_role_menu_permission x
      WHERE x.role_id=op.role_id AND x.menu_id=m.menu_id
   );

-- VIEW 子菜单只给 V
WITH old_view AS (
  SELECT r.role_id, r.role_code
    FROM sys_role r
    JOIN sys_role_menu_permission p ON p.role_id=r.role_id
    JOIN sys_menu m ON m.menu_id=p.menu_id
   WHERE m.menu_code='MENU_FIN2_CASH'
     AND r.role_code IN ('ROLE_ADMIN','ROLE_CASH','ROLE_FIN_ACCT','ROLE_FIN_CFO','ROLE_HQ_FINANCE','ROLE_TREASURY_MANAGER')
     AND p.perm_codes ~ 'V'
)
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT ov.role_id, m.menu_id, 'V'
  FROM old_view ov, sys_menu m
 WHERE m.menu_code='MENU_FIN2_CASH_VIEW'
   AND NOT EXISTS (
     SELECT 1 FROM sys_role_menu_permission x
      WHERE x.role_id=ov.role_id AND x.menu_id=m.menu_id
   );

-- ─── C. 收回王玮华父菜单 C 兜底（保 V）──────────────────────────────────────
UPDATE sys_role_menu_permission
   SET perm_codes='V'
 WHERE role_id = (SELECT role_id FROM sys_role WHERE role_code='ROLE_MENGSAI_DONGPENG_TREASURER')
   AND menu_id = (SELECT menu_id FROM sys_menu WHERE menu_code='MENU_FIN2_CASH')
   AND perm_codes='V,C';

-- ─── D. perms_version+=1 触发所有受影响用户 token 失效 ───────────────────────
UPDATE sys_user
   SET perms_version = perms_version + 1, updated_at = now()
 WHERE user_id IN (
   SELECT DISTINCT ur.user_id
     FROM sys_user_role ur
     JOIN sys_role r ON r.role_id=ur.role_id
    WHERE r.role_code IN (
      'ROLE_ADMIN','ROLE_CASH','ROLE_FIN_ACCT','ROLE_FIN_CFO',
      'ROLE_HQ_FINANCE','ROLE_TREASURY_MANAGER',
      'ROLE_MENGSAI_DONGPENG_TREASURER','ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR'
    )
 );

COMMIT;
