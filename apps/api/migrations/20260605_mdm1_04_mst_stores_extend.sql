-- ═════════════════════════════════════════════════════════════════════════════
-- MDM-1 §4-2: mst_stores 增加 mapped_site_code + company_code
-- 表不存在时（CI 测试环境）优雅跳过。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  total INT := 0;
  unmapped INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='mst_stores') THEN
    RAISE NOTICE '[mdm1_04] mst_stores 不存在（CI 测试环境），跳过';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE mst_stores ADD COLUMN IF NOT EXISTS company_code VARCHAR(64)';
  EXECUTE 'ALTER TABLE mst_stores ADD COLUMN IF NOT EXISTS mapped_site_code VARCHAR(64)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_mst_stores_company ON mst_stores (company_code)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_mst_stores_mapped_site ON mst_stores (mapped_site_code)';

  -- 8 行待业务方提供清单后再回填
  EXECUTE 'SELECT count(*) FROM mst_stores' INTO total;
  EXECUTE 'SELECT count(*) FROM mst_stores WHERE mapped_site_code IS NULL OR company_code IS NULL' INTO unmapped;
  RAISE NOTICE 'mst_stores 共 % 行，未映射 % 行 → 待业务方提供清单', total, unmapped;
END $body$;

COMMIT;
