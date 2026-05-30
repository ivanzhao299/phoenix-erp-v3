-- ============================================================
-- Migration: 修复凤凰农业初始用户——确保用户存在并设置有效密码
-- ============================================================
--
-- 背景：
--   02_init_data.sql 使用了 password_hash = '$2b$10$placeholder'
--   这不是有效 bcrypt 哈希（只有17字符，有效格式需60字符），导致用户无法登录。
--   同时 INSERT 缺少 ON CONFLICT DO NOTHING，数据库重建后用户可能完全丢失。
--
-- 本迁移做两件事：
--   1. 确保12名初始用户存在（ON CONFLICT DO NOTHING）
--   2. 将仍为占位符的 password_hash 更新为合法随机 bcrypt 哈希
--      ⚠️ 密码由 pgcrypto gen_salt('bf') 随机生成，管理员无法得知
--      ✅ 部署后请在「系统设置 → 用户管理」逐人点「重置密码」设置实际密码
--
-- 安全说明：
--   · 明文密码不写入 SQL 文件，不进 git 历史
--   · 使用 pgcrypto crypt() + gen_salt 生成不可逆的随机哈希
--   · 只更新 password_hash = '$2b$10$placeholder' 的用户（从未设置过真实密码）
--   · 已被管理员重置过密码的用户不受影响
-- ============================================================

-- 启用 pgcrypto（幂等）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Step 1: 确保12名初始用户存在 ──────────────────────────────────────────────
INSERT INTO sys_user (username, password_hash, real_name, store_code, locale, status)
VALUES
  ('zhuzhaocun', '$2b$10$placeholder', '朱兆存',  'ALL',           'zh-CN', 1),
  ('fuqiang',    '$2b$10$placeholder', '伏强',    'AREA-VTE',      'zh-CN', 1),
  ('wangweihua', '$2b$10$placeholder', '王玮华',   'ALL',           'zh-CN', 1),
  ('liuhantao',  '$2b$10$placeholder', '刘汉涛',   'ALL',           'zh-CN', 1),
  ('zhuzhao_an', '$2b$10$placeholder', '朱召安',   'ALL',           'zh-CN', 1),
  ('liushanjun', '$2b$10$placeholder', '刘善军',   'FARM-MS',       'zh-CN', 1),
  ('linhong',    '$2b$10$placeholder', '林宏',    'FARM-MS',       'zh-CN', 1),
  ('amei',       '$2b$10$placeholder', '阿美',    'STORE-VTE-001', 'lo-LA', 1),
  ('zhuhuiran',  '$2b$10$placeholder', '朱会然',   'AREA-ZHU',      'zh-CN', 1),
  ('yue',        '$2b$10$placeholder', '岳',      'AREA-YUE',      'zh-CN', 1),
  ('wanglejin',  '$2b$10$placeholder', '王乐金',   'ALL',           'zh-CN', 1),
  ('ajian',      '$2b$10$placeholder', '阿坚',    'ALL',           'lo-LA', 1)
ON CONFLICT (username) DO NOTHING;

-- ── Step 2: 用 pgcrypto 生成随机合法 bcrypt 哈希替换占位符 ────────────────────
-- ⚠️  密码随机生成，管理员需在系统设置→用户管理→重置密码 逐人操作
-- 条件：只更新仍为占位符的用户（已有真实密码的用户跳过）
UPDATE sys_user
SET
  password_hash = crypt(gen_random_uuid()::text, gen_salt('bf', 10)),
  updated_at    = NOW()
WHERE username IN (
  'zhuzhaocun', 'fuqiang', 'wangweihua', 'liuhantao', 'zhuzhao_an',
  'liushanjun', 'linhong', 'amei', 'zhuhuiran', 'yue', 'wanglejin', 'ajian'
)
AND password_hash = '$2b$10$placeholder';

-- ── Step 3: 确保角色关联存在（幂等）────────────────────────────────────────────
INSERT INTO sys_user_role (user_id, role_id, is_primary)
SELECT u.user_id, r.role_id, ur.is_primary
FROM (VALUES
  ('zhuzhaocun', 'ROLE_CEO',        TRUE),
  ('fuqiang',    'ROLE_REGION_MGR', TRUE),
  ('wangweihua', 'ROLE_FIN_ACCT',   TRUE),
  ('liuhantao',  'ROLE_FIN_COST',   TRUE),
  ('zhuzhao_an', 'ROLE_FIN_ACCT',   TRUE),
  ('liushanjun', 'ROLE_WMS_MGR',    TRUE),
  ('liushanjun', 'ROLE_FARMER',     FALSE),
  ('linhong',    'ROLE_FARM_MGR',   TRUE),
  ('amei',       'ROLE_STORE_MGR',  TRUE),
  ('amei',       'ROLE_CASHIER',    FALSE),
  ('zhuhuiran',  'ROLE_REGION_MGR', TRUE),
  ('yue',        'ROLE_REGION_MGR', TRUE),
  ('wanglejin',  'ROLE_PRC_BUYER',  TRUE),
  ('ajian',      'ROLE_DRIVER',     TRUE)
) AS ur(username, role_code, is_primary)
JOIN sys_user u ON u.username = ur.username
JOIN sys_role r ON r.role_code = ur.role_code
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ── 验证（只读）────────────────────────────────────────────────────────────────
SELECT
  u.username,
  u.real_name,
  CASE
    WHEN u.password_hash = '$2b$10$placeholder' THEN '⚠️ 仍为占位符（异常）'
    WHEN length(u.password_hash) >= 60           THEN '✅ 有效 bcrypt（需管理员重置）'
    ELSE '❓ 未知格式'
  END AS password_status,
  CASE WHEN u.status = 1 THEN '启用' ELSE '禁用' END AS user_status,
  r.role_code
FROM sys_user u
LEFT JOIN sys_user_role ur ON ur.user_id = u.user_id AND ur.is_primary = true
LEFT JOIN sys_role r ON r.role_id = ur.role_id
WHERE u.username IN (
  'zhuzhaocun', 'fuqiang', 'wangweihua', 'liuhantao', 'zhuzhao_an',
  'liushanjun', 'linhong', 'amei', 'zhuhuiran', 'yue', 'wanglejin', 'ajian'
)
ORDER BY u.username;
