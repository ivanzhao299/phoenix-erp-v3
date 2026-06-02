-- ════════════════════════════════════════════════════════════════════════
-- Finance Authority Reconstruction Phase 1 — B. 用户岗位绑定
-- ────────────────────────────────────────────────────────────────────────
-- 岗位驱动：人员绑定到岗位角色。保留原有角色兼容（旧角色不删），新增岗位角色并设为主角色。
--   刘杰   liujie     → ROLE_FINANCE_REVIEW_MANAGER（财务审核经理）
--   王玮华 wangweihua → ROLE_TREASURY_MANAGER（资金经理·孟赛凤凰鸡场）
--   朱召安 zhuzhao_an → ROLE_TREASURY_MANAGER（资金经理·东鹏鸡场）
--   刘汉涛 liuhantao  → ROLE_FINANCE_ANALYST（财务分析经理·赵永伟体系）
--
-- 组织绑定（sys_user_orgs）：4 人挂入财务中心对应岗位组；
--   王玮华限孟赛、朱召安限东鹏（资金数据范围 DataScope）。
--
-- 幂等：user_role ON CONFLICT(user_id,role_id) DO NOTHING；user_orgs ON CONFLICT(user_id,org_id) DO NOTHING。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 绑定岗位角色（保留旧角色，新岗位角色 is_primary=TRUE）──────────────
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, TRUE, NOW()
FROM (VALUES
  ('liujie',     'ROLE_FINANCE_REVIEW_MANAGER'),
  ('wangweihua', 'ROLE_TREASURY_MANAGER'),
  ('zhuzhao_an', 'ROLE_TREASURY_MANAGER'),
  ('liuhantao',  'ROLE_FINANCE_ANALYST')
) AS v(username, role_code)
JOIN sys_user u ON u.username = v.username
JOIN sys_role r ON r.role_code = v.role_code
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ── 2. 岗位角色设为主、旧角色降为非主（岗位优先）─────────────────────────
-- 先把这 4 人所有角色置非主
UPDATE sys_user_role ur SET is_primary = FALSE
WHERE ur.user_id IN (SELECT user_id FROM sys_user WHERE username IN ('liujie','wangweihua','zhuzhao_an','liuhantao'));
-- 再把岗位角色置为主
UPDATE sys_user_role ur SET is_primary = TRUE
FROM sys_user u, sys_role r
WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id
  AND ( (u.username='liujie'     AND r.role_code='ROLE_FINANCE_REVIEW_MANAGER')
     OR (u.username='wangweihua' AND r.role_code='ROLE_TREASURY_MANAGER')
     OR (u.username='zhuzhao_an' AND r.role_code='ROLE_TREASURY_MANAGER')
     OR (u.username='liuhantao'  AND r.role_code='ROLE_FINANCE_ANALYST') );

-- ── 3. 组织绑定：岗位组（财务中心）─────────────────────────────────────────
INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code, position_title, is_manager)
SELECT u.user_id, o.id, TRUE, v.scope, o.org_code, v.title, TRUE
FROM (VALUES
  ('liujie',     'DEPT-FIN-REVIEW',   'GROUP', '财务审核经理'),
  ('wangweihua', 'DEPT-FIN-TREASURY', 'GROUP', '资金经理'),
  ('zhuzhao_an', 'DEPT-FIN-TREASURY', 'GROUP', '资金经理'),
  ('liuhantao',  'DEPT-FIN-ANALYSIS', 'GROUP', '财务分析经理')
) AS v(username, org_code, scope, title)
JOIN sys_user u ON u.username = v.username
JOIN sys_organizations o ON o.org_code = v.org_code
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ── 4. 资金数据范围：王玮华限孟赛、朱召安限东鹏（若场区组织存在）──────────
INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code, position_title, is_manager)
SELECT u.user_id, o.id, FALSE, 'SITE', o.org_code, v.title, FALSE
FROM (VALUES
  ('wangweihua', 'SITE-MENGSAI-LAYER',  '资金经理·孟赛凤凰鸡场'),
  ('zhuzhao_an', 'SITE-DONGPENG-LAYER', '资金经理·东鹏鸡场')
) AS v(username, org_code, title)
JOIN sys_user u ON u.username = v.username
JOIN sys_organizations o ON o.org_code = v.org_code
ON CONFLICT (user_id, org_id) DO NOTHING;

COMMIT;
