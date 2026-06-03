-- ════════════════════════════════════════════════════════════════════════
-- 创建股东登录账号：陈逸飞（东鹏）& 薛刚（万象食品厂）
-- ────────────────────────────────────────────────────────────────────────
-- 背景：两人均为股东（shr_shareholders 已有档案），但此前未建系统账号。
--   · 陈逸飞（SHR-CHEN-YIFEI）：股权4.35%，东鹏蛋鸡养殖场
--   · 薛刚（SHR-XUE-GANG）：股权，万象食品厂
-- 初始密码：JFH@2026（bcrypt hash，与其他用户一致）
-- 角色：ROLE_REGION_MGR（区域经理，可查看股东驾驶舱及项目数据）
-- 全部幂等：ON CONFLICT DO NOTHING / WHERE NOT EXISTS
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 创建 sys_user 账号 ────────────────────────────────────────────────
INSERT INTO sys_user (username, real_name, password_hash, status, created_at)
VALUES
  ('chenyifei', '陈逸飞', '$2b$10$VarV9UavqIO/vZ80zYH6UuL5bo8mExyT31PPXl4MkJsnl0BMP5qzK', 1, NOW()),
  ('xuegang',   '薛刚',   '$2b$10$VarV9UavqIO/vZ80zYH6UuL5bo8mExyT31PPXl4MkJsnl0BMP5qzK', 1, NOW())
ON CONFLICT (username) DO NOTHING;

-- ── 2. 绑定角色 ROLE_REGION_MGR（主角色） ────────────────────────────────
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, TRUE, NOW()
FROM sys_user u, sys_role r
WHERE u.username IN ('chenyifei','xuegang')
  AND r.role_code = 'ROLE_REGION_MGR'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ── 3. 关联股东档案 linked_user_id ───────────────────────────────────────
UPDATE shr_shareholders SET linked_user_id = (
  SELECT user_id FROM sys_user WHERE username = 'chenyifei' LIMIT 1
) WHERE shareholder_code = 'SHR-CHEN-YIFEI' AND (linked_user_id IS NULL OR linked_user_id = 0);

UPDATE shr_shareholders SET linked_user_id = (
  SELECT user_id FROM sys_user WHERE username = 'xuegang' LIMIT 1
) WHERE shareholder_code = 'SHR-XUE-GANG' AND (linked_user_id IS NULL OR linked_user_id = 0);

-- 顺便修复朱召安的 linked_user_id（原来是 NULL，账号已存在 id=5）
UPDATE shr_shareholders SET linked_user_id = (
  SELECT user_id FROM sys_user WHERE real_name = '朱召安' LIMIT 1
) WHERE shareholder_code = 'SHR-ZHU-ZHAOAN' AND (linked_user_id IS NULL OR linked_user_id = 0);

-- ── 4. 建 shr_shareholder_scopes ────────────────────────────────────────
-- 陈逸飞 → 东鹏蛋鸡养殖场
INSERT INTO shr_shareholder_scopes
  (user_id, shareholder_code, scope_type, scope_code, project_code, can_approve, status)
SELECT u.user_id, 'SHR-CHEN-YIFEI', 'PROJECT', 'SITE-DONGPENG-LAYER', 'SHR-DONGPENG-LAYER', FALSE, 'ACTIVE'
FROM sys_user u WHERE u.username = 'chenyifei'
  AND NOT EXISTS (
    SELECT 1 FROM shr_shareholder_scopes s
    WHERE s.user_id = u.user_id AND s.shareholder_code = 'SHR-CHEN-YIFEI'
  );

-- 薛刚 → 万象食品厂
INSERT INTO shr_shareholder_scopes
  (user_id, shareholder_code, scope_type, scope_code, project_code, can_approve, status)
SELECT u.user_id, 'SHR-XUE-GANG', 'PROJECT', NULL, 'SHR-VTE-FOOD', FALSE, 'ACTIVE'
FROM sys_user u WHERE u.username = 'xuegang'
  AND NOT EXISTS (
    SELECT 1 FROM shr_shareholder_scopes s
    WHERE s.user_id = u.user_id AND s.shareholder_code = 'SHR-XUE-GANG'
  );

COMMIT;
