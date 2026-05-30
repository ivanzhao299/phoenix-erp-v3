-- ============================================================
-- Phoenix ERP V3 — Product Master Phase H4
-- 库存批次接入 SKU：inv_batches / inv_ledger 增加 SKU 关联字段
--
-- 核心原则：
--   1. 纯 ADD COLUMN（向后兼容，不删除旧字段）
--   2. 三列全部可空，旧批次不受影响
--   3. 新批次创建时若传入 sku_code，则由服务层校验后写入
--   4. FIFO 引擎支持 sku_code 优先路径（PATH A）+ 旧路径兼容（PATH B）
--
-- 生效日期：2026-05-30
-- ============================================================

-- ── 1. inv_batches 增加三个新列 ────────────────────────────────────────────────
ALTER TABLE inv_batches
  ADD COLUMN IF NOT EXISTS sku_code       VARCHAR(64),   -- 关联 product_skus.sku_code（可选）
  ADD COLUMN IF NOT EXISTS grade_code_std VARCHAR(32),   -- 标准等级编码（product_grades.grade_code）
  ADD COLUMN IF NOT EXISTS spec_code      VARCHAR(64);   -- 标准规格编码（packaging_specs.spec_code）

-- ── 2. inv_ledger 增加 sku_code（流水传递，便于追溯） ────────────────────────
ALTER TABLE inv_ledger
  ADD COLUMN IF NOT EXISTS sku_code VARCHAR(64);         -- 从批次传递的 SKU 编码

-- ── 3. 建立稀疏索引（只索引非 NULL 值） ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inv_batches_sku_code
  ON inv_batches (sku_code)
  WHERE sku_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_batches_grade_code_std
  ON inv_batches (grade_code_std)
  WHERE grade_code_std IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_batches_spec_code
  ON inv_batches (spec_code)
  WHERE spec_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_ledger_sku_code
  ON inv_ledger (sku_code)
  WHERE sku_code IS NOT NULL;

-- ── 4. 字段注释 ────────────────────────────────────────────────────────────────
COMMENT ON COLUMN inv_batches.sku_code       IS 'Phase H4: 关联 product_skus.sku_code，FIFO 优先按 SKU 路径分配';
COMMENT ON COLUMN inv_batches.grade_code_std IS 'Phase H4: 标准等级编码（product_grades.grade_code），与旧 quality_grade 并存';
COMMENT ON COLUMN inv_batches.spec_code      IS 'Phase H4: 标准规格编码（packaging_specs.spec_code），与旧 packaging_spec 并存';
COMMENT ON COLUMN inv_ledger.sku_code        IS 'Phase H4: 从批次传递，用于按 SKU 维度追溯库存流水';
