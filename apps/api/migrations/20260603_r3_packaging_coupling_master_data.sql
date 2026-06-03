-- ════════════════════════════════════════════════════════════════════════
-- R3 · Packaging Terminal Coupling — 主数据(场站 / SKU / 灰度模式)
-- ────────────────────────────────────────────────────────────────────────
-- 依据：docs/packaging-terminal-coupling-audit-r15.md（P0 SITE / P1 SKU）
-- 目标：补齐 R1.5 审计确认缺失的三类主数据，使 SITE/SPEC/SKU 维度真正可用。
--   1) brd_farms：真实场站（FARM-MS 孟赛 / FARM-DP 东鹏），替代默认 'site-01'
--   2) product_skus：grade × spec → sku_code（product_code 对齐 PRD-EGG-{grade}，保证 PATH A/B 一致）
--   3) inv_source_mode：SITE 级灰度（FARM-MS=PACKAGING_INBOUND 孟赛灰度 / FARM-DP=TEMP_PRODUCTION_INBOUND）
-- 全部幂等：ON CONFLICT DO NOTHING / to_regclass 守卫
-- ════════════════════════════════════════════════════════════════════════

-- ① 真实场站主数据
DO $$
BEGIN
  IF to_regclass('public.brd_farms') IS NOT NULL THEN
    INSERT INTO brd_farms (farm_code, farm_name, location, status, store_code)
    VALUES
      ('FARM-MS', '孟赛蛋鸡场', '老挝·孟赛', 'ACTIVE', 'ALL'),
      ('FARM-DP', '东鹏蛋鸡场', '老挝·东鹏', 'ACTIVE', 'ALL')
    ON CONFLICT (farm_code) DO NOTHING;
  END IF;
END $$;

-- ② 产品 SKU 主数据：可售等级(AA/A/B/C) × 包装规格 → sku_code
--    sku_code = SKU-{grade}-{qty_per_unit}；product_code 对齐 PRD-EGG-{grade}
--    （保证 createProductionBatch 以 SKU 解析 product_code 时与 PATH B 一致）
DO $$
BEGIN
  IF to_regclass('public.product_skus') IS NOT NULL AND to_regclass('public.packaging_specs') IS NOT NULL THEN
    INSERT INTO product_skus (sku_code, product_code, product_name, grade_code, spec_code, sku_name, status)
    SELECT
      'SKU-' || g.grade_code || '-' || (s.qty_per_unit)::int,
      'PRD-EGG-' || g.grade_code,
      '鸡蛋',
      g.grade_code,
      s.spec_code,
      g.grade_code || '级 ' || s.spec_name,
      'ACTIVE'
    FROM (VALUES ('AA'),('A'),('B'),('C')) AS g(grade_code)
    CROSS JOIN packaging_specs s
    WHERE s.qty_per_unit IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ③ SITE 级库存来源模式（灰度）：孟赛先切包装入库，东鹏维持过渡
DO $$
BEGIN
  IF to_regclass('public.inv_source_mode') IS NOT NULL THEN
    INSERT INTO inv_source_mode (scope_level, scope_code, mode, remark, updated_by)
    VALUES
      ('SITE', 'FARM-MS', 'PACKAGING_INBOUND',
       'R3 孟赛灰度：包装完成入库（真实场站 FARM-MS）', 'r3'),
      ('SITE', 'FARM-DP', 'TEMP_PRODUCTION_INBOUND',
       'R3 东鹏：维持临时生产入库（待孟赛验证后再切）', 'r3')
    ON CONFLICT (scope_level, scope_code) DO NOTHING;
  END IF;
END $$;
