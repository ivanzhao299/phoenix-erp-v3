-- ════════════════════════════════════════════════════════════════════════
-- G114 用户—组织归属对齐（Stage 5）2026-06-14  ⚠️ 本地先跑·待审·后部署
-- ────────────────────────────────────────────────────────────────────────
-- 依据：生产 42 用户逐人勾选 + 备注（见 docs/g114-user-org-alignment.md）
-- 1. 新建「集团销售管理部」DEPT-HQ-SALES（挂集团，与采购/财务部平级）
-- 2. 朱召安双号合并：zhuzhao_an → zhuzhaoan（去下划线）
--      · 生产(两号并存)：角色并入 zhuzhaoan，停用 zhuzhao_an
--      · 本地(仅下划线号)：直接改名去下划线
-- 3. 31 名在岗用户重绑组织（按 username 解析 user_id、org_code 解析 org_id；
--      全删旧绑定后按期望重插；本地缺失账号 JOIN 自动跳过）
-- 4. 9 个账号停用归档（status=0 + 解绑）：测试号 store_mgr1 + 高管空壳 wang_ceo/yue
--      + 6 个 pilot_*。⚠ 实现为「停用」非物理删除，保护历史外键、可回滚。
-- 5. 受影响用户 perms_version+1，强制权限/JWT 缓存刷新。
-- 注：阿玉(cashier) 本轮按用户要求「暂不落位」，不动。
-- 幂等：可重复执行；username/org_code 解析；不存在则跳过。
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. 新建 集团销售管理部 ──────────────────────────────────────────────
INSERT INTO sys_organizations
  (org_code, org_name, org_name_cn, parent_id, parent_code, org_type, level, path, status, sort_order, created_at, updated_at)
SELECT 'DEPT-HQ-SALES', '集团销售管理部', '集团销售管理部',
       g.id, 'ORG-GROUP', 'DEPARTMENT', g.level + 1, g.path || 'DEPT-HQ-SALES/', 'ACTIVE', 50, NOW(), NOW()
FROM sys_organizations g
WHERE g.org_code = 'ORG-GROUP'
  AND NOT EXISTS (SELECT 1 FROM sys_organizations WHERE org_code = 'DEPT-HQ-SALES');

-- ── 2. 朱召安双号合并 ───────────────────────────────────────────────────
DO $$
DECLARE v_keep BIGINT; v_old BIGINT;
BEGIN
  SELECT user_id INTO v_keep FROM sys_user WHERE username = 'zhuzhaoan';
  SELECT user_id INTO v_old  FROM sys_user WHERE username = 'zhuzhao_an';

  IF v_old IS NOT NULL AND v_keep IS NOT NULL THEN
    -- 生产：两号并存 → 角色并入保留号，停用下划线号
    INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at, is_visible)
    SELECT v_keep, r.role_id, false, NOW(), true
      FROM sys_user_role r
     WHERE r.user_id = v_old
       AND NOT EXISTS (SELECT 1 FROM sys_user_role k WHERE k.user_id = v_keep AND k.role_id = r.role_id);
    DELETE FROM sys_user_orgs WHERE user_id = v_old;
    UPDATE sys_user SET status = 0, updated_at = NOW() WHERE user_id = v_old;
  ELSIF v_old IS NOT NULL AND v_keep IS NULL THEN
    -- 本地：仅下划线号 → 直接改名去下划线
    UPDATE sys_user SET username = 'zhuzhaoan', updated_at = NOW() WHERE user_id = v_old;
  END IF;
END $$;

-- ── 3. 在岗用户重绑组织 ─────────────────────────────────────────────────
-- 3a. 先删将被重绑用户的旧绑定（仅列出的 31 人；cashier/已停用号不在内）
DELETE FROM sys_user_orgs
 WHERE user_id IN (
   SELECT user_id FROM sys_user WHERE username IN (
     'admin','zhaoyongwei','zhuzhaocun','gaoyang','liujie','liuhantao',
     'wanglejin','fanzhenhao','guodapeng','qiantao','xuefeng','tangzhiwen',
     'songmingguang','songlei','wangweihua','songshoujiang','xiejiling','linhong',
     'chenling','alue','Bouavanh','zhuzhaoan','chenyifei','fuqiang','liushanjun',
     'zhuhuiran','langshipei','amei','xiaolan','xuegang','ajian'
   )
 );

-- 3b. 按期望重插（VALUES: username, org_code, data_scope_level, is_primary）
INSERT INTO sys_user_orgs (user_id, org_id, org_code, is_primary, data_scope_level)
SELECT u.user_id, o.id, o.org_code, a.is_primary, a.scope
FROM (VALUES
  -- 集团总部 · 集团级
  ('admin',         'ORG-GROUP',           'GROUP',   true),
  ('zhaoyongwei',   'ORG-GROUP',           'GROUP',   true),
  ('zhuzhaocun',    'ORG-GROUP',           'GROUP',   true),
  ('gaoyang',       'ORG-GROUP',           'GROUP',   true),
  -- 集团财务管理部
  ('liujie',        'ORG-FINANCE-CENTER',  'GROUP',   true),
  ('liuhantao',     'ORG-FINANCE-CENTER',  'GROUP',   true),
  -- 集团采购管理部
  ('wanglejin',     'DEPT-HQ-PROCUREMENT', 'GROUP',   true),
  ('fanzhenhao',    'DEPT-HQ-PROCUREMENT', 'GROUP',   true),
  -- 集团销售管理部（新建）
  ('guodapeng',     'DEPT-HQ-SALES',       'GROUP',   true),
  -- 老挝凤凰农业发展有限公司 · 公司级
  ('qiantao',       'COMP-LAO-AGRI',       'COMPANY', true),
  ('xuefeng',       'COMP-LAO-AGRI',       'COMPANY', true),
  ('tangzhiwen',    'COMP-LAO-AGRI',       'COMPANY', true),
  ('songmingguang', 'COMP-LAO-AGRI',       'COMPANY', true),
  ('songlei',       'COMP-LAO-AGRI',       'COMPANY', true),
  ('wangweihua',    'COMP-LAO-AGRI',       'COMPANY', true),
  -- 王玮华跨星驰（出纳兼两公司）
  ('wangweihua',    'COMP-LAO-XINGCHI',    'COMPANY', false),
  -- 孟赛蛋鸡养殖场 · 场站级
  ('songshoujiang', 'SITE-MENGSAI-LAYER',  'SITE',    true),
  ('xiejiling',     'SITE-MENGSAI-LAYER',  'SITE',    true),
  ('linhong',       'SITE-MENGSAI-LAYER',  'SITE',    true),
  -- 农业公司下属直营店 · 门店级
  ('chenling',      'STORE-MX-001',        'STORE',   true),
  ('alue',          'STORE-VTE-001',       'STORE',   true),
  ('Bouavanh',      'STORE-BKX-001',       'STORE',   true),
  -- 老挝东鹏县星驰农业发展有限公司 · 公司级
  ('zhuzhaoan',     'COMP-LAO-XINGCHI',    'COMPANY', true),
  ('chenyifei',     'COMP-LAO-XINGCHI',    'COMPANY', true),
  ('fuqiang',       'COMP-LAO-XINGCHI',    'COMPANY', true),
  -- 东鹏蛋鸡养殖场 · 场站级
  ('liushanjun',    'SITE-DONGPENG-LAYER', 'SITE',    true),
  ('zhuhuiran',     'SITE-DONGPENG-LAYER', 'SITE',    true),
  -- 星驰公司下属直营店 · 门店级
  ('langshipei',    'STORE-HS-001',        'STORE',   true),
  ('amei',          'STORE-HS-001',        'STORE',   true),
  ('xiaolan',       'STORE-XB-001',        'STORE',   true),
  -- 老挝凤凰食品集团有限公司 · 公司级
  ('xuegang',       'COMP-LAO-FOOD',       'COMPANY', true),
  -- 万象屠宰加工厂 · 场站级
  ('ajian',         'SITE-VTE-SLAUGHTER',  'SITE',    true)
) AS a(username, org_code, scope, is_primary)
JOIN sys_user u           ON u.username = a.username
JOIN sys_organizations o  ON o.org_code = a.org_code AND o.status = 'ACTIVE';

-- ── 4. 停用归档 9 账号（测试号 + 高管空壳 + pilot_*）────────────────────
DELETE FROM sys_user_orgs
 WHERE user_id IN (SELECT user_id FROM sys_user WHERE username IN (
   'store_mgr1','wang_ceo','yue',
   'pilot_manager','pilot_finance','pilot_wms','pilot_driver','pilot_cashier','pilot_sales'
 ));
UPDATE sys_user SET status = 0, updated_at = NOW()
 WHERE username IN (
   'store_mgr1','wang_ceo','yue',
   'pilot_manager','pilot_finance','pilot_wms','pilot_driver','pilot_cashier','pilot_sales'
 );

-- ── 5. 受影响在岗用户 perms_version+1（强制刷新数据范围/JWT 缓存）──────────
UPDATE sys_user SET perms_version = COALESCE(perms_version, 0) + 1, updated_at = NOW()
 WHERE username IN (
   'admin','zhaoyongwei','zhuzhaocun','gaoyang','liujie','liuhantao',
   'wanglejin','fanzhenhao','guodapeng','qiantao','xuefeng','tangzhiwen',
   'songmingguang','songlei','wangweihua','songshoujiang','xiejiling','linhong',
   'chenling','alue','Bouavanh','zhuzhaoan','chenyifei','fuqiang','liushanjun',
   'zhuhuiran','langshipei','amei','xiaolan','xuegang','ajian'
 );
