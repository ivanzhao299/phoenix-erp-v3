-- ═════════════════════════════════════════════════════════════════════════════
-- G34-2 — 王玮华密码重置（首次开通）
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：G34 seed mig 重置了王玮华的角色/组织/账户，但用户原存量记录的 password_hash
-- 是空（或旧 bcrypt 没人记得），UAT 登录失败。
--
-- 本 mig 强制重置为 phoenix@2026（与宋明光统一密码，业务方易记）+ 递增 perms_version
-- 触发旧 token 失效。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE sys_user
   SET password_hash = '$2b$10$Wsfi9HotvJkBImjo/djgDeEnEj87F0VDzsZLfBKznv0.MZQXxkNEW',
       -- ↑ bcrypt($2b$10) of 'phoenix@2026'（与 songmingguang 同一份 hash 字符串）
       perms_version = perms_version + 1,
       updated_at    = now()
 WHERE username = 'wangweihua';

COMMIT;
