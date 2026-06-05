-- ═════════════════════════════════════════════════════════════════════════════
-- GLP-1A-2 — 宋明光最终修复（DataScope 绑定 + Home 进入权 + Roles 增加 Dashboard）
-- ═════════════════════════════════════════════════════════════════════════════
-- 上线后用户反馈 3 问题：
--   1) 上传的数据看不见 → sys_user_orgs 为空，DataScope 把他过滤光
--   2) 没看到 /home 运营工作台 → ROLE_FARM_MGR / ROLE_CASH 没 MENU_DASHBOARD 权
--   3) 出纳前台没体现 → home/ctaFor 没 CASH 分支（前端代码侧另修）
--
-- 本 migration 改 DB 部分：
--   A. sys_user_orgs：绑定 COMP-LAO-AGRI(primary, COMPANY) + SITE-MENGSAI-LAYER(SITE)
--   B. sys_role_menu_permission：ROLE_FARM_MGR / ROLE_CASH 各加 MENU_DASHBOARD V
--   C. sys_user.perms_version += 1 触发 token 重算
--
-- 幂等（NOT EXISTS 守卫）。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- A1) COMPANY 级绑定（主组织，让 DataScope 给他公司级数据可见性）
INSERT INTO sys_user_orgs (user_id, org_id, org_code, is_primary, data_scope_level, role_scope, created_at)
SELECT u.user_id, o.id, 'COMP-LAO-AGRI', true, 'COMPANY', 'COMPANY', now()
  FROM sys_user u, sys_organizations o
 WHERE u.username='songmingguang' AND o.org_code='COMP-LAO-AGRI'
   AND NOT EXISTS (SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id=u.user_id AND uo.org_code='COMP-LAO-AGRI');

-- A2) SITE 级绑定（孟赛蛋鸡场，对应 store_code/farm 维度）
INSERT INTO sys_user_orgs (user_id, org_id, org_code, is_primary, data_scope_level, role_scope, created_at)
SELECT u.user_id, o.id, 'SITE-MENGSAI-LAYER', false, 'SITE', 'SITE', now()
  FROM sys_user u, sys_organizations o
 WHERE u.username='songmingguang' AND o.org_code='SITE-MENGSAI-LAYER'
   AND NOT EXISTS (SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id=u.user_id AND uo.org_code='SITE-MENGSAI-LAYER');

-- B) ROLE_FARM_MGR + ROLE_CASH 加 MENU_DASHBOARD V（让所有非 terminal 用户能进 /home）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, 'V'
  FROM sys_role r, sys_menu m
 WHERE r.role_code IN ('ROLE_FARM_MGR','ROLE_CASH')
   AND m.menu_code='MENU_DASHBOARD'
   AND NOT EXISTS (
     SELECT 1 FROM sys_role_menu_permission x
      WHERE x.role_id=r.role_id AND x.menu_id=m.menu_id
   );

-- C) perms_version 递增（让旧 token 失效，下次登录强制重新拉权限）
UPDATE sys_user SET perms_version = perms_version + 1, updated_at=now()
 WHERE username='songmingguang';

COMMIT;
