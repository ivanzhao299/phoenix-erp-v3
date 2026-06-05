-- ═════════════════════════════════════════════════════════════════════════════
-- GLP-1A-2 — 宋明光密码重置
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：上一份 user migration 因 NOT EXISTS 守卫跳过 sys_user 创建（生产 DB
-- 早已存在 songmingguang），所以预设密码 phoenix@2026 没写入。用户登录失败。
--
-- 本 migration 强制重置密码为 phoenix@2026（bcrypt $2b$10$）+ 触发权限版本
-- 递增，使任何已签发的旧 token 失效。
--
-- 注：若该用户已自行修改过密码，本 migration 会覆盖。仅适用于首次开通场景。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE sys_user
   SET password_hash = '$2b$10$Wsfi9HotvJkBImjo/djgDeEnEj87F0VDzsZLfBKznv0.MZQXxkNEW',
       -- ↑ bcrypt($2b$10) of 'phoenix@2026'
       perms_version = perms_version + 1,
       updated_at    = now()
 WHERE username = 'songmingguang';

COMMIT;
