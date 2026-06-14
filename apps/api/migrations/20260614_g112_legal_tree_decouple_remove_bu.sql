-- ════════════════════════════════════════════════════════════════════════
-- G112 法人树解耦：抽掉事业群(BU)层，公司直挂集团（Stage 3）⚠️ 高风险·待审
-- ────────────────────────────────────────────────────────────────────────
-- 目标：法人树 = 集团→公司→场站→部门；事业群改由 biz_bu_membership(g110)承载。
-- 做法：把 BU-AGRI / BU-FOOD 整棵子树上移一层——
--   · path 去掉 BU 段（物化路径 replace）
--   · level 全部 -1
--   · 直属公司 parent 改挂集团
--   · 最后删除 BU-AGRI / BU-FOOD 两个节点
-- ⚠️ 这是结构性大动作，重写物化路径。强烈建议先在 DB 副本 dry-run 核对再上生产。
--    幂等保护：仅当 BU 节点仍存在(未解耦)时才执行；用 org_code 解析；to_regclass 守卫。
-- 权限影响：无。DataScope 按 公司/场站/农场，不依赖 BU 层。
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_group_id BIGINT;
BEGIN
  IF to_regclass('public.sys_organizations') IS NULL THEN RETURN; END IF;
  SELECT id INTO v_group_id FROM sys_organizations WHERE org_code = 'ORG-GROUP';

  -- ── BU-AGRI 子树上移（仅当 BU-AGRI 仍在树中才做，保证幂等）──────────────
  IF EXISTS (SELECT 1 FROM sys_organizations WHERE org_code = 'BU-AGRI') THEN
    -- 1) 整棵子树 path 去 BU 段 + level-1（BU 节点自身 path 不带尾随内容，不被匹配）
    UPDATE sys_organizations
       SET level = level - 1,
           path  = replace(path, '/ORG-GROUP/BU-AGRI/', '/ORG-GROUP/'),
           updated_at = NOW()
     WHERE path LIKE '/ORG-GROUP/BU-AGRI/%';
    -- 2) 直属公司改挂集团
    UPDATE sys_organizations
       SET parent_id = v_group_id, parent_code = 'ORG-GROUP', updated_at = NOW()
     WHERE parent_code = 'BU-AGRI' AND org_type = 'COMPANY';
    -- 3) 删 BU-AGRI 节点
    DELETE FROM sys_organizations WHERE org_code = 'BU-AGRI';
  END IF;

  -- ── BU-FOOD 子树上移 ───────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM sys_organizations WHERE org_code = 'BU-FOOD') THEN
    UPDATE sys_organizations
       SET level = level - 1,
           path  = replace(path, '/ORG-GROUP/BU-FOOD/', '/ORG-GROUP/'),
           updated_at = NOW()
     WHERE path LIKE '/ORG-GROUP/BU-FOOD/%';
    UPDATE sys_organizations
       SET parent_id = v_group_id, parent_code = 'ORG-GROUP', updated_at = NOW()
     WHERE parent_code = 'BU-FOOD' AND org_type = 'COMPANY';
    DELETE FROM sys_organizations WHERE org_code = 'BU-FOOD';
  END IF;

  -- 注：事业群归属已由 biz_bu_membership(g110) 承载；经营看板改读维度表（前端 S5）。
END $$;
