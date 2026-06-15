-- ════════════════════════════════════════════════════════════════════════
-- G123 清理 F-DEBUG 测试养殖场行 2026-06-15
-- impersonation 实测发现 brd_farms 有测试行 farm_code='F-DEBUG' / farm_name='X'
-- （mapped_site_code/store_code 均空）。精确删除，guard 防误删真实养殖场。
-- 先清依赖（flocks/daily_logs），再删 farm；幂等。
-- ════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.brd_farms') IS NOT NULL
     AND EXISTS (SELECT 1 FROM brd_farms WHERE farm_code='F-DEBUG' AND COALESCE(farm_name,'')='X') THEN
    IF to_regclass('public.brd_daily_logs') IS NOT NULL THEN
      DELETE FROM brd_daily_logs WHERE farm_code='F-DEBUG';
    END IF;
    IF to_regclass('public.brd_flocks') IS NOT NULL THEN
      DELETE FROM brd_flocks WHERE farm_code='F-DEBUG';
    END IF;
    DELETE FROM brd_farms WHERE farm_code='F-DEBUG' AND COALESCE(farm_name,'')='X';
  END IF;
END $$;
