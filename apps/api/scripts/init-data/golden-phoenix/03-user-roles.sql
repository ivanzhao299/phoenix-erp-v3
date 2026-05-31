-- ============================================================
-- Golden Phoenix · 生产初始化数据包  03 用户角色（User Roles）
-- 目标表：sys_user_role（不写旧表）
-- 原则：
--   · 幂等：ON CONFLICT (user_id, role_id) DO NOTHING
--   · 角色不存在时「不失败吞错」：JOIN sys_role 自动跳过缺失角色，并在末尾输出缺失清单
--   · 每人恰好一个 is_primary=TRUE（末尾归一化）
-- ============================================================
BEGIN;
SET LOCAL phx.skip_perms_bump = 'on';

-- ── 角色映射修正（role_seed_todo）─────────────────────────────────
--   名单要求 ROLE_GROUP_FINANCE（刘杰），系统中该角色不存在，
--   已合并为规范角色 ROLE_HQ_FINANCE（集团财务）。下方绑定使用 ROLE_HQ_FINANCE。
--   如业务坚持独立的 ROLE_GROUP_FINANCE，请先在 sys_role 播种该角色（role_seed_todo）。
-- ─────────────────────────────────────────────────────────────────

-- ── 补建缺失角色 ROLE_CASH（出纳）──────────────────────────────────
--   M2 曾在本地建过此角色，但生产库未含；此处幂等补种，确保朱召安出纳角色可绑定。
INSERT INTO sys_role (role_code, role_name_zh, role_name_lo, role_type, approval_level)
VALUES ('ROLE_CASH', '出纳', 'ພະນັກງານເງິນສົດ', 'FINANCE', 1)
ON CONFLICT (role_code) DO NOTHING;

-- 绑定（username, role_code, is_primary）。缺失角色不会绑定，亦不会报错。
INSERT INTO sys_user_role (user_id, role_id, is_primary)
SELECT u.user_id, r.role_id, b.is_primary
FROM (VALUES
  ('zhaoyongwei','ROLE_ADMIN',       TRUE),
  ('zhaoyongwei','ROLE_CEO',         FALSE),
  ('zhuzhaocun', 'ROLE_CEO',         TRUE),
  ('zhuzhaocun', 'ROLE_BU_AGRI_GM',  FALSE),
  ('songlei',    'ROLE_FACTORY_MGR', TRUE),    -- 确认：孟赛负责人为主角色
  ('songlei',    'ROLE_PRC_BUYER',   FALSE),   -- 保留采购职能
  ('songlei',    'ROLE_FIN_AR',      FALSE),   -- 保留销售回款职能
  ('fuqiang',    'ROLE_FACTORY_MGR', TRUE),
  ('fuqiang',    'ROLE_SALES_MGR',   FALSE),
  ('xiejiling',  'ROLE_FARM_MGR',    TRUE),
  ('xiejiling',  'ROLE_VET',         FALSE),
  ('liujie',     'ROLE_HQ_FINANCE',  TRUE),   -- 原名单 ROLE_GROUP_FINANCE → 规范 ROLE_HQ_FINANCE
  ('liujie',     'ROLE_FIN_ACCT',    FALSE),
  ('wangweihua', 'ROLE_FIN_ACCT',    TRUE),
  ('zhuzhaoan',  'ROLE_CASH',        TRUE),
  ('liushanjun', 'ROLE_WMS_MGR',     TRUE),
  ('songmingguang','ROLE_WMS_MGR',   TRUE)    -- 新增：孟赛仓储负责人
) AS b(username, role_code, is_primary)
JOIN sys_user u ON u.username  = b.username
JOIN sys_role r ON r.role_code = b.role_code
WHERE NOT EXISTS (
  SELECT 1 FROM sys_user_role ur WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id
);

-- ── 主角色唯一化：按本矩阵收敛，每人恰好一个 is_primary=TRUE ───────────
UPDATE sys_user_role ur
SET is_primary = (r.role_code = m.primary_role)
FROM sys_user u, sys_role r,
  (VALUES
    ('zhaoyongwei','ROLE_ADMIN'),  ('zhuzhaocun','ROLE_CEO'),
    ('songlei','ROLE_FACTORY_MGR'),('fuqiang','ROLE_FACTORY_MGR'),
    ('xiejiling','ROLE_FARM_MGR'), ('liujie','ROLE_HQ_FINANCE'),
    ('wangweihua','ROLE_FIN_ACCT'),('zhuzhaoan','ROLE_CASH'),
    ('liushanjun','ROLE_WMS_MGR'), ('songmingguang','ROLE_WMS_MGR')
  ) AS m(username, primary_role)
WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id AND u.username = m.username;

COMMIT;

-- ── 缺失角色诊断（不阻断，仅提示）────────────────────────────────────
\echo '── 缺失角色清单（请求绑定但系统无此角色）──'
SELECT DISTINCT b.role_code AS 缺失角色
FROM (VALUES
  ('ROLE_ADMIN'),('ROLE_CEO'),('ROLE_BU_AGRI_GM'),('ROLE_PRC_BUYER'),('ROLE_FIN_AR'),
  ('ROLE_FACTORY_MGR'),('ROLE_SALES_MGR'),('ROLE_FARM_MGR'),('ROLE_VET'),
  ('ROLE_HQ_FINANCE'),('ROLE_FIN_ACCT'),('ROLE_CASH'),('ROLE_WMS_MGR'),
  ('ROLE_GROUP_FINANCE')  -- 原名单角色，已映射 ROLE_HQ_FINANCE；如缺失则在此显示
) AS b(role_code)
LEFT JOIN sys_role r ON r.role_code = b.role_code
WHERE r.role_code IS NULL;
