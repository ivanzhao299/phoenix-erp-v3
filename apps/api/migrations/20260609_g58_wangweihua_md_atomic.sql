-- ════════════════════════════════════════════════════════════════════════
-- G58：王玮华（孟赛东鹏出纳）主数据权限原子收紧
-- ════════════════════════════════════════════════════════════════════════
-- 用户反馈：主数据权限应按实际使用原子级开放。
-- 现状：ROLE_MENGSAI_DONGPENG_TREASURER 持 MENU_MASTER_DATA:V（超级码，G56-B 下
--   看到全部主数据只读）。出纳本职 = 资金/银行账户 → 收紧到专属码。
-- 动作：移除超级码，授 MENU_MD_CASH_ACCOUNT:V + MENU_MD_BANK_ACCOUNT:V。
-- 影响：仅该角色（1 用户 wangweihua）。其余财务权限（CASH/CASH_TXN/AR/AP/EXPENSE/
--   SHAREHOLDER/REPORT）不动。
-- 幂等：DELETE WHERE + ON CONFLICT。
-- ════════════════════════════════════════════════════════════════════════

-- 1) 授资金账户 + 银行账户 专属码（出纳本职）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V'
FROM (VALUES ('MENU_MD_CASH_ACCOUNT'), ('MENU_MD_BANK_ACCOUNT')) AS g(menu_code)
JOIN sys_menu m ON m.menu_code = g.menu_code
JOIN sys_role r ON r.role_code = 'ROLE_MENGSAI_DONGPENG_TREASURER'
ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes;

-- 2) 移除超级码 MENU_MASTER_DATA
DELETE FROM sys_role_menu_permission p
USING sys_role r, sys_menu m
WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
  AND r.role_code = 'ROLE_MENGSAI_DONGPENG_TREASURER'
  AND m.menu_code = 'MENU_MASTER_DATA';

-- 3) 递增 perms_version 强制重登刷新菜单
UPDATE sys_user SET perms_version = COALESCE(perms_version,1) + 1
WHERE user_id IN (
  SELECT ur.user_id FROM sys_user_role ur JOIN sys_role r ON r.role_id = ur.role_id
  WHERE r.role_code = 'ROLE_MENGSAI_DONGPENG_TREASURER'
);
