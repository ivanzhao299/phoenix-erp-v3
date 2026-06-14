-- ════════════════════════════════════════════════════════════════════════
-- G118-A 权限集（PBAC 两层模型·种子）2026-06-15  ⚠️ 本地先跑·待审·后部署
-- ────────────────────────────────────────────────────────────────────────
-- 启用已布线但空置的 sys_permission_set 体系（auth.service 已查三路并集）。
-- 种两个"能力集"，顺带落地 G115 遗留的两个子任务：
--   1) PSET_SHAREHOLDER_READONLY 股东权益只读 → 配 宋雷/陈逸飞/薛刚（只看数、禁操作资金）
--   2) PSET_PROCUREMENT_APPROVE  采购审批     → 配 王乐金（审批权，区别于经办采购专员）
-- 解析：set_code / menu_code / username；id 走序列；幂等 NOT EXISTS。
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. 能力集主表 ───────────────────────────────────────────────────────
INSERT INTO sys_permission_set (set_code, set_name_zh, description, created_at, updated_at)
SELECT v.code, v.nm, v.de, NOW(), NOW()
FROM (VALUES
  ('PSET_SHAREHOLDER_READONLY', '股东权益只读', '股东只读看数：股东驾驶舱/出资台账/资本流/权益（仅查看 V，禁操作资金）'),
  ('PSET_PROCUREMENT_APPROVE',  '采购审批',     '采购申请/订单/付款的审批权（A），区别于经办的采购专员')
) AS v(code, nm, de)
WHERE NOT EXISTS (SELECT 1 FROM sys_permission_set s WHERE s.set_code = v.code);

-- ── 2. 能力集明细（set × menu × perm_codes）──────────────────────────────
INSERT INTO sys_permission_set_item (set_id, menu_id, perm_codes)
SELECT s.set_id, m.menu_id, v.perm
FROM (VALUES
  -- 股东只读：全部只给 V
  ('PSET_SHAREHOLDER_READONLY', 'MENU_SHAREHOLDER_DASHBOARD',    'V'),
  ('PSET_SHAREHOLDER_READONLY', 'MENU_SHAREHOLDER_VIEW',         'V'),
  ('PSET_SHAREHOLDER_READONLY', 'MENU_SHAREHOLDER_CONTRIBUTION', 'V'),
  ('PSET_SHAREHOLDER_READONLY', 'MENU_SHAREHOLDER_CAPITAL',      'V'),
  ('PSET_SHAREHOLDER_READONLY', 'MENU_SHAREHOLDER_MANAGE',       'V'),
  ('PSET_SHAREHOLDER_READONLY', 'MENU_FIN2_SHAREHOLDER',         'V'),
  ('PSET_SHAREHOLDER_READONLY', 'MENU_PRC2_FUND',                'V'),
  -- 采购审批：查看 + 审批
  ('PSET_PROCUREMENT_APPROVE',  'MENU_PRC2_REQUEST',             'V,A'),
  ('PSET_PROCUREMENT_APPROVE',  'MENU_PRC2_ORDER',               'V,A'),
  ('PSET_PROCUREMENT_APPROVE',  'MENU_PRC2_PAYMENT',             'V,A')
) AS v(set_code, menu_code, perm)
JOIN sys_permission_set s ON s.set_code = v.set_code
JOIN sys_menu m           ON m.menu_code = v.menu_code
WHERE NOT EXISTS (
  SELECT 1 FROM sys_permission_set_item i WHERE i.set_id = s.set_id AND i.menu_id = m.menu_id
);

-- ── 3. 分配给用户（用户直绑能力集）──────────────────────────────────────
INSERT INTO sys_user_permission_set (user_id, set_id, granted_at)
SELECT u.user_id, s.set_id, NOW()
FROM (VALUES
  ('songlei',   'PSET_SHAREHOLDER_READONLY'),
  ('chenyifei', 'PSET_SHAREHOLDER_READONLY'),
  ('xuegang',   'PSET_SHAREHOLDER_READONLY'),
  ('wanglejin', 'PSET_PROCUREMENT_APPROVE')
) AS v(username, set_code)
JOIN sys_user u           ON u.username = v.username
JOIN sys_permission_set s ON s.set_code = v.set_code
WHERE NOT EXISTS (
  SELECT 1 FROM sys_user_permission_set ups WHERE ups.user_id = u.user_id AND ups.set_id = s.set_id
);

-- ── 4. 受影响用户 perms_version+1（强制 JWT/权限缓存刷新）───────────────
UPDATE sys_user SET perms_version = COALESCE(perms_version, 0) + 1, updated_at = NOW()
 WHERE username IN ('songlei','chenyifei','xuegang','wanglejin');
