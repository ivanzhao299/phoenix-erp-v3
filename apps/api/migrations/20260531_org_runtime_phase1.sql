-- ============================================================
-- Migration: Org Runtime Phase 1 — 组织树扩展 + 初始化数据
-- 文件: 20260531_org_runtime_phase1.sql
--
-- 内容：
--   1. 扩展 sys_organizations 表字段（IF NOT EXISTS）
--   2. 重建 org_type CHECK 约束（增加 BU / SITE）
--   3. 扩展 sys_user_orgs 表字段（IF NOT EXISTS）
--   4. 初始化完整组织树（集团→BU→公司→场区 共 15 节点）
--   5. 为所有 SITE 生成 7 个标准部门（8 SITE × 7 = 56 节点）
--   6. 新增索引（IF NOT EXISTS）
--
-- 规则：
--   · 全部幂等（IF NOT EXISTS / ON CONFLICT DO UPDATE）
--   · 不删除现有数据
--   · 不修改 sys_dict 任何记录
--
-- 生效日期：2026-05-31
-- ============================================================

-- ============================================================
-- § 1. 扩展 sys_organizations 字段
-- ============================================================

ALTER TABLE sys_organizations
  ADD COLUMN IF NOT EXISTS org_name_cn       VARCHAR(256),
  ADD COLUMN IF NOT EXISTS org_short_name    VARCHAR(64),
  ADD COLUMN IF NOT EXISTS parent_code       VARCHAR(64),
  ADD COLUMN IF NOT EXISTS site_code         VARCHAR(64),
  ADD COLUMN IF NOT EXISTS site_business_type VARCHAR(64),
  ADD COLUMN IF NOT EXISTS sort_order        INTEGER NOT NULL DEFAULT 0;

-- ── 重建 org_type CHECK 约束（增加 BU / SITE）─────────────────────────────
-- 先删掉所有可能的旧约束名（兼容不同建表时命名），再统一添加新约束
ALTER TABLE sys_organizations
  DROP CONSTRAINT IF EXISTS sys_organizations_org_type_check;

ALTER TABLE sys_organizations
  DROP CONSTRAINT IF EXISTS chk_org_type;

ALTER TABLE sys_organizations
  ADD CONSTRAINT chk_org_type CHECK (
    org_type IN (
      'GROUP','COMPANY','FACTORY','PROJECT',
      'WAREHOUSE','STORE','DEPARTMENT',
      'BU','SITE','VIRTUAL_ORGANIZATION'
    )
  );
  -- 注：VIRTUAL_ORGANIZATION 由 Finance Authority Phase1 引入（集团财务中心虚拟组织）。
  -- 必须在此基础约束中包含，否则累积重跑本迁移时会与已存在的 VIRTUAL_ORGANIZATION 行冲突。

-- ============================================================
-- § 2. 扩展 sys_user_orgs 字段
-- ============================================================

ALTER TABLE sys_user_orgs
  ADD COLUMN IF NOT EXISTS org_code   VARCHAR(64),
  ADD COLUMN IF NOT EXISTS role_scope VARCHAR(32)
                               CHECK (role_scope IN ('GROUP','BU','COMPANY','SITE','DEPARTMENT'));

-- ============================================================
-- § 3. 初始化组织树
-- ============================================================

-- ── 3-1. 集团层（顶层，parent_id = NULL）────────────────────────────────
INSERT INTO sys_organizations (
  org_code, org_name, org_name_cn, org_short_name,
  org_type, parent_id, parent_code,
  level, path, status, sort_order,
  created_at, updated_at
)
VALUES (
  'ORG-GROUP', '金凤凰控股集团', '金凤凰控股集团', '金凤凰控股',
  'GROUP', NULL, NULL,
  1, '/ORG-GROUP/', 'ACTIVE', 1,
  NOW(), NOW()
)
ON CONFLICT (org_code) DO UPDATE SET
  org_name       = EXCLUDED.org_name,
  org_name_cn    = EXCLUDED.org_name_cn,
  org_short_name = EXCLUDED.org_short_name,
  sort_order     = EXCLUDED.sort_order,
  updated_at     = NOW();

-- ── 3-2. 以下节点通过 DO $$ 块处理，确保 parent_id 正确引用 ─────────────
DO $$
DECLARE
  v_group_id    BIGINT;
  v_hq_id       BIGINT;
  v_bu_agri_id  BIGINT;
  v_bu_food_id  BIGINT;
  v_bu_trd_id   BIGINT;
  v_bu_scm_id   BIGINT;
  v_comp_agri_id    BIGINT;
  v_comp_xingchi_id BIGINT;
  v_comp_food_id    BIGINT;
  v_site_ms_layer_id     BIGINT;
  v_site_ms_hatchery_id  BIGINT;
  v_site_ms_organic_id   BIGINT;
  v_site_dp_layer_id     BIGINT;
  v_site_vte_broiler_id  BIGINT;
  v_site_vte_slaughter_id BIGINT;
  v_site_vte_feed_id     BIGINT;

  -- 部门生成用
  r_site RECORD;
  v_dept_suffixes TEXT[] := ARRAY['PROD','WAREHOUSE','SALES','FINANCE','QUALITY','EQUIPMENT','ADMIN'];
  v_dept_names    TEXT[] := ARRAY['生产部','仓储部','销售部','财务部','质检部','设备部','行政部'];
  v_suffix TEXT;
  v_dname  TEXT;
  i INT;
BEGIN

  -- 取集团 id
  SELECT id INTO v_group_id FROM sys_organizations WHERE org_code = 'ORG-GROUP';

  -- ── 集团总部 ─────────────────────────────────────────────────────────
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    level, path, status,
    site_business_type, sort_order,
    created_at, updated_at
  ) VALUES (
    'ORG-HQ', '金凤凰控股集团总部', '金凤凰控股集团总部', '集团总部',
    'DEPARTMENT', v_group_id, 'ORG-GROUP',
    2, '/ORG-GROUP/ORG-HQ/', 'ACTIVE',
    'HQ', 2,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name       = EXCLUDED.org_name,
    org_name_cn    = EXCLUDED.org_name_cn,
    org_short_name = EXCLUDED.org_short_name,
    parent_id      = EXCLUDED.parent_id,
    parent_code    = EXCLUDED.parent_code,
    level          = EXCLUDED.level,
    path           = EXCLUDED.path,
    site_business_type = EXCLUDED.site_business_type,
    sort_order     = EXCLUDED.sort_order,
    updated_at     = NOW();
  SELECT id INTO v_hq_id FROM sys_organizations WHERE org_code = 'ORG-HQ';

  -- ── 4 个事业群（BU）────────────────────────────────────────────────
  -- BU-AGRI
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'BU-AGRI', '凤凰农业事业群', '凤凰农业事业群', '农业事业群',
    'BU', v_group_id, 'ORG-GROUP',
    2, '/ORG-GROUP/BU-AGRI/', 'ACTIVE', 10,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name       = EXCLUDED.org_name,
    org_name_cn    = EXCLUDED.org_name_cn,
    org_short_name = EXCLUDED.org_short_name,
    parent_id      = EXCLUDED.parent_id,
    parent_code    = EXCLUDED.parent_code,
    level          = EXCLUDED.level,
    path           = EXCLUDED.path,
    status         = EXCLUDED.status,
    sort_order     = EXCLUDED.sort_order,
    updated_at     = NOW();
  SELECT id INTO v_bu_agri_id FROM sys_organizations WHERE org_code = 'BU-AGRI';

  -- BU-FOOD
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'BU-FOOD', '凤凰食品事业群', '凤凰食品事业群', '食品事业群',
    'BU', v_group_id, 'ORG-GROUP',
    2, '/ORG-GROUP/BU-FOOD/', 'ACTIVE', 20,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name       = EXCLUDED.org_name,
    org_name_cn    = EXCLUDED.org_name_cn,
    org_short_name = EXCLUDED.org_short_name,
    parent_id      = EXCLUDED.parent_id,
    parent_code    = EXCLUDED.parent_code,
    level          = EXCLUDED.level,
    path           = EXCLUDED.path,
    status         = EXCLUDED.status,
    sort_order     = EXCLUDED.sort_order,
    updated_at     = NOW();
  SELECT id INTO v_bu_food_id FROM sys_organizations WHERE org_code = 'BU-FOOD';

  -- BU-TRADING
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'BU-TRADING', '凤凰贸易事业群', '凤凰贸易事业群', '贸易事业群',
    'BU', v_group_id, 'ORG-GROUP',
    2, '/ORG-GROUP/BU-TRADING/', 'PLANNED', 30,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name       = EXCLUDED.org_name,
    org_name_cn    = EXCLUDED.org_name_cn,
    org_short_name = EXCLUDED.org_short_name,
    parent_id      = EXCLUDED.parent_id,
    parent_code    = EXCLUDED.parent_code,
    level          = EXCLUDED.level,
    path           = EXCLUDED.path,
    sort_order     = EXCLUDED.sort_order,
    updated_at     = NOW();
  SELECT id INTO v_bu_trd_id FROM sys_organizations WHERE org_code = 'BU-TRADING';

  -- BU-SCM
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'BU-SCM', '凤凰供应链事业群', '凤凰供应链事业群', '供应链事业群',
    'BU', v_group_id, 'ORG-GROUP',
    2, '/ORG-GROUP/BU-SCM/', 'PLANNED', 40,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name       = EXCLUDED.org_name,
    org_name_cn    = EXCLUDED.org_name_cn,
    org_short_name = EXCLUDED.org_short_name,
    parent_id      = EXCLUDED.parent_id,
    parent_code    = EXCLUDED.parent_code,
    level          = EXCLUDED.level,
    path           = EXCLUDED.path,
    sort_order     = EXCLUDED.sort_order,
    updated_at     = NOW();
  SELECT id INTO v_bu_scm_id FROM sys_organizations WHERE org_code = 'BU-SCM';

  -- ── 3 个公司（COMPANY，level=3）────────────────────────────────────
  -- COMP-LAO-AGRI（隶属 BU-AGRI）
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    company_code,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'COMP-LAO-AGRI',
    '老挝凤凰农业发展有限公司', '老挝凤凰农业发展有限公司', '凤凰农业',
    'COMPANY', v_bu_agri_id, 'BU-AGRI',
    'COMP-LAO-AGRI',
    3, '/ORG-GROUP/BU-AGRI/COMP-LAO-AGRI/', 'ACTIVE', 10,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name       = EXCLUDED.org_name,
    org_name_cn    = EXCLUDED.org_name_cn,
    org_short_name = EXCLUDED.org_short_name,
    parent_id      = EXCLUDED.parent_id,
    parent_code    = EXCLUDED.parent_code,
    company_code   = EXCLUDED.company_code,
    level          = EXCLUDED.level,
    path           = EXCLUDED.path,
    status         = EXCLUDED.status,
    sort_order     = EXCLUDED.sort_order,
    updated_at     = NOW();
  SELECT id INTO v_comp_agri_id FROM sys_organizations WHERE org_code = 'COMP-LAO-AGRI';

  -- COMP-LAO-XINGCHI（隶属 BU-AGRI）
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    company_code,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'COMP-LAO-XINGCHI',
    '老挝金三角特区星驰养鸡场', '老挝金三角特区星驰养鸡场', '星驰养鸡场',
    'COMPANY', v_bu_agri_id, 'BU-AGRI',
    'COMP-LAO-XINGCHI',
    3, '/ORG-GROUP/BU-AGRI/COMP-LAO-XINGCHI/', 'ACTIVE', 20,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name       = EXCLUDED.org_name,
    org_name_cn    = EXCLUDED.org_name_cn,
    org_short_name = EXCLUDED.org_short_name,
    parent_id      = EXCLUDED.parent_id,
    parent_code    = EXCLUDED.parent_code,
    company_code   = EXCLUDED.company_code,
    level          = EXCLUDED.level,
    path           = EXCLUDED.path,
    status         = EXCLUDED.status,
    sort_order     = EXCLUDED.sort_order,
    updated_at     = NOW();
  SELECT id INTO v_comp_xingchi_id FROM sys_organizations WHERE org_code = 'COMP-LAO-XINGCHI';

  -- COMP-LAO-FOOD（隶属 BU-FOOD）
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    company_code,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'COMP-LAO-FOOD',
    '老挝凤凰食品集团有限公司', '老挝凤凰食品集团有限公司', '凤凰食品',
    'COMPANY', v_bu_food_id, 'BU-FOOD',
    'COMP-LAO-FOOD',
    3, '/ORG-GROUP/BU-FOOD/COMP-LAO-FOOD/', 'ACTIVE', 10,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name       = EXCLUDED.org_name,
    org_name_cn    = EXCLUDED.org_name_cn,
    org_short_name = EXCLUDED.org_short_name,
    parent_id      = EXCLUDED.parent_id,
    parent_code    = EXCLUDED.parent_code,
    company_code   = EXCLUDED.company_code,
    level          = EXCLUDED.level,
    path           = EXCLUDED.path,
    status         = EXCLUDED.status,
    sort_order     = EXCLUDED.sort_order,
    updated_at     = NOW();
  SELECT id INTO v_comp_food_id FROM sys_organizations WHERE org_code = 'COMP-LAO-FOOD';

  -- ── 8 个场区（SITE，level=4）───────────────────────────────────────

  -- SITE-MENGSAI-LAYER（孟赛蛋鸡养殖场，COMP-LAO-AGRI）
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    site_code, site_business_type,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'SITE-MENGSAI-LAYER',
    '孟赛蛋鸡养殖场', '孟赛蛋鸡养殖场', '孟赛蛋鸡场',
    'SITE', v_comp_agri_id, 'COMP-LAO-AGRI',
    'SITE-MENGSAI-LAYER', 'LAYER_FARM',
    4, '/ORG-GROUP/BU-AGRI/COMP-LAO-AGRI/SITE-MENGSAI-LAYER/', 'ACTIVE', 10,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name            = EXCLUDED.org_name,
    org_name_cn         = EXCLUDED.org_name_cn,
    org_short_name      = EXCLUDED.org_short_name,
    parent_id           = EXCLUDED.parent_id,
    parent_code         = EXCLUDED.parent_code,
    site_code           = EXCLUDED.site_code,
    site_business_type  = EXCLUDED.site_business_type,
    level               = EXCLUDED.level,
    path                = EXCLUDED.path,
    status              = EXCLUDED.status,
    sort_order          = EXCLUDED.sort_order,
    updated_at          = NOW();
  SELECT id INTO v_site_ms_layer_id FROM sys_organizations WHERE org_code = 'SITE-MENGSAI-LAYER';

  -- SITE-MENGSAI-HATCHERY（孟赛孵化场，COMP-LAO-AGRI）
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    site_code, site_business_type,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'SITE-MENGSAI-HATCHERY',
    '孟赛孵化场', '孟赛孵化场', '孟赛孵化场',
    'SITE', v_comp_agri_id, 'COMP-LAO-AGRI',
    'SITE-MENGSAI-HATCHERY', 'HATCHERY',
    4, '/ORG-GROUP/BU-AGRI/COMP-LAO-AGRI/SITE-MENGSAI-HATCHERY/', 'PLANNED', 20,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name            = EXCLUDED.org_name,
    org_name_cn         = EXCLUDED.org_name_cn,
    org_short_name      = EXCLUDED.org_short_name,
    parent_id           = EXCLUDED.parent_id,
    parent_code         = EXCLUDED.parent_code,
    site_code           = EXCLUDED.site_code,
    site_business_type  = EXCLUDED.site_business_type,
    level               = EXCLUDED.level,
    path                = EXCLUDED.path,
    sort_order          = EXCLUDED.sort_order,
    updated_at          = NOW();
  SELECT id INTO v_site_ms_hatchery_id FROM sys_organizations WHERE org_code = 'SITE-MENGSAI-HATCHERY';

  -- SITE-MENGSAI-ORGANIC（孟赛有机肥生产厂，COMP-LAO-AGRI）
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    site_code, site_business_type,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'SITE-MENGSAI-ORGANIC',
    '孟赛有机肥生产厂', '孟赛有机肥生产厂', '孟赛有机肥厂',
    'SITE', v_comp_agri_id, 'COMP-LAO-AGRI',
    'SITE-MENGSAI-ORGANIC', 'ORGANIC_FERTILIZER',
    4, '/ORG-GROUP/BU-AGRI/COMP-LAO-AGRI/SITE-MENGSAI-ORGANIC/', 'PLANNED', 30,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name            = EXCLUDED.org_name,
    org_name_cn         = EXCLUDED.org_name_cn,
    org_short_name      = EXCLUDED.org_short_name,
    parent_id           = EXCLUDED.parent_id,
    parent_code         = EXCLUDED.parent_code,
    site_code           = EXCLUDED.site_code,
    site_business_type  = EXCLUDED.site_business_type,
    level               = EXCLUDED.level,
    path                = EXCLUDED.path,
    sort_order          = EXCLUDED.sort_order,
    updated_at          = NOW();
  SELECT id INTO v_site_ms_organic_id FROM sys_organizations WHERE org_code = 'SITE-MENGSAI-ORGANIC';

  -- SITE-DONGPENG-LAYER（东鹏蛋鸡养殖场，COMP-LAO-XINGCHI）
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    site_code, site_business_type,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'SITE-DONGPENG-LAYER',
    '东鹏蛋鸡养殖场', '东鹏蛋鸡养殖场', '东鹏蛋鸡场',
    'SITE', v_comp_xingchi_id, 'COMP-LAO-XINGCHI',
    'SITE-DONGPENG-LAYER', 'LAYER_FARM',
    4, '/ORG-GROUP/BU-AGRI/COMP-LAO-XINGCHI/SITE-DONGPENG-LAYER/', 'ACTIVE', 10,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name            = EXCLUDED.org_name,
    org_name_cn         = EXCLUDED.org_name_cn,
    org_short_name      = EXCLUDED.org_short_name,
    parent_id           = EXCLUDED.parent_id,
    parent_code         = EXCLUDED.parent_code,
    site_code           = EXCLUDED.site_code,
    site_business_type  = EXCLUDED.site_business_type,
    level               = EXCLUDED.level,
    path                = EXCLUDED.path,
    status              = EXCLUDED.status,
    sort_order          = EXCLUDED.sort_order,
    updated_at          = NOW();
  SELECT id INTO v_site_dp_layer_id FROM sys_organizations WHERE org_code = 'SITE-DONGPENG-LAYER';

  -- SITE-VTE-BROILER（万象肉鸡养殖场，COMP-LAO-FOOD）
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    site_code, site_business_type,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'SITE-VTE-BROILER',
    '万象肉鸡养殖场', '万象肉鸡养殖场', '万象肉鸡场',
    'SITE', v_comp_food_id, 'COMP-LAO-FOOD',
    'SITE-VTE-BROILER', 'BROILER_FARM',
    4, '/ORG-GROUP/BU-FOOD/COMP-LAO-FOOD/SITE-VTE-BROILER/', 'ACTIVE', 10,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name            = EXCLUDED.org_name,
    org_name_cn         = EXCLUDED.org_name_cn,
    org_short_name      = EXCLUDED.org_short_name,
    parent_id           = EXCLUDED.parent_id,
    parent_code         = EXCLUDED.parent_code,
    site_code           = EXCLUDED.site_code,
    site_business_type  = EXCLUDED.site_business_type,
    level               = EXCLUDED.level,
    path                = EXCLUDED.path,
    status              = EXCLUDED.status,
    sort_order          = EXCLUDED.sort_order,
    updated_at          = NOW();
  SELECT id INTO v_site_vte_broiler_id FROM sys_organizations WHERE org_code = 'SITE-VTE-BROILER';

  -- SITE-VTE-SLAUGHTER（万象屠宰加工厂，COMP-LAO-FOOD）
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    site_code, site_business_type,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'SITE-VTE-SLAUGHTER',
    '万象屠宰加工厂', '万象屠宰加工厂', '万象屠宰厂',
    'SITE', v_comp_food_id, 'COMP-LAO-FOOD',
    'SITE-VTE-SLAUGHTER', 'SLAUGHTER',
    4, '/ORG-GROUP/BU-FOOD/COMP-LAO-FOOD/SITE-VTE-SLAUGHTER/', 'ACTIVE', 20,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name            = EXCLUDED.org_name,
    org_name_cn         = EXCLUDED.org_name_cn,
    org_short_name      = EXCLUDED.org_short_name,
    parent_id           = EXCLUDED.parent_id,
    parent_code         = EXCLUDED.parent_code,
    site_code           = EXCLUDED.site_code,
    site_business_type  = EXCLUDED.site_business_type,
    level               = EXCLUDED.level,
    path                = EXCLUDED.path,
    status              = EXCLUDED.status,
    sort_order          = EXCLUDED.sort_order,
    updated_at          = NOW();
  SELECT id INTO v_site_vte_slaughter_id FROM sys_organizations WHERE org_code = 'SITE-VTE-SLAUGHTER';

  -- SITE-VTE-FEED（万象饲料厂，COMP-LAO-FOOD）
  INSERT INTO sys_organizations (
    org_code, org_name, org_name_cn, org_short_name,
    org_type, parent_id, parent_code,
    site_code, site_business_type,
    level, path, status, sort_order,
    created_at, updated_at
  ) VALUES (
    'SITE-VTE-FEED',
    '万象饲料厂', '万象饲料厂', '万象饲料厂',
    'SITE', v_comp_food_id, 'COMP-LAO-FOOD',
    'SITE-VTE-FEED', 'FEED_MILL',
    4, '/ORG-GROUP/BU-FOOD/COMP-LAO-FOOD/SITE-VTE-FEED/', 'PLANNED', 30,
    NOW(), NOW()
  )
  ON CONFLICT (org_code) DO UPDATE SET
    org_name            = EXCLUDED.org_name,
    org_name_cn         = EXCLUDED.org_name_cn,
    org_short_name      = EXCLUDED.org_short_name,
    parent_id           = EXCLUDED.parent_id,
    parent_code         = EXCLUDED.parent_code,
    site_code           = EXCLUDED.site_code,
    site_business_type  = EXCLUDED.site_business_type,
    level               = EXCLUDED.level,
    path                = EXCLUDED.path,
    sort_order          = EXCLUDED.sort_order,
    updated_at          = NOW();
  SELECT id INTO v_site_vte_feed_id FROM sys_organizations WHERE org_code = 'SITE-VTE-FEED';

  -- ============================================================
  -- § 4. 为所有 SITE 生成 7 个标准部门
  -- 遍历 org_type = 'SITE' 的节点，逐一生成子部门
  -- ============================================================
  FOR r_site IN
    SELECT id, org_code, org_name_cn, org_name, level, path, status
    FROM sys_organizations
    WHERE org_type = 'SITE'
    ORDER BY org_code
  LOOP
    FOR i IN 1..7 LOOP
      v_suffix := v_dept_suffixes[i];
      v_dname  := v_dept_names[i];

      INSERT INTO sys_organizations (
        org_code, org_name, org_name_cn, org_short_name,
        org_type, parent_id, parent_code,
        level, path, status, sort_order,
        created_at, updated_at
      ) VALUES (
        'DEPT-' || r_site.org_code || '-' || v_suffix,
        COALESCE(r_site.org_name_cn, r_site.org_name) || '-' || v_dname,
        COALESCE(r_site.org_name_cn, r_site.org_name) || '-' || v_dname,
        v_dname,
        'DEPARTMENT',
        r_site.id,
        r_site.org_code,
        r_site.level + 1,
        r_site.path || 'DEPT-' || r_site.org_code || '-' || v_suffix || '/',
        r_site.status,
        i * 10,
        NOW(), NOW()
      )
      ON CONFLICT (org_code) DO UPDATE SET
        org_name       = EXCLUDED.org_name,
        org_name_cn    = EXCLUDED.org_name_cn,
        org_short_name = EXCLUDED.org_short_name,
        parent_id      = EXCLUDED.parent_id,
        parent_code    = EXCLUDED.parent_code,
        level          = EXCLUDED.level,
        path           = EXCLUDED.path,
        sort_order     = EXCLUDED.sort_order,
        updated_at     = NOW();
    END LOOP;
  END LOOP;

END $$;

-- ============================================================
-- § 5. 索引（IF NOT EXISTS）
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orgs_code
  ON sys_organizations (org_code);

CREATE INDEX IF NOT EXISTS idx_orgs_parent_code
  ON sys_organizations (parent_code)
  WHERE parent_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orgs_site_code
  ON sys_organizations (site_code)
  WHERE site_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orgs_business_type
  ON sys_organizations (site_business_type)
  WHERE site_business_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orgs_sort
  ON sys_organizations (sort_order, org_code);

-- ============================================================
-- End of migration 20260531_org_runtime_phase1.sql
-- ============================================================

-- ============================================================
-- Phoenix ERP V3 — Organization Runtime Phase 1
-- 权限菜单数据（幂等，ON CONFLICT DO NOTHING）
-- 生成日期：2026-05-31
-- ============================================================

-- ① 注册 Org Runtime 菜单（COMMON domain）
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order, route)
VALUES
  ('MENU_ORG_VIEW',       '组织架构查看',   'COMMON', 41, '/master-data/organizations'),
  ('MENU_ORG_MANAGE',     '组织架构管理',   'COMMON', 42, '/master-data/organizations'),
  ('MENU_ORG_USER_SCOPE', '用户组织权限',   'COMMON', 43, '/master-data/user-orgs')
ON CONFLICT (menu_code) DO NOTHING;

-- ② 角色-菜单权限矩阵（通过 JOIN 解析 code → id，缺失角色/菜单自动跳过）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, x.perm_codes
FROM (VALUES
  -- ── ROLE_ADMIN：组织架构全权限 ─────────────────────────────────────────────
  ('ROLE_ADMIN',      'MENU_ORG_VIEW',       'V,C,E,D,A,X'),
  ('ROLE_ADMIN',      'MENU_ORG_MANAGE',     'V,C,E,D,A,X'),
  ('ROLE_ADMIN',      'MENU_ORG_USER_SCOPE', 'V,C,E,D,A,X'),

  -- ── ROLE_CEO：查看组织树 + 导出；查看用户组织权限 + 导出 ──────────────────
  ('ROLE_CEO',        'MENU_ORG_VIEW',       'V,X'),
  ('ROLE_CEO',        'MENU_ORG_USER_SCOPE', 'V,X'),

  -- ── ROLE_FIN_CFO：只读组织架构 ───────────────────────────────────────────
  ('ROLE_FIN_CFO',    'MENU_ORG_VIEW',       'V,X'),

  -- ── ROLE_REGION_MGR：只读组织架构 ────────────────────────────────────────
  ('ROLE_REGION_MGR', 'MENU_ORG_VIEW',       'V'),

  -- ── ROLE_FARM_MGR：只读组织架构 ──────────────────────────────────────────
  ('ROLE_FARM_MGR',   'MENU_ORG_VIEW',       'V'),

  -- ── ROLE_HR_MANAGER：管理组织架构及用户权限分配 ───────────────────────────
  ('ROLE_HR_MANAGER', 'MENU_ORG_VIEW',       'V,C,E,X'),
  ('ROLE_HR_MANAGER', 'MENU_ORG_USER_SCOPE', 'V,C,E,X')
) AS x(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = x.role_code
JOIN sys_menu m ON m.menu_code = x.menu_code
ON CONFLICT (role_id, menu_id) DO NOTHING;
