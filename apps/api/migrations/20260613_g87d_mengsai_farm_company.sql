-- ════════════════════════════════════════════════════════════════════════
-- G87-D 孟赛养殖场挂靠补漏 — 生产实际场码为 LPH_MENGSAI（非种子的 FARM-MS）
-- ────────────────────────────────────────────────────────────────────────
-- 生产实证（/api/lookup/farms）：孟赛蛋鸡场在生产的 farm_code = 'LPH_MENGSAI'
--   （真实业务数据，与 R3 种子的 FARM-MS 不同），G87 按 FARM-MS 回填故漏挂。
-- 归属（用户确认）：孟赛养殖场 → 老挝凤凰农业发展有限公司（COMP-LAO-AGRI）。
-- 匹配按「编码 ∈ 已知孟赛码 或 场名=孟赛蛋鸡场」双口径，仅回填未挂靠行；幂等。
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.brd_farms') IS NOT NULL THEN
    UPDATE brd_farms SET company_code = 'COMP-LAO-AGRI'
    WHERE (farm_code IN ('LPH_MENGSAI', 'FARM-MS') OR farm_name = '孟赛蛋鸡场')
      AND company_code IS NULL;
  END IF;
END $$;
