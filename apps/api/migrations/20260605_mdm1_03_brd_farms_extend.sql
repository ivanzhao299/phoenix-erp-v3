-- ═════════════════════════════════════════════════════════════════════════════
-- MDM-1 §4-1: brd_farms 增加 mapped_site_code + 回填
-- ═════════════════════════════════════════════════════════════════════════════
-- 表不存在时（CI 测试环境无养殖历史表）优雅跳过；生产 DB 正常执行。
-- 已在生产 DB 实际跑过（UPDATE 4 行：孟赛 3 + 东鹏 1），CI 镜像确保未来回归。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  unmapped INT := 0;
  rec RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='brd_farms') THEN
    RAISE NOTICE '[mdm1_03] brd_farms 不存在（CI 测试环境），跳过';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS mapped_site_code VARCHAR(64)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brd_farms_mapped_site ON brd_farms (mapped_site_code)';

  EXECUTE $$UPDATE brd_farms SET mapped_site_code='SITE-MENGSAI-LAYER'
            WHERE farm_code IN ('LPH_MENGSAI','FARM001','FARM-MS')
              AND (mapped_site_code IS NULL OR mapped_site_code = '')$$;
  EXECUTE $$UPDATE brd_farms SET mapped_site_code='SITE-DONGPENG-LAYER'
            WHERE farm_code = 'FARM-DP'
              AND (mapped_site_code IS NULL OR mapped_site_code = '')$$;

  -- 审计
  EXECUTE 'SELECT count(*) FROM brd_farms WHERE mapped_site_code IS NULL OR mapped_site_code='''''
    INTO unmapped;
  IF unmapped > 0 THEN
    RAISE NOTICE 'brd_farms 仍有 % 行未映射 site_code（需业务方确认）', unmapped;
    FOR rec IN EXECUTE 'SELECT farm_code, farm_name FROM brd_farms
                         WHERE mapped_site_code IS NULL OR mapped_site_code='''''
    LOOP
      RAISE NOTICE '  · farm_code=% farm_name=%', rec.farm_code, rec.farm_name;
    END LOOP;
  END IF;
END $body$;

COMMIT;
