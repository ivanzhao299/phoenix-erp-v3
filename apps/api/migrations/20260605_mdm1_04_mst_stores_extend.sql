-- ═════════════════════════════════════════════════════════════════════════════
-- MDM-1 §4-2: mst_stores 增加 mapped_site_code + company_code
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务背景：mst_stores 是销售门店主档（8 行），缺 company_code 字段。
-- 同样不删原字段、不改主键，仅扩展 + 回填 mapped_site_code。
--
-- 幂等 + 未在生产 DB 执行。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE mst_stores
  ADD COLUMN IF NOT EXISTS company_code     VARCHAR(64),
  ADD COLUMN IF NOT EXISTS mapped_site_code VARCHAR(64);

COMMENT ON COLUMN mst_stores.company_code IS
  '门店所属公司，引用 sys_organizations.org_code (COMPANY)。';
COMMENT ON COLUMN mst_stores.mapped_site_code IS
  '映射到 sys_organizations.org_code (SITE) 的 canonical 站点编码。'
  '业务查询应以 mapped_site_code 为准；store_code 保留为历史兼容键。';

CREATE INDEX IF NOT EXISTS idx_mst_stores_company    ON mst_stores (company_code);
CREATE INDEX IF NOT EXISTS idx_mst_stores_mapped_site ON mst_stores (mapped_site_code);

-- ── 回填 ────────────────────────────────────────────────────────────────────
-- mst_stores 当前 8 行的具体内容业务方未提供 → 仅在能明确对应的情况下回填。
-- 大概率门店都属于 COMP-LAO-AGRI（孟赛/东鹏直营店）或 COMP-LAO-FOOD（万象食品店）
-- 但不允许"乱填"——未明确的留 NULL 等业务方确认。

-- 示例回填规则（在业务方提供清单后才生效）：
--   UPDATE mst_stores SET company_code='COMP-LAO-AGRI', mapped_site_code='SITE-MENGSAI-LAYER'
--    WHERE store_code IN ('STORE-MS-001', ...);
--
-- 本次不主动回填任何行；列为审计输出。

DO $$
DECLARE
  total INT;
  unmapped INT;
BEGIN
  SELECT count(*) INTO total FROM mst_stores;
  SELECT count(*) INTO unmapped FROM mst_stores
   WHERE mapped_site_code IS NULL OR company_code IS NULL;
  RAISE NOTICE 'mst_stores 共 % 行，未映射 site_code/company_code 的 % 行 → 待业务方提供 8 行清单', total, unmapped;
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证：
--   SELECT store_code, store_name, company_code, mapped_site_code FROM mst_stores ORDER BY store_code;
--   -- 期望：8 行都需要业务方逐个映射
-- ═════════════════════════════════════════════════════════════════════════════
