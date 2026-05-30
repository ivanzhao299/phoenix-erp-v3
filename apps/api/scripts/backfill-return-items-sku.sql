-- ============================================================
-- Phoenix ERP V3 — Phase H5 回填脚本
-- backfill-return-items-sku.sql
--
-- 用途：将 sal_return_items 中旧退货明细尝试从原销售明细继承 sku_code，
--       若原明细已有 sku_code 则直接继承；否则尝试从 product_skus 匹配
--
-- ⚠️  注意：
--   1. 本脚本是可选操作，不执行不影响现有功能
--   2. 执行前请先备份 sal_return_items 表
--   3. 优先从 sal_order_items.sku_code 继承，次选 product_skus 精确匹配
--   4. UPDATE 块默认注释保护，请先 SELECT 验证后再执行
--
-- 生效日期：2026-05-30
-- ============================================================

-- Step 0: 查看待回填的记录数量
SELECT
  COUNT(*)                                                  AS total_items,
  COUNT(CASE WHEN sku_code IS NULL THEN 1 END)             AS without_sku,
  COUNT(CASE WHEN sku_code IS NOT NULL THEN 1 END)         AS with_sku
FROM sal_return_items;

-- Step 1a: 预览可从原销售明细继承的记录
SELECT
  ri.id,
  ri.return_order_id,
  ri.sales_order_item_id,
  ri.product_code,
  oi.sku_code   AS inherited_sku_code
FROM sal_return_items ri
JOIN sal_order_items oi ON oi.id = ri.sales_order_item_id
WHERE ri.sku_code IS NULL
  AND ri.sales_order_item_id IS NOT NULL
  AND oi.sku_code IS NOT NULL
ORDER BY ri.id
LIMIT 100;

-- Step 1b: 预览可从 product_skus 直接匹配的记录（无原销售明细关联）
SELECT
  ri.id,
  ri.return_order_id,
  ri.product_code,
  ri.grade_code,
  sk.sku_code   AS matched_sku_code
FROM sal_return_items ri
JOIN product_skus sk
  ON sk.product_code = ri.product_code
  AND sk.grade_code  = ri.grade_code
  AND sk.status      = 'ACTIVE'
WHERE ri.sku_code IS NULL
  AND (ri.sales_order_item_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM sal_order_items oi
    WHERE oi.id = ri.sales_order_item_id AND oi.sku_code IS NOT NULL
  ))
ORDER BY ri.id
LIMIT 100;

-- Step 2: 统计
SELECT
  COUNT(CASE WHEN ri.sales_order_item_id IS NOT NULL AND oi.sku_code IS NOT NULL THEN 1 END) AS can_inherit_from_order,
  COUNT(CASE WHEN sk.sku_code IS NOT NULL THEN 1 END) AS can_match_from_master
FROM sal_return_items ri
LEFT JOIN sal_order_items oi ON oi.id = ri.sales_order_item_id
LEFT JOIN product_skus sk
  ON sk.product_code = ri.product_code
  AND sk.grade_code  = ri.grade_code
  AND sk.status      = 'ACTIVE'
WHERE ri.sku_code IS NULL;

-- Step 3: 实际回填（确认 Step 1 结果无误后取消注释并执行）
/*
-- 3a: 优先从原销售明细继承
UPDATE sal_return_items ri
SET sku_code = oi.sku_code
FROM sal_order_items oi
WHERE oi.id = ri.sales_order_item_id
  AND ri.sku_code IS NULL
  AND oi.sku_code IS NOT NULL;

-- 3b: 再对没有原明细关联的行尝试 product_skus 精确匹配
UPDATE sal_return_items ri
SET sku_code = sk.sku_code
FROM product_skus sk
WHERE sk.product_code = ri.product_code
  AND sk.grade_code   = ri.grade_code
  AND sk.status       = 'ACTIVE'
  AND ri.sku_code IS NULL;

-- 验证
SELECT
  COUNT(*)                                         AS total_items,
  COUNT(CASE WHEN sku_code IS NOT NULL THEN 1 END) AS with_sku_after,
  COUNT(CASE WHEN sku_code IS NULL THEN 1 END)     AS still_without_sku
FROM sal_return_items;
*/
