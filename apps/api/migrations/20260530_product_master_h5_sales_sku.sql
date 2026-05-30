-- ============================================================
-- Phoenix ERP V3 — Product Master Phase H5
-- 销售 / 门店 / 退货统一接入 SKU
--
-- 核心原则：
--   1. 纯 ADD COLUMN（向后兼容，不删除旧字段）
--   2. sku_code 全部可空，旧订单不受影响
--   3. 新订单/门店销售/退货传入 sku_code 时写入
--   4. FIFO PATH A（sku_code）优先，PATH B（旧字段）兼容
--   5. 退货单从原销售明细继承 sku_code
--
-- 生效日期：2026-05-30
-- ============================================================

-- ── 1. sal_order_items 增加 sku_code ───────────────────────────────────────────
ALTER TABLE sal_order_items
  ADD COLUMN IF NOT EXISTS sku_code VARCHAR(64);   -- 关联 product_skus.sku_code（可选）

COMMENT ON COLUMN sal_order_items.sku_code
  IS 'Phase H5: 关联 product_skus.sku_code，FIFO PATH A 优先按 SKU 路径分配';

-- ── 2. sal_store_sale_items 增加 sku_code ──────────────────────────────────────
ALTER TABLE sal_store_sale_items
  ADD COLUMN IF NOT EXISTS sku_code VARCHAR(64);   -- 门店 POS 明细关联 SKU

COMMENT ON COLUMN sal_store_sale_items.sku_code
  IS 'Phase H5: 关联 product_skus.sku_code，门店收银 FIFO PATH A 使用';

-- ── 3. sal_return_items 增加 sku_code ─────────────────────────────────────────
ALTER TABLE sal_return_items
  ADD COLUMN IF NOT EXISTS sku_code VARCHAR(64);   -- 退货明细关联 SKU（从原销售明细继承）

COMMENT ON COLUMN sal_return_items.sku_code
  IS 'Phase H5: 关联 product_skus.sku_code，从原销售明细 sal_order_items 继承，回库时传入 FIFO';

-- ── 4. 稀疏索引（只索引非 NULL 值） ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sal_order_items_sku_code
  ON sal_order_items (sku_code)
  WHERE sku_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sal_store_sale_items_sku_code
  ON sal_store_sale_items (sku_code)
  WHERE sku_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sal_return_items_sku_code
  ON sal_return_items (sku_code)
  WHERE sku_code IS NOT NULL;
