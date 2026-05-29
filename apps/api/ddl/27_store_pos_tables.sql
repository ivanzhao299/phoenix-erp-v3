-- ═══════════════════════════════════════════════════════════════
-- Phoenix ERP V3 — DDL 27: Store POS Runtime 建表
-- Sales V2 Phase 9: 直营店收银作业台
-- 幂等：所有 CREATE TABLE / INDEX 均使用 IF NOT EXISTS
-- 覆盖表（3 张）：
--   sal_store_sales        — 门店销售流水主表
--   sal_store_sale_items   — 销售明细行
--   sal_store_shift_closings — 门店日结/交班记录
-- ═══════════════════════════════════════════════════════════════

-- ── 序列 ────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS seq_store_sale_no   START 1;
CREATE SEQUENCE IF NOT EXISTS seq_store_closing_no START 1;

-- ── 1. 门店销售流水 sal_store_sales ──────────────────────────────
CREATE TABLE IF NOT EXISTS sal_store_sales (
  id                 BIGSERIAL     PRIMARY KEY,
  sale_no            VARCHAR(64)   NOT NULL UNIQUE,

  -- 门店信息
  store_code         VARCHAR(64)   NOT NULL,
  store_name         VARCHAR(256)  NOT NULL,
  company_code       VARCHAR(64)   NOT NULL,
  company_name       VARCHAR(256),

  -- 客户信息（散客可为空）
  customer_code      VARCHAR(64),
  customer_name      VARCHAR(256),
  customer_id        BIGINT,

  -- 销售类型
  sale_type          VARCHAR(16)   NOT NULL DEFAULT 'CASH',
  -- CASH=现金/转账现结  CREDIT=赊销  MIXED=部分收款

  -- 收款方式（预留扩展，不接第三方）
  payment_method     VARCHAR(32),
  -- CASH / TRANSFER / OTHER

  -- 金额
  subtotal           NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount       NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid_amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
  receivable_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- receivable_amount = total_amount - paid_amount（未收款，用于 AR）

  -- 收款状态
  payment_status     VARCHAR(16)   NOT NULL DEFAULT 'UNPAID',
  -- UNPAID / PARTIAL / PAID

  -- 关联
  cash_account_id    BIGINT,
  cash_account_code  VARCHAR(64),
  ar_invoice_id      BIGINT,
  shift_closing_id   BIGINT,

  -- 状态
  status             VARCHAR(16)   NOT NULL DEFAULT 'OPEN',
  -- OPEN / COMPLETED / VOID

  -- 作废原因（void 时填写）
  void_reason        TEXT,

  -- 操作员
  created_by         BIGINT,
  created_by_name    VARCHAR(128),
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_sale_store     ON sal_store_sales (store_code);
CREATE INDEX IF NOT EXISTS idx_store_sale_company   ON sal_store_sales (company_code);
CREATE INDEX IF NOT EXISTS idx_store_sale_status    ON sal_store_sales (status);
CREATE INDEX IF NOT EXISTS idx_store_sale_created   ON sal_store_sales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_sale_customer  ON sal_store_sales (customer_code) WHERE customer_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_store_sale_payment   ON sal_store_sales (payment_status);

-- ── 2. 销售明细行 sal_store_sale_items ───────────────────────────
CREATE TABLE IF NOT EXISTS sal_store_sale_items (
  id               BIGSERIAL     PRIMARY KEY,
  sale_id          BIGINT        NOT NULL,

  -- 商品
  product_code     VARCHAR(64)   NOT NULL,
  product_name     VARCHAR(256)  NOT NULL,
  grade_code       VARCHAR(64),
  packaging_spec   VARCHAR(128),

  -- 数量与价格
  qty              NUMERIC(12,3) NOT NULL,
  unit_price       NUMERIC(18,4) NOT NULL,
  amount           NUMERIC(18,2) NOT NULL,

  -- FIFO 批次（完成时填写）
  batch_no         VARCHAR(128),

  sort_order       INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_store_sale_item_sale ON sal_store_sale_items (sale_id);

-- ── 3. 门店日结/交班 sal_store_shift_closings ─────────────────────
CREATE TABLE IF NOT EXISTS sal_store_shift_closings (
  id               BIGSERIAL     PRIMARY KEY,
  closing_no       VARCHAR(64)   NOT NULL UNIQUE,
  store_code       VARCHAR(64)   NOT NULL,
  company_code     VARCHAR(64)   NOT NULL,

  -- 开/关班时间
  opened_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  closed_at        TIMESTAMPTZ,

  -- 现金盘点
  opening_cash     NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_cash     NUMERIC(18,2),
  system_cash      NUMERIC(18,2), -- 系统计算应有现金

  difference_amount NUMERIC(18,2), -- closing_cash - system_cash（差异）

  -- 本班统计（完班时填写）
  total_sales       NUMERIC(18,2) NOT NULL DEFAULT 0,
  cash_sales        NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit_sales      NUMERIC(18,2) NOT NULL DEFAULT 0,
  sale_count        INT          NOT NULL DEFAULT 0,

  -- 状态
  status           VARCHAR(16)   NOT NULL DEFAULT 'OPEN',
  -- OPEN / CLOSED

  -- 操作员
  operator_id      BIGINT,
  operator_name    VARCHAR(128),
  remark           TEXT
);

CREATE INDEX IF NOT EXISTS idx_store_closing_store   ON sal_store_shift_closings (store_code);
CREATE INDEX IF NOT EXISTS idx_store_closing_status  ON sal_store_shift_closings (status);
CREATE INDEX IF NOT EXISTS idx_store_closing_opened  ON sal_store_shift_closings (opened_at DESC);

-- ── 确认 ──────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ DDL 27 Store POS Runtime tables applied (3 tables, idempotent)';
END$$;
