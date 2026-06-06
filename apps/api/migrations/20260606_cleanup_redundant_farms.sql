-- ═════════════════════════════════════════════════════════════════════════════
-- 清理 brd_farms 重复孟赛记录
-- ═════════════════════════════════════════════════════════════════════════════
-- 表不存在时（CI 测试环境）优雅跳过。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='brd_farms') THEN
    RAISE NOTICE '[cleanup_redundant_farms] brd_farms 不存在（CI），跳过';
    RETURN;
  END IF;

  EXECUTE $$DELETE FROM brd_farms WHERE farm_code IN ('FARM-MS', 'FARM001')$$;
END $body$;

COMMIT;
