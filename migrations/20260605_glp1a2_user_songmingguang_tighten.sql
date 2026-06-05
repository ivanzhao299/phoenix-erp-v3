-- ═════════════════════════════════════════════════════════════════════════════
-- GLP-1A-2 用户权限收紧 — 宋明光
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：上一份 migration（20260605_glp1a2_user_songmingguang.sql）执行前发现
-- 生产 DB 已预存 songmingguang 账号，store_code='ALL' 且已绑定 ROLE_WMS_MGR /
-- ROLE_FARM_MGR / ROLE_FIN_ACCT 三角色。按 GLP-1A-2 原设计（"录入岗位 ·
-- 仅孟赛 site"），本 migration 做 2 件事：
--
--   1) store_code: 'ALL' → 'SITE-MENGSAI-LAYER'（限定孟赛场）+ 补 note
--   2) 删除 ROLE_WMS_MGR + ROLE_FIN_ACCT 绑定（保留 ROLE_FARM_MGR + ROLE_CASH）
--
-- 幂等设计：
--   · UPDATE 仅当当前 store_code≠SITE-MENGSAI-LAYER 时触发
--   · DELETE 自带"未绑定即无副作用"语义
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) 收紧 store_code + 补 note
UPDATE sys_user
   SET store_code = 'SITE-MENGSAI-LAYER',
       note       = '孟赛蛋鸡场 · 生产数据录入岗（GLP-1A-2）',
       updated_at = now()
 WHERE username = 'songmingguang'
   AND (store_code <> 'SITE-MENGSAI-LAYER' OR note IS NULL OR note = '');

-- 2) 删除 ROLE_WMS_MGR + ROLE_FIN_ACCT 绑定
-- 保留 ROLE_FARM_MGR (primary) + ROLE_CASH (secondary)
DELETE FROM sys_user_role
 WHERE user_id = (SELECT user_id FROM sys_user WHERE username='songmingguang')
   AND role_id IN (
     SELECT role_id FROM sys_role
     WHERE role_code IN ('ROLE_WMS_MGR', 'ROLE_FIN_ACCT')
   );

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证 SQL（手工执行确认）：
--
--   SELECT u.username, u.store_code, u.note,
--          string_agg(r.role_code, ', ' ORDER BY ur.is_primary DESC, r.role_code) AS roles
--     FROM sys_user u
--     LEFT JOIN sys_user_role ur ON ur.user_id = u.user_id
--     LEFT JOIN sys_role r       ON r.role_id  = ur.role_id
--    WHERE u.username='songmingguang'
--    GROUP BY u.username, u.store_code, u.note;
--
--   -- 期望：store_code=SITE-MENGSAI-LAYER
--   --       note=孟赛蛋鸡场 · 生产数据录入岗（GLP-1A-2）
--   --       roles=ROLE_FARM_MGR, ROLE_CASH
-- ═════════════════════════════════════════════════════════════════════════════
