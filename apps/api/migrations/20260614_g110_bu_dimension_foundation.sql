-- ════════════════════════════════════════════════════════════════════════
-- G110 事业群「业务维度」地基（法人树 ⟂ 事业群解耦 · Stage 1）2026-06-14
-- ────────────────────────────────────────────────────────────────────────
-- 背景：当前 sys_organizations 单棵树把"事业群(BU)"压成了公司之上的行政层
--   （集团→BU→公司），导致公司只能 1:1 归一个 BU、无法表达"事业群跨公司"。
--   而系统权限隔离按 公司/场站/农场（DataScope），BU 本就只是展示/汇总分组。
-- 本阶段：引入独立的"业务维度"两张表，把事业群从法人树解耦出来——
--   · biz_business_units      事业群主表
--   · biz_bu_membership       经营单元(公司/场站) ↔ 事业群 M:N + 权重
--   按现状 seed（公司级 1:1，零认知负担）。**不动 sys_organizations、不碰权限。**
-- 后续阶段：法人树抽掉 BU 层(公司直挂集团) / 经营看板按 membership 聚合。
-- ⚠️ 幂等（IF NOT EXISTS / NOT EXISTS）；to_regclass 守卫；纯新增，零破坏。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ① 事业群主表
CREATE TABLE IF NOT EXISTS biz_business_units (
  bu_code         VARCHAR(32)  PRIMARY KEY,
  bu_name         VARCHAR(128) NOT NULL,
  bu_short_name   VARCHAR(64),
  manager_user_id BIGINT,
  sort_order      INT          DEFAULT 0,
  status          VARCHAR(16)  DEFAULT 'ACTIVE',
  remark          TEXT,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ② 经营单元 ↔ 事业群 成员表（M:N + 权重，支持一家公司按场站分归多线）
CREATE TABLE IF NOT EXISTS biz_bu_membership (
  id          BIGSERIAL    PRIMARY KEY,
  bu_code     VARCHAR(32)  NOT NULL REFERENCES biz_business_units(bu_code),
  org_code    VARCHAR(64)  NOT NULL,            -- → sys_organizations(COMPANY/SITE)
  org_type    VARCHAR(16)  NOT NULL,            -- COMPANY / SITE
  weight_pct  NUMERIC(5,2) DEFAULT 100,         -- 经营归集权重（多业务线公司可拆）
  is_primary  BOOLEAN      DEFAULT TRUE,         -- 主业务线（默认展示）
  status      VARCHAR(16)  DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (bu_code, org_code)
);
CREATE INDEX IF NOT EXISTS idx_bu_membership_org ON biz_bu_membership(org_code);
CREATE INDEX IF NOT EXISTS idx_bu_membership_bu  ON biz_bu_membership(bu_code);

-- ③ seed 事业群（与现状一致：农业 / 食品）
INSERT INTO biz_business_units (bu_code, bu_name, bu_short_name, sort_order, status)
SELECT v.bu_code, v.bu_name, v.bu_short, v.sort_order, 'ACTIVE'
FROM (VALUES
  ('BU-AGRI', '凤凰农业事业群', '农业群', 10),
  ('BU-FOOD', '凤凰食品事业群', '食品群', 20)
) AS v(bu_code, bu_name, bu_short, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM biz_business_units b WHERE b.bu_code = v.bu_code);

-- ④ seed 成员关系（公司级 1:1，对应现树）
INSERT INTO biz_bu_membership (bu_code, org_code, org_type, weight_pct, is_primary, status)
SELECT v.bu_code, v.org_code, 'COMPANY', 100, TRUE, 'ACTIVE'
FROM (VALUES
  ('BU-AGRI', 'COMP-LAO-AGRI'),
  ('BU-AGRI', 'COMP-LAO-XINGCHI'),
  ('BU-FOOD', 'COMP-LAO-FOOD')
) AS v(bu_code, org_code)
WHERE NOT EXISTS (
  SELECT 1 FROM biz_bu_membership m
   WHERE m.bu_code = v.bu_code AND m.org_code = v.org_code
);

COMMIT;
