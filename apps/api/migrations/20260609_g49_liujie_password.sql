-- ════════════════════════════════════════════════════════════════════════════
-- G49 · 重置刘杰(liujie) 登录密码为 phoenix@2026
-- ════════════════════════════════════════════════════════════════════════════
-- 背景：G47 前端审计需以刘杰名义登录，发现 liujie 密码非 phoenix@2026。
-- 用户授权统一重置为 phoenix@2026（与王玮华/宋明光同一份口令，业务方易记）。
-- 同步递增 perms_version 强制其重新登录、刷新菜单权限（含 G41 应收总账）。
-- 幂等：UPDATE 等值可重复执行。bcrypt($2b$10) of 'phoenix@2026'（与 G34 同一份 hash）。
-- ════════════════════════════════════════════════════════════════════════════

UPDATE sys_user
   SET password_hash = '$2b$10$Wsfi9HotvJkBImjo/djgDeEnEj87F0VDzsZLfBKznv0.MZQXxkNEW',
       status        = 1,
       perms_version = COALESCE(perms_version, 1) + 1,
       updated_at    = now()
 WHERE username = 'liujie';
