-- ════════════════════════════════════════════════════════════════════════
-- G85-C 采购明细 SKU 化补全 — prc2_order_items 增加 product_code / grade_code
-- ────────────────────────────────────────────────────────────────────────
-- 背景：明细仅存 item_code(=sku_code)/item_name/spec 文本，缺产品/等级维度，
--      成本无法按产品或等级归集。前端 SkuSelector onPick 已同步带出两字段。
-- 幂等：ADD COLUMN IF NOT EXISTS。
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE prc2_order_items ADD COLUMN IF NOT EXISTS product_code VARCHAR(64);
ALTER TABLE prc2_order_items ADD COLUMN IF NOT EXISTS grade_code   VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_prc2_order_items_product ON prc2_order_items (product_code) WHERE product_code IS NOT NULL;
