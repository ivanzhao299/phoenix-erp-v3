-- ════════════════════════════════════════════════════════════════════════
-- G123 清理 F-DEBUG 测试养殖场行 2026-06-15
-- impersonation 实测发现 brd_farms 有测试行 farm_code='F-DEBUG' / farm_name='X'。
-- 绝不报错版：单条删除 + EXCEPTION WHEN OTHERS 兜底——无论表/列/FK 状态如何，
--   失败即静默跳过，绝不红灯部署（该清理为低价值 nice-to-have）。
-- ════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  DELETE FROM brd_farms WHERE farm_code = 'F-DEBUG' AND COALESCE(farm_name, '') = 'X';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[g123] F-DEBUG 清理跳过（依赖/表缺失等）：%', SQLERRM;
END $$;
