-- ============================================================
-- Migration: Phase B — 用户组织范围精确绑定
-- 目标：将 12 名真实用户绑定到正确的 sys_organizations 节点
--       替代原有 storeCode 兜底机制，激活精确 DataScope 控制
--
-- 绑定原则：
--   · 按用户职责和 storeCode 映射到最合适的组织节点
--   · data_scope_level 决定数据可见范围（GROUP/BU/COMPANY/SITE/DEPARTMENT）
--   · 财务/管理类角色（ALL storeCode）→ ORG-HQ/ORG-GROUP，GROUP 范围
--   · 农场类角色（FARM-MS）→ SITE-MENGSAI-LAYER，SITE 范围
--   · 门店类角色（STORE-VTE-001）→ COMP-LAO-FOOD，COMPANY 范围
--   · 区域经理 → 对应事业群或公司，BU/COMPANY 范围
--   · 司机（安全修复）→ SITE-VTE-SLAUGHTER，SITE 范围（消除全局超权）
--
-- 幂等：ON CONFLICT (user_id, org_id) DO NOTHING
-- ============================================================

DO $$
DECLARE
  v_user_id      BIGINT;
  v_org_id       BIGINT;
BEGIN

  -- ── 1. zhaoyongwei（集团超级管理员）→ ORG-GROUP，GROUP 范围 ────────────────
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'zhaoyongwei';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'ORG-GROUP';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'GROUP', 'ORG-GROUP')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 2. zhuzhaocun（集团总裁 CEO）→ ORG-GROUP，GROUP 范围 ─────────────────────
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'zhuzhaocun';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'ORG-GROUP';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'GROUP', 'ORG-GROUP')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 3. fuqiang（区域督导 AREA-VTE 万象区）→ COMP-LAO-FOOD，COMPANY 范围 ──────
  -- 万象区（VTE）主要业务在老挝凤凰食品集团有限公司
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'fuqiang';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'COMP-LAO-FOOD';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'COMPANY', 'COMP-LAO-FOOD')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 4. wangweihua（财务会计）→ ORG-HQ，GROUP 范围（财务全局视角）─────────────
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'wangweihua';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'ORG-HQ';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'GROUP', 'ORG-HQ')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 5. liuhantao（成本会计）→ ORG-HQ，GROUP 范围 ─────────────────────────────
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'liuhantao';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'ORG-HQ';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'GROUP', 'ORG-HQ')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 6. zhuzhao_an（出纳）→ ORG-HQ，GROUP 范围 ────────────────────────────────
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'zhuzhao_an';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'ORG-HQ';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'GROUP', 'ORG-HQ')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 7. liushanjun（仓储经理+农场作业）→ SITE-MENGSAI-LAYER，SITE 范围 ─────────
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'liushanjun';
  -- 主组织：孟赛蛋鸡养殖场
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'SITE-MENGSAI-LAYER';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'SITE', 'SITE-MENGSAI-LAYER')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;
  -- 兼职：凤凰农业公司（仓储相关业务需公司级视角）
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'COMP-LAO-AGRI';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, FALSE, 'COMPANY', 'COMP-LAO-AGRI')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 8. linhong（养殖场长）→ SITE-MENGSAI-LAYER，SITE 范围 ─────────────────────
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'linhong';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'SITE-MENGSAI-LAYER';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'SITE', 'SITE-MENGSAI-LAYER')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 9. amei（直营店店长+收银员）→ COMP-LAO-FOOD，COMPANY 范围 ─────────────────
  -- 万象门店（STORE-VTE-001）隶属老挝凤凰食品集团有限公司
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'amei';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'COMP-LAO-FOOD';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'COMPANY', 'COMP-LAO-FOOD')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 10. zhuhuiran（区域督导 AREA-ZHU）→ BU-AGRI，BU 范围 ──────────────────────
  -- 朱氏区域归农业事业群管理（含孟赛农场区域）
  -- DataScopeService 的 BU 展开逻辑会自动穿透到 COMP-LAO-AGRI + COMP-LAO-XINGCHI
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'zhuhuiran';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'BU-AGRI';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'REGION', 'BU-AGRI')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 11. yue（区域督导 AREA-YUE）→ BU-FOOD，BU 范围 ───────────────────────────
  -- 岳氏区域归食品事业群管理（万象屠宰/肉鸡区域）
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'yue';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'BU-FOOD';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'REGION', 'BU-FOOD')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 12. wanglejin（采购专员）→ COMP-LAO-AGRI，COMPANY 范围 ───────────────────
  -- 采购主要为凤凰农业公司服务（饲料/兽药/包装等）
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'wanglejin';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'COMP-LAO-AGRI';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'COMPANY', 'COMP-LAO-AGRI')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  -- ── 13. ajian（司机 — 安全修复：消除全局数据超权）─────────────────────────────
  -- 原 storeCode='ALL' → DataScope isGlobal=true（严重安全漏洞）
  -- 修复：绑定到万象屠宰加工厂（配送主要从该场区发出）
  SELECT user_id INTO v_user_id FROM sys_user WHERE username = 'ajian';
  SELECT id INTO v_org_id FROM sys_organizations WHERE org_code = 'SITE-VTE-SLAUGHTER';
  IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level, org_code)
    VALUES (v_user_id, v_org_id, TRUE, 'SITE', 'SITE-VTE-SLAUGHTER')
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;
  -- 同时修复 storeCode（从 ALL 改为具体场区代码，消除全局超权）
  UPDATE sys_user
  SET store_code = 'SITE-VTE-SLAUGHTER', updated_at = NOW()
  WHERE username = 'ajian' AND store_code = 'ALL';

END $$;

-- ── 验证：输出绑定结果 ──────────────────────────────────────────────────────────
SELECT
  u.username,
  u.real_name,
  u.store_code,
  o.org_code,
  o.org_name,
  o.org_type,
  o.company_code,
  uo.data_scope_level,
  uo.is_primary
FROM sys_user u
JOIN sys_user_orgs uo ON uo.user_id = u.user_id
JOIN sys_organizations o ON o.id = uo.org_id
WHERE u.username IN (
  'zhaoyongwei','zhuzhaocun','fuqiang','wangweihua','liuhantao',
  'zhuzhao_an','liushanjun','linhong','amei','zhuhuiran',
  'yue','wanglejin','ajian'
)
ORDER BY u.username, uo.is_primary DESC;
