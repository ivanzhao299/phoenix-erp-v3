-- ============================================================
-- 热修复：批量权限变更后 perms_version 失控导致所有用户被强制退出
--
-- 根因：
--   Phase A 迁移向 sys_role_menu_permission 插入约90条新记录，
--   每条触发 fn_bump_user_perms_version()，导致所有用户的
--   perms_version 大幅递增。已登录用户的 JWT 携带旧版本号，
--   JWT 策略检测到 DB版本 > JWT版本 → 401 PERMS_CHANGED → 强制退出。
--
-- 修复原理：
--   JWT策略只在 DB版本 > JWT版本时抛 401。
--   将所有用户的 DB perms_version 重置为 1，则：
--   · 现有 JWT（任意版本） ≥ DB版本（1）→ 不触发 401 → 用户继续使用
--   · 下次登录，新 JWT 携带版本1，与 DB 一致 → 正常
--   · 只有真实的权限变更（管理员操作）才会再次递增版本
--
-- 安全说明：
--   仅适用于"新增权限"场景（Phase A 是补充权限，不是撤销权限）。
--   如果是撤销权限的场景，不能用此方法，需要让用户重新登录。
-- ============================================================

UPDATE sys_user
SET perms_version = 1,
    updated_at    = NOW();

-- 确认结果
SELECT COUNT(*) AS total_users,
       MIN(perms_version) AS min_ver,
       MAX(perms_version) AS max_ver
FROM sys_user;
