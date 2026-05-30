-- ============================================================
-- Phoenix ERP V3 — Phase H5 回填脚本
-- backfill-sales-items-sku.sql
--
-- 用途：将 sal_order_items 中旧明细尝试与 product_skus 匹配，
--       成功则自动写入 sku_code
--
-- ⚠️  注意：
--   1. 本脚本是可选操作，不执行不影响现有功能
--   2. 执行前请先备份 sal_order_items 表
--   3. 只更新能精确三元匹配的记录（product_code + grade_code + packaging_spec）
--   4. UPDATE 块默认注释保护，请先 SELECT 验证后再执行
--
-- 生效日期：2026-05-30
-- ============================================================

-- Step 0: 查看待回填的记录数量
SELECT
  COUNT(*)                                                  AS total_items,
  COUNT(CASE WHEN sku_code IS NULL THEN 1 END)             AS without_sku,
  COUNT(CASE WHEN sku_code IS NOT NULL THEN 1 END)         AS with_sku
FROM sal_order_items;

-- Step 1: 预览可匹配的记录（DRY RUN）
-- 匹配规则：product_code + grade_code + packaging_spec 精确匹配 product_skus
SELECT
  i.id,
  i.sales_order_id,
  i.product_code,
  i.grade_code,
  i.packaging_spec,
  sk.sku_code    AS target_sku_code
FROM sal_order_items i
JOIN product_skus sk
  ON sk.product_code = i.product_code
  AND sk.grade_code  = i.grade_code
  AND sk.spec_code   = COALESCE(i.packaging_spec, sk.spec_code)
  AND sk.status      = 'ACTIVE'
WHERE i.sku_code IS NULL
ORDER BY i.id
LIMIT 100;

-- Step 2: 统计可匹配的行数
SELECT COUNT(*) AS matchable_items
FROM sal_order_items i
JOIN product_skus sk
  ON sk.product_code = i.product_code
  AND sk.grade_code  = i.grade_code
  AND sk.spec_code   = COALESCE(i.packaging_spec, sk.spec_code)
  AND sk.status      = 'ACTIVE'
WHERE i.sku_code IS NULL;

-- Step 3: 实际回填（确认 Step 1 结果无误后取消注释并执行）
/*
UPDATE sal_order_items i
SET
  sku_code   = sk.sku_code,
  updated_at = NOW()  -- 如果字段存在
FROM product_skus sk
WHERE sk.product_code = i.product_code
  AND sk.grade_code   = i.grade_code
  AND sk.spec_code    = COALESCE(i.packaging_spec, sk.spec_code)
  AND sk.status       = 'ACTIVE'
  AND i.sku_code IS NULL;

-- 验证回填结果
SELECT
  COUNT(*)                                         AS total_items,
  COUNT(CASE WHEN sku_code IS NOT NULL THEN 1 END) AS with_sku_after,
  COUNT(CASE WHEN sku_code IS NULL THEN 1 END)     AS still_without_sku
FROM sal_order_items;
*/
