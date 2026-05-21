-- 创建超级管理员账号（幂等）
-- 用户名：zhaoyongwei，角色：ROLE_ADMIN

INSERT INTO sys_user (username, password_hash, real_name, store_code, status, locale, created_at, updated_at)
VALUES ('zhaoyongwei', '$2b$10$iLaTrx39KkGULe9qVZQ9N.fy1w4dSiw/tJ.CYd4GUisjpnEHVausa', '赵永伟', 'ALL', 1, 'zh-CN', NOW(), NOW())
ON CONFLICT (username) DO NOTHING;

INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, TRUE, NOW()
FROM sys_user u, sys_role r
WHERE u.username = 'zhaoyongwei' AND r.role_code = 'ROLE_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM sys_user_role ur
    WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id
  );
