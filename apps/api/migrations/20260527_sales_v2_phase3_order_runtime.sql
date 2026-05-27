-- =============================================================================
-- Sales V2 Phase 3 — Sales Order Runtime
-- 2026-05-27
-- =============================================================================
-- 目标：补强 sal_sales_orders / sal_order_items，使其成为正式 Sales Order Runtime
-- 接入 Price Runtime / Customer Credit / Workflow / Finance V2 AR
-- =============================================================================

-- ── 1. sal_sales_orders 补全缺失字段 ─────────────────────────────────────────

ALTER TABLE sal_sales_orders
  ADD COLUMN IF NOT EXISTS channel_type          VARCHAR(32),
  ADD COLUMN IF NOT EXISTS price_book_id         BIGINT,
  ADD COLUMN IF NOT EXISTS price_book_no         VARCHAR(64),
  ADD COLUMN IF NOT EXISTS over_credit           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS below_floor_price     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS delivered_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at           TIMESTAMPTZ;

-- ── 2. sal_order_items 补全缺失字段 ──────────────────────────────────────────

ALTER TABLE sal_order_items
  ADD COLUMN IF NOT EXISTS product_name          VARCHAR(256),
  ADD COLUMN IF NOT EXISTS resolved_unit_price   NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_unit_price     NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS floor_price           NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS ceiling_price         NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS price_book_id         BIGINT,
  ADD COLUMN IF NOT EXISTS price_book_no         VARCHAR(64),
  ADD COLUMN IF NOT EXISTS below_floor_price     BOOLEAN NOT NULL DEFAULT FALSE;

-- 将现有 unit_price 数据回填到 actual_unit_price / resolved_unit_price
UPDATE sal_order_items
   SET actual_unit_price   = unit_price,
       resolved_unit_price = unit_price
 WHERE actual_unit_price = 0 AND unit_price > 0;

-- ── 3. 索引 ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sal_sales_orders_customer_code ON sal_sales_orders(customer_code);
CREATE INDEX IF NOT EXISTS idx_sal_sales_orders_status        ON sal_sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_sal_sales_orders_company_status ON sal_sales_orders(company_code, status);
CREATE INDEX IF NOT EXISTS idx_sal_sales_orders_created_at    ON sal_sales_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sal_order_items_order_id       ON sal_order_items(sales_order_id);

-- ── 4. 旧 ord_orders 冻结注释 (如未已冻结) ───────────────────────────────────

COMMENT ON TABLE ord_orders IS
  '[LEGACY][READ_ONLY][Sales V2 Phase 3: 已被 sal_sales_orders 取代][冻结于 2026-05-27]'
;

-- ── 5. fin_ar_invoices source_type 白名单确认 ─────────────────────────────────
-- fin_ar_invoices.source_type = 'SALES_ORDER' 已在 Finance V2 Phase 2 的 AR DTO 中合法
-- 此处仅注释确认，无需 DDL

-- COMMENT: fin_ar_invoices.source_type 支持 'SALES_ORDER' (Sales V2 Phase 3 联动)
