-- ═════════════════════════════════════════════════════════════════════════════
-- G189 — 王玮华 现金账户初始化对齐 临时补权
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：王玮华反映两个现金账户(CASH_LAK / CASH_CNY)的导入期初不准、有重复，需自行
--   修正期初余额并批量删除导入的初始化流水。她现持 MENU_FIN2_CASH_MASTER 无 E、
--   MENU_FIN2_CASH_TXN 无 D，故"无法更改"。
-- 本迁移给其角色 ROLE_MENGSAI_DONGPENG_TREASURER 临时补：
--   - MENU_FIN2_CASH_MASTER: +E  (编辑期初 / 重算余额)
--   - MENU_FIN2_CASH_TXN:    +D  (批量删除无源单据流水)
-- 初始化对齐完成后可发收回迁移撤回 E/D。
-- 列以 ddl/01_create_rbac_tables.sql 为准：role_id / menu_id / perm_codes(逗号分隔)。
-- 幂等：ON CONFLICT 合并权限位，正则精确匹配避免重复/误判。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- MENU_FIN2_CASH_MASTER: +E
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,E'
  FROM sys_role r, sys_menu m
 WHERE r.role_code = 'ROLE_MENGSAI_DONGPENG_TREASURER'
   AND m.menu_code = 'MENU_FIN2_CASH_MASTER'
ON CONFLICT (role_id, menu_id) DO UPDATE
   SET perm_codes = CASE
     WHEN sys_role_menu_permission.perm_codes ~ '(^|,)E(,|$)'
       THEN sys_role_menu_permission.perm_codes
     ELSE sys_role_menu_permission.perm_codes || ',E'
   END;

-- MENU_FIN2_CASH_TXN: +D
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V,C,D'
  FROM sys_role r, sys_menu m
 WHERE r.role_code = 'ROLE_MENGSAI_DONGPENG_TREASURER'
   AND m.menu_code = 'MENU_FIN2_CASH_TXN'
ON CONFLICT (role_id, menu_id) DO UPDATE
   SET perm_codes = CASE
     WHEN sys_role_menu_permission.perm_codes ~ '(^|,)D(,|$)'
       THEN sys_role_menu_permission.perm_codes
     ELSE sys_role_menu_permission.perm_codes || ',D'
   END;

-- 触发权限版本刷新（前端下次请求即生效）
UPDATE sys_user
   SET perms_version = perms_version + 1, updated_at = now()
 WHERE username = 'wangweihua';

COMMIT;
