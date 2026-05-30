-- ============================================================
-- Phoenix ERP V3 — Phase H4 回填脚本
-- backfill-inventory-batches-sku.sql
--
-- 用途：将 inv_batches 中旧批次尝试与 product_skus 匹配，
--       成功则自动写入 sku_code / grade_code_std / spec_code
--
-- ⚠️  注意：
--   1. 本脚本是可选操作，不执行不影响现有功能
--   2. 执行前请先备份 inv_batches 表
--   3. 只更新能精确三元匹配的记录（product_code + quality_grade + packaging_spec/spec_code）
--   4. 对于 quality_grade 和 packaging_spec 不在主数据中的旧批次，跳过不改动
--   5. UPDATE 块默认注释保护，请先 SELECT 验证后再执行
--
-- 生效日期：2026-05-30
-- ============================================================

-- Step 0: 查看待回填的记录数量
SELECT
  COUNT(*)                                                   AS total_batches,
  COUNT(CASE WHEN sku_code IS NULL THEN 1 END)              AS without_sku,
  COUNT(CASE WHEN sku_code IS NOT NULL THEN 1 END)          AS with_sku,
  COUNT(CASE WHEN status = 'AVAILABLE' AND sku_code IS NULL THEN 1 END) AS available_without_sku
FROM inv_batches;

-- Step 1: 预览可匹配的记录（DRY RUN）
-- 匹配规则：
--   inv_batches.product_code = product_skus.product_code
--   inv_batches.quality_grade = product_skus.grade_code
--   inv_batches.packaging_spec = product_skus.spec_code（spec_code 同值，如 TRAY30）
--   OR inv_batches.packaging_spec 经过映射后匹配（如 30_PCS_TRAY → TRAY30）
SELECT
  b.batch_no,
  b.product_code,
  b.quality_grade,
  b.packaging_spec,
  b.status,
  sk.sku_code        AS target_sku_code,
  sk.grade_code      AS target_grade_code_std,
  sk.spec_code       AS target_spec_code
FROM inv_batches b
JOIN product_skus sk
  ON sk.product_code = b.product_code
  AND sk.grade_code  = b.quality_grade
  AND sk.spec_code   = COALESCE(b.packaging_spec, sk.spec_code)  -- spec_code 或已是标准格式
  AND sk.status      = 'ACTIVE'
WHERE b.sku_code IS NULL
ORDER BY b.batch_no
LIMIT 100;

-- Step 2: 预览包装规格需要映射的记录（旧格式 → 新格式）
CREATE TEMP TABLE IF NOT EXISTS inv_spec_mapping (
  old_spec  VARCHAR(64),
  new_code  VARCHAR(64)
);
INSERT INTO inv_spec_mapping (old_spec, new_code) VALUES
  ('LOOSE',         'LOOSE'),
  ('30_PCS_TRAY',   'TRAY30'),
  ('360_PCS_CASE',  'BOX360'),
  ('TRAY30',        'TRAY30'),
  ('TRAY36',        'TRAY36'),
  ('BOX360',        'BOX360'),
  ('BOX720',        'BOX720'),
  ('GIFT12',        'GIFT12'),
  ('GIFT24',        'GIFT24')
ON CONFLICT DO NOTHING;

-- 通过映射预览可回填的批次
SELECT
  b.batch_no,
  b.product_code,
  b.quality_grade,
  b.packaging_spec,
  m.new_code         AS mapped_spec_code,
  sk.sku_code        AS target_sku_code
FROM inv_batches b
JOIN inv_spec_mapping m ON m.old_spec = COALESCE(b.packaging_spec, '')
JOIN product_skus sk
  ON sk.product_code = b.product_code
  AND sk.grade_code  = b.quality_grade
  AND sk.spec_code   = m.new_code
  AND sk.status      = 'ACTIVE'
WHERE b.sku_code IS NULL
ORDER BY b.batch_no
LIMIT 100;

-- Step 3: 实际回填（确认 Step 2 结果无误后取消注释并执行）
/*
UPDATE inv_batches b
SET
  sku_code       = sk.sku_code,
  grade_code_std = sk.grade_code,
  spec_code      = m.new_code,
  updated_at     = NOW()
FROM inv_spec_mapping m
JOIN product_skus sk
  ON sk.product_code = b.product_code
  AND sk.grade_code  = b.quality_grade
  AND sk.spec_code   = m.new_code
  AND sk.status      = 'ACTIVE'
WHERE m.old_spec   = COALESCE(b.packaging_spec, '')
  AND b.sku_code  IS NULL;

-- 验证回填结果
SELECT
  COUNT(*)                                            AS total_batches,
  COUNT(CASE WHEN sku_code IS NOT NULL THEN 1 END)  AS with_sku_after,
  COUNT(CASE WHEN sku_code IS NULL THEN 1 END)      AS still_without_sku
FROM inv_batches;
*/

-- Step 4: 清理临时表
DROP TABLE IF EXISTS inv_spec_mapping;
