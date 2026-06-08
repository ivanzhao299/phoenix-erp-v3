-- ═════════════════════════════════════════════════════════════════════════════
-- G34-5 — 王玮华扩 :V 权（对账核对来源单据）
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务诉求：王玮华日记账摘要涉及多种来源（鸡蛋款AR/豆粕款AP/加油费用/赵总投资/对账报表），
--   出纳要"对账核对来源"。仅开 :V 不开 C/E/A，他不录别人单据。
-- 万象隔离：sys_user_orgs.allowedCompanyCodes={COMP-LAO-AGRI, COMP-LAO-XINGCHI}
--   后端 DataScope 已按 company 过滤所有 fin_* 表 → 万象 COMP-LAO-FOOD 数据天然不可见。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 父菜单 + 子菜单 :V 一次性补全
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V'
  FROM sys_role r, sys_menu m
 WHERE r.role_code='ROLE_MENGSAI_DONGPENG_TREASURER'
   AND m.menu_code IN (
     'MENU_FIN2_AR',          'MENU_FIN2_AR_VIEW',
     'MENU_FIN2_AP',          'MENU_FIN2_AP_VIEW',
     'MENU_FIN2_EXPENSE',     'MENU_FIN2_EXPENSE_VIEW',
     'MENU_FIN2_SHAREHOLDER',
     'MENU_FIN2_REPORT'
   )
   AND NOT EXISTS (
     SELECT 1 FROM sys_role_menu_permission x
      WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id
   );

UPDATE sys_user
   SET perms_version = perms_version + 1, updated_at = now()
 WHERE username = 'wangweihua';

COMMIT;
