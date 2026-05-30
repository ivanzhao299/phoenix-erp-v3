-- ============================================================
-- Phoenix ERP V3 — Product Master Phase H3
-- 价格体系接入 SKU：sal_price_items 增加三个可选 SKU 关联字段
--
-- 约束：
--   1. 纯 ADD COLUMN（向后兼容，不删除旧字段）
--   2. 三列全部可空，旧数据不受影响
--   3. 新价格项填写 sku_code 后，解析引擎优先按 SKU 精确匹配
--
-- 生效日期：2026-05-30
-- ============================================================

-- 1. 增加三个新列
ALTER TABLE sal_price_items
  ADD COLUMN IF NOT EXISTS sku_code       VARCHAR(64),   -- 关联 product_skus.sku_code（可选）
  ADD COLUMN IF NOT EXISTS grade_code_std VARCHAR(32),   -- 标准等级编码（product_grades.grade_code）
  ADD COLUMN IF NOT EXISTS spec_code      VARCHAR(64);   -- 标准规格编码（packaging_specs.spec_code）

-- 2. 建立稀疏索引（只索引非 NULL 值，节省空间）
CREATE INDEX IF NOT EXISTS idx_sal_price_items_sku_code
  ON sal_price_items (sku_code)
  WHERE sku_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sal_price_items_grade_code_std
  ON sal_price_items (grade_code_std)
  WHERE grade_code_std IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sal_price_items_spec_code
  ON sal_price_items (spec_code)
  WHERE spec_code IS NOT NULL;

-- 3. 字段注释
COMMENT ON COLUMN sal_price_items.sku_code       IS 'Phase H3: 关联 product_skus.sku_code，填写时价格解析优先按 SKU 精确匹配';
COMMENT ON COLUMN sal_price_items.grade_code_std IS 'Phase H3: 标准等级编码（product_grades.grade_code），与旧 grade_code 字段并存';
COMMENT ON COLUMN sal_price_items.spec_code      IS 'Phase H3: 标准规格编码（packaging_specs.spec_code），与旧 packaging_spec 字段并存';
