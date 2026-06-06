-- ═════════════════════════════════════════════════════════════════════════════
-- 清理 Phase 10E onboarding 鬼影数据
-- ═════════════════════════════════════════════════════════════════════════════
-- 表不存在时（CI 测试环境）优雅跳过。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='brd_farms') THEN
    RAISE NOTICE '[cleanup_phase10e] brd_farms 不存在（CI），跳过';
    RETURN;
  END IF;

  -- 1) 删 brd_flocks（鸡群必须先删，避免 FK 残留）
  EXECUTE $$DELETE FROM brd_flocks WHERE farm_code = 'FARM-01'$$;

  -- 2) 删 brd_houses（Phase 10E 测试鸡舍 A001-A006 + B001）
  EXECUTE $$DELETE FROM brd_houses
             WHERE house_code IN ('A001','A002','A003','A004','A005','A006','B001')$$;

  -- 3) 删 brd_farms FARM-01 凤羽一号基地
  EXECUTE $$DELETE FROM brd_farms WHERE farm_code = 'FARM-01'$$;
END $body$;

COMMIT;
