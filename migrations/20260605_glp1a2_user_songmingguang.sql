-- ═════════════════════════════════════════════════════════════════════════════
-- GLP-1A-2 用户开通 — 宋明光（孟赛蛋鸡场 · 生产数据录入岗）
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：宋明光将从 2026-06-06 起承担 7 类生产报表数据录入：
--   生产日报 / 鸡蛋入库 / 鸡蛋出库 / 鸡蛋库存 / 原料 WMS / 原料采购 / 现金收支
--
-- 角色组合：
--   · 主角色 ROLE_FARM_MGR  (养殖场长，覆盖 6/7 个 Sheet)
--   · 副角色 ROLE_CASH      (出纳，覆盖 S7 现金收支)
--
-- 数据范围：store_code = SITE-MENGSAI-LAYER
-- 初始密码：phoenix@2026  (bcrypt $2a$10$，首次登录由用户自行修改)
--
-- 全程幂等（NOT EXISTS 守卫），可在生产/本地重复执行。
-- 不删除任何字段；不修改其他用户的权限矩阵。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) ROLE_CASH 权限补丁：MENU_FIN2_CASH 加 C 创建权 ──────────────────────
-- 原值 'V,E' → 'V,C,E'（让出纳能录入新现金流水，覆盖 Excel S7 现金收支表）
-- 仅当当前值不含 C 时才更新，避免重复 UPDATE 影响其他可能的扩展
UPDATE sys_role_menu_permission
SET perm_codes = 'V,C,E'
WHERE role_id   = (SELECT role_id FROM sys_role WHERE role_code='ROLE_CASH')
  AND menu_id   = (SELECT menu_id FROM sys_menu WHERE menu_code='MENU_FIN2_CASH')
  AND perm_codes NOT LIKE '%C%';

-- ── 2) 创建 user 宋明光（幂等） ────────────────────────────────────────────
INSERT INTO sys_user (username, password_hash, real_name, store_code, locale, status, note)
SELECT 'songmingguang',
       '$2a$10$RqiDVBLMkpri0ECBsi1cBO8eV.W7WcCHY2/E9cl.mTz4usjciN9RK',  -- phoenix@2026
       '宋明光',
       'SITE-MENGSAI-LAYER',
       'zh-CN',
       1,
       '孟赛蛋鸡场 · 生产数据录入岗（GLP-1A-2）'
WHERE NOT EXISTS (SELECT 1 FROM sys_user WHERE username='songmingguang');

-- ── 3) 角色绑定 ─────────────────────────────────────────────────────────────
-- 3.1 主角色 ROLE_FARM_MGR
INSERT INTO sys_user_role (user_id, role_id, is_primary)
SELECT u.user_id, r.role_id, true
FROM sys_user u, sys_role r
WHERE u.username='songmingguang'
  AND r.role_code='ROLE_FARM_MGR'
  AND NOT EXISTS (
    SELECT 1 FROM sys_user_role ur
    WHERE ur.user_id=u.user_id AND ur.role_id=r.role_id
  );

-- 3.2 副角色 ROLE_CASH
INSERT INTO sys_user_role (user_id, role_id, is_primary)
SELECT u.user_id, r.role_id, false
FROM sys_user u, sys_role r
WHERE u.username='songmingguang'
  AND r.role_code='ROLE_CASH'
  AND NOT EXISTS (
    SELECT 1 FROM sys_user_role ur
    WHERE ur.user_id=u.user_id AND ur.role_id=r.role_id
  );

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证 SQL（手工执行确认）：
--
--   -- 用户存在
--   SELECT user_id, username, real_name, store_code, status
--     FROM sys_user WHERE username='songmingguang';
--   -- 期望：1 行，status=1
--
--   -- 2 个角色绑定
--   SELECT r.role_code, ur.is_primary
--     FROM sys_user_role ur
--     JOIN sys_user u ON u.user_id=ur.user_id
--     JOIN sys_role r ON r.role_id=ur.role_id
--    WHERE u.username='songmingguang'
--    ORDER BY ur.is_primary DESC;
--   -- 期望：ROLE_FARM_MGR (t) / ROLE_CASH (f)
--
--   -- ROLE_CASH 权限补丁
--   SELECT rmp.perm_codes
--     FROM sys_role_menu_permission rmp
--     JOIN sys_role r ON r.role_id=rmp.role_id
--     JOIN sys_menu m ON m.menu_id=rmp.menu_id
--    WHERE r.role_code='ROLE_CASH' AND m.menu_code='MENU_FIN2_CASH';
--   -- 期望：V,C,E
-- ═════════════════════════════════════════════════════════════════════════════
