-- ═══════════════════════════════════════════════════════════════════════════
-- Sales V2 Phase 2 — Price Runtime
-- Date: 2026-05-27
--
-- 目标：
--   · sal_price_books 补充 priority / company_name / updated_at / remark 字段
--   · sal_price_items 补充 status 字段
--   · Legacy Freeze：ord_prices / prc_price_items 标记为 READ_ONLY
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. sal_price_books 补充字段 ─────────────────────────────────────────────

ALTER TABLE sal_price_books
  ADD COLUMN IF NOT EXISTS company_name  VARCHAR(256),
  ADD COLUMN IF NOT EXISTS priority      INTEGER      NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS remark        TEXT,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW();

COMMENT ON COLUMN sal_price_books.priority    IS '优先级：数字越小越优先（默认100）';
COMMENT ON COLUMN sal_price_books.company_name IS '公司名称（冗余，方便展示）';
COMMENT ON COLUMN sal_price_books.remark       IS '备注';
COMMENT ON COLUMN sal_price_books.updated_at   IS '最后更新时间';

-- ── 2. sal_price_items 补充字段 ─────────────────────────────────────────────

ALTER TABLE sal_price_items
  ADD COLUMN IF NOT EXISTS status  VARCHAR(32) NOT NULL DEFAULT 'ACTIVE';

COMMENT ON COLUMN sal_price_items.status IS 'ACTIVE / DISABLED';

-- ── 3. 索引补充 ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sal_price_books_customer   ON sal_price_books (customer_code) WHERE customer_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sal_price_books_channel    ON sal_price_books (channel_code)  WHERE channel_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sal_price_books_priority   ON sal_price_books (company_code, status, priority);
CREATE INDEX IF NOT EXISTS idx_sal_price_items_book_prod  ON sal_price_items (price_book_id, product_code);
CREATE INDEX IF NOT EXISTS idx_sal_price_items_grade      ON sal_price_items (grade_code, packaging_spec);

-- ── 4. Legacy Freeze 标记 ────────────────────────────────────────────────────

COMMENT ON TABLE ord_prices IS
  '[LEGACY][READ_ONLY] 已冻结 — 迁移至 sal_price_books / sal_price_items（Sales V2 Phase 2）';

COMMENT ON TABLE prc_price_items IS
  '[LEGACY][READ_ONLY][Sales用途已冻结] — Sales 定价已迁移至 sal_price_items（Sales V2 Phase 2）；采购定价仍由 Procurement V2 管理';

-- ── 5. 完成标记 ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  RAISE NOTICE '✅ Sales V2 Phase 2 Price Runtime migration complete.';
  RAISE NOTICE '   sal_price_books: +priority +company_name +updated_at +remark';
  RAISE NOTICE '   sal_price_items: +status';
  RAISE NOTICE '   Legacy frozen (READ_ONLY): ord_prices, prc_price_items (Sales usage)';
END $$;
