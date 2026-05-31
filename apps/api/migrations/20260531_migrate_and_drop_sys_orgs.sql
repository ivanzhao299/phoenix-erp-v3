-- ============================================================
-- Migration: 将 sys_orgs 数据迁移至 sys_organizations，然后删除旧表
-- 方案 B：以 sys_organizations 为唯一数据源
--
-- 流程：
--   1. 将 sys_orgs 存量数据映射写入 sys_organizations（幂等，按 org_code 去重）
--   2. org_type 字符串 → 新枚举值映射
--   3. parent_id 两步处理（先无父写入，再回填父子关系）
--   4. 删除 sys_orgs 表（彻底清理）
-- ============================================================

-- 修复（Phase C）：sys_orgs 是 generic-crud 运行时建的旧表，全新数据库 SQL 阶段
-- 不存在 → 后续 FROM sys_orgs 报 relation does not exist。
-- 补建最小骨架：全新 DB 上该表为空，迁移0行后正常 DROP；
-- 生产环境表已存在则 CREATE 跳过，正常迁移存量数据。
CREATE TABLE IF NOT EXISTS sys_orgs (
  id         SERIAL PRIMARY KEY,
  org_code   VARCHAR(64),
  org_name   VARCHAR(128),
  org_type   VARCHAR(64),
  parent_id  INTEGER DEFAULT 0,
  status     VARCHAR(32) DEFAULT 'ACTIVE',
  remark     TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ── Step 1: 先把所有顶级节点写进来（parent_id 留 NULL）──────────────────
INSERT INTO sys_organizations (org_code, org_name, org_type, parent_id, level, status, remark, created_at, updated_at)
SELECT
  COALESCE(o.org_code, 'ORG_' || o.id::TEXT),
  o.org_name,
  CASE
    WHEN o.org_type ILIKE '%集团%' OR o.org_type ILIKE 'group'      THEN 'GROUP'
    WHEN o.org_type ILIKE '%公司%' OR o.org_type ILIKE 'company'    THEN 'COMPANY'
    WHEN o.org_type ILIKE '%工厂%' OR o.org_type ILIKE 'factory'    THEN 'FACTORY'
    WHEN o.org_type ILIKE '%农场%' OR o.org_type ILIKE 'farm'       THEN 'FACTORY'
    WHEN o.org_type ILIKE '%项目%' OR o.org_type ILIKE 'project'    THEN 'PROJECT'
    WHEN o.org_type ILIKE '%仓库%' OR o.org_type ILIKE 'warehouse'  THEN 'WAREHOUSE'
    WHEN o.org_type ILIKE '%门店%' OR o.org_type ILIKE 'store'      THEN 'STORE'
    ELSE 'DEPARTMENT'
  END,
  NULL,   -- parent_id 先全部置为 NULL，第二步再回填
  1,
  CASE WHEN o.status IN ('ACTIVE','1','active','启用') THEN 'ACTIVE' ELSE 'INACTIVE' END,
  o.remark,
  COALESCE(o.created_at, NOW()),
  COALESCE(o.updated_at, NOW())
FROM sys_orgs o
WHERE NOT EXISTS (
  SELECT 1 FROM sys_organizations n
  WHERE n.org_code = COALESCE(o.org_code, 'ORG_' || o.id::TEXT)
)
ON CONFLICT (org_code) DO NOTHING;

-- ── Step 2: 回填父子关系（sys_orgs.parent_id → sys_organizations.id）──────
-- 遍历所有在 sys_orgs 中 parent_id != 0 的节点，找到对应父节点的新 id
DO $$
DECLARE
  rec RECORD;
  parent_new_id BIGINT;
  child_new_id  BIGINT;
  depth_level   INT;
BEGIN
  FOR rec IN
    SELECT o.id AS old_id, o.org_code, o.parent_id AS old_parent_id, p.org_code AS parent_code
    FROM sys_orgs o
    JOIN sys_orgs p ON p.id = o.parent_id
    WHERE o.parent_id IS NOT NULL AND o.parent_id <> 0
  LOOP
    SELECT id INTO parent_new_id FROM sys_organizations WHERE org_code = rec.parent_code LIMIT 1;
    SELECT id INTO child_new_id  FROM sys_organizations WHERE org_code = COALESCE(rec.org_code, 'ORG_' || rec.old_id::TEXT) LIMIT 1;

    IF parent_new_id IS NOT NULL AND child_new_id IS NOT NULL THEN
      -- 计算层级
      SELECT COALESCE(level, 0) + 1 INTO depth_level FROM sys_organizations WHERE id = parent_new_id;
      UPDATE sys_organizations
      SET parent_id = parent_new_id,
          level     = depth_level,
          path      = (SELECT path FROM sys_organizations WHERE id = parent_new_id) || '/' || child_new_id::TEXT
      WHERE id = child_new_id;
    END IF;
  END LOOP;
END $$;

-- ── Step 3: 清理 — 删除旧表和相关配置 ─────────────────────────────────────
-- 删除 sys_orgs 表（IF EXISTS 保证幂等）
DROP TABLE IF EXISTS sys_orgs CASCADE;

-- 清理 wf_data_source 中的旧 SYS_ORGS 条目，替换为新表引用
UPDATE wf_data_sources
SET config = jsonb_set(
  jsonb_set(config, '{table}', '"sys_organizations"'),
  '{valueField}', '"org_code"'
)
WHERE code = 'SYS_ORGS'
AND   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wf_data_sources');

-- 替换 wf_data_catalog 中的旧配置（兼容两种表名）
UPDATE wf_data_catalog
SET meta = jsonb_set(
  jsonb_set(meta, '{table}', '"sys_organizations"'),
  '{valueField}', '"org_code"'
)
WHERE code = 'SYS_ORGS'
AND   meta->>'table' = 'sys_orgs'
AND   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wf_data_catalog');
