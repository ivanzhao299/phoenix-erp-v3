-- ════════════════════════════════════════════════════════════════════════
-- Packaging Runtime Production Recovery P1E — 包装库存链路 schema drift 修复
-- ────────────────────────────────────────────────────────────────────────
-- 依据：docs/packaging-runtime-convergence-validation-phase-p1d.md（P0 schema drift）
-- 背景：包装收口（P1C）依赖 pkg_packing_records.shift_id / grading_codes_json，
--   该字段由历史 v6_packing_grading_codes.sql / v7_shift_tracking.sql 添加，
--   但 CI deploy.yml 迁移 glob 仅扫描 ddl/* + v3_schema_complete + migrations/2026*.sql，
--   **不包含 v6/v7（文件名非 2026 前缀）** → 生产库可能缺这些列 →
--   BFF packing/submit INSERT 与 completeTerminalPacking SELECT 报错（被 safe 吞）→ 库存静默不生成。
-- 修复：把 v6/v7 的列定义以 2026 前缀幂等迁移重新落地，确保生产 CI 必执行。
--
-- 安全保证：
--   · 全部 ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS（可重复执行）
--   · 不删除、不重命名、不修改既有字段
--   · 回填仅针对尚未回填的历史行（WHERE 守卫），不覆盖已有数据
--   · to_regclass 守卫：表不存在时跳过
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- ① pkg_packing_records.shift_id（v7）+ grading_codes_json（v6）
  IF to_regclass('public.pkg_packing_records') IS NOT NULL THEN
    ALTER TABLE pkg_packing_records ADD COLUMN IF NOT EXISTS shift_id           INTEGER;
    ALTER TABLE pkg_packing_records ADD COLUMN IF NOT EXISTS grading_codes_json JSONB NOT NULL DEFAULT '[]'::jsonb;

    -- 回填：现有 grading_code → grading_codes_json 数组（仅未回填的行）
    UPDATE pkg_packing_records
       SET grading_codes_json = jsonb_build_array(grading_code)
     WHERE grading_code IS NOT NULL
       AND grading_codes_json = '[]'::jsonb;

    CREATE INDEX IF NOT EXISTS idx_pkg_packing_records_shift ON pkg_packing_records (shift_id);
  END IF;

  -- ② pkg_source_batches.shift_id（v7，BFF 集蛋接收按 shift_id 查询依赖）
  IF to_regclass('public.pkg_source_batches') IS NOT NULL THEN
    ALTER TABLE pkg_source_batches ADD COLUMN IF NOT EXISTS shift_id INTEGER;
    CREATE INDEX IF NOT EXISTS idx_pkg_source_batches_shift ON pkg_source_batches (shift_id);
  END IF;
END $$;
