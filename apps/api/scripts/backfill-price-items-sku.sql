-- ============================================================
-- Phoenix ERP V3 — Phase H3 回填脚本
-- backfill-price-items-sku.sql
--
-- 用途：将 sal_price_items 中 packaging_spec 为旧格式的记录
--       与 product_skus 做匹配，尝试自动填充 sku_code / grade_code_std / spec_code
--
-- ⚠️  注意：
--   1. 本脚本是可选操作，不执行不影响现有功能
--   2. 执行前请先备份 sal_price_items 表
--   3. 只更新能精确匹配的记录（product_code + grade_code + spec_code 三元组），不改动无法匹配的记录
--   4. 使用 packaging_spec → spec_code 映射处理旧格式（30_PCS_TRAY → TRAY30 等）
--   5. 建议先在 SELECT 模式验证后再执行 UPDATE
--
-- 生效日期：2026-05-30
-- ============================================================

-- Step 0: 查看待回填的记录数量（只运行这个来验证）
SELECT COUNT(*) AS total_items,
       COUNT(CASE WHEN sku_code IS NULL THEN 1 END)      AS without_sku,
       COUNT(CASE WHEN sku_code IS NOT NULL THEN 1 END)  AS with_sku
FROM sal_price_items
WHERE status != 'DELETED';

-- Step 1: 建立旧格式包装规格到新 spec_code 的映射（临时表）
-- 如需扩充映射，在此添加行
CREATE TEMP TABLE IF NOT EXISTS packaging_spec_mapping (
  old_spec  VARCHAR(64),
  new_code  VARCHAR(64)
);

INSERT INTO packaging_spec_mapping (old_spec, new_code)
VALUES
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

-- Step 2: 预览将要回填的记录（DRY RUN — 不做更新）
SELECT
  pi.id,
  pi.product_code,
  pi.grade_code,
  pi.packaging_spec,
  sk.sku_code        AS target_sku_code,
  sk.grade_code      AS target_grade_code_std,
  pm.new_code        AS target_spec_code
FROM sal_price_items pi
JOIN packaging_spec_mapping pm ON pm.old_spec = pi.packaging_spec
JOIN product_skus sk
  ON sk.product_code = pi.product_code
  AND sk.grade_code  = pi.grade_code
  AND sk.spec_code   = pm.new_code
  AND sk.status      = 'ACTIVE'
WHERE pi.sku_code IS NULL
  AND pi.status != 'DELETED'
ORDER BY pi.id
LIMIT 100;

-- Step 3: 实际回填（确认 Step 2 结果无误后取消注释并执行）
/*
UPDATE sal_price_items pi
SET
  sku_code       = sk.sku_code,
  grade_code_std = sk.grade_code,
  spec_code      = pm.new_code
FROM packaging_spec_mapping pm
JOIN product_skus sk
  ON sk.product_code = pi.product_code
  AND sk.grade_code  = pi.grade_code
  AND sk.spec_code   = pm.new_code
  AND sk.status      = 'ACTIVE'
WHERE pm.old_spec  = pi.packaging_spec
  AND pi.sku_code  IS NULL
  AND pi.status    != 'DELETED';

-- 验证回填结果
SELECT
  COUNT(*)                                            AS total_active,
  COUNT(CASE WHEN sku_code IS NOT NULL THEN 1 END)  AS with_sku_after,
  COUNT(CASE WHEN sku_code IS NULL     THEN 1 END)  AS still_without_sku
FROM sal_price_items
WHERE status != 'DELETED';
*/

-- Step 4: 清理临时表
DROP TABLE IF EXISTS packaging_spec_mapping;
