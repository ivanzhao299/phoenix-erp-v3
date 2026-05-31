-- ============================================================
-- Golden Phoenix · 生产初始化数据包  04 用户组织范围（User Orgs / DataScope）
-- 目标表：sys_user_orgs（不写旧表）
-- 原则：
--   · 幂等：ON CONFLICT (user_id, org_id) DO NOTHING
--   · 每个用户必须且只能有一个 is_primary=TRUE（末尾归一化强制）
--   · 不允许 ALL 范围；不允许司机/收银员绑定 GROUP
--   · 无法确认者按默认绑定并在 README「待确认事项」标注
-- ============================================================
BEGIN;
SET LOCAL phx.skip_perms_bump = 'on';

-- 绑定（username, org_code, data_scope_level, is_primary）
--   主标记规则：取最贴近作业现场的层级为主（SITE>COMPANY>BU>GROUP），纯集团/事业群岗位除外
INSERT INTO sys_user_orgs (user_id, org_id, org_code, data_scope_level, is_primary)
SELECT u.user_id, o.id, o.org_code, b.scope, b.is_primary
FROM (VALUES
  ('zhaoyongwei','ORG-GROUP',           'GROUP',   TRUE),
  ('zhuzhaocun', 'BU-AGRI',             'BU',      TRUE),
  ('songlei',    'COMP-LAO-AGRI',       'COMPANY', FALSE),
  ('songlei',    'SITE-MENGSAI-LAYER',  'SITE',    TRUE),
  ('fuqiang',    'COMP-LAO-XINGCHI',    'COMPANY', FALSE),   -- 修正：东鹏属星驰，非食品集团
  ('fuqiang',    'SITE-DONGPENG-LAYER', 'SITE',    TRUE),
  ('xiejiling',  'SITE-MENGSAI-LAYER',  'SITE',    TRUE),
  ('liujie',     'ORG-GROUP',           'GROUP',   TRUE),
  ('wangweihua', 'COMP-LAO-AGRI',       'COMPANY', TRUE),    -- 如后续负责多公司账务，可追加 COMP-LAO-FOOD / COMP-LAO-XINGCHI
  ('zhuzhaoan',  'ORG-GROUP',           'GROUP',   TRUE),    -- ⚠ 待确认：或归 FINANCE CENTER，默认 ORG-GROUP
  ('liushanjun', 'SITE-MENGSAI-LAYER',  'SITE',    TRUE)     -- ⚠ 待确认：仓储实际归属，默认孟赛
) AS b(username, org_code, scope, is_primary)
JOIN sys_user u          ON u.username  = b.username
JOIN sys_organizations o ON o.org_code  = b.org_code
WHERE NOT EXISTS (
  SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id = u.user_id AND uo.org_id = o.id
);

-- ── 组织主标记唯一化：按本矩阵收敛，每人恰好一个 is_primary=TRUE ───────────
--   （同时纠正历史「双主组织绑定」遗留，DataScope 默认范围方可确定）
UPDATE sys_user_orgs uo
SET is_primary = (o.org_code = m.primary_org)
FROM sys_user u, sys_organizations o,
  (VALUES
    ('zhaoyongwei','ORG-GROUP'),       ('zhuzhaocun','BU-AGRI'),
    ('songlei','SITE-MENGSAI-LAYER'),  ('fuqiang','SITE-DONGPENG-LAYER'),
    ('xiejiling','SITE-MENGSAI-LAYER'),('liujie','ORG-GROUP'),
    ('wangweihua','COMP-LAO-AGRI'),    ('zhuzhaoan','ORG-GROUP'),
    ('liushanjun','SITE-MENGSAI-LAYER')
  ) AS m(username, primary_org)
WHERE uo.user_id = u.user_id AND uo.org_id = o.id AND u.username = m.username;

COMMIT;

-- ── 安全诊断：禁止 GROUP 误授权给司机/收银员；禁止 ALL 范围 ────────────
\echo '── 违规授权检查（应为 0 行）──'
SELECT u.username, uo.data_scope_level, r.role_code
FROM sys_user_orgs uo
JOIN sys_user u ON u.user_id = uo.user_id
JOIN sys_user_role ur ON ur.user_id = u.user_id
JOIN sys_role r ON r.role_id = ur.role_id
WHERE (uo.data_scope_level = 'ALL')
   OR (uo.data_scope_level = 'GROUP' AND r.role_code IN ('ROLE_DRIVER','ROLE_CASHIER'));
