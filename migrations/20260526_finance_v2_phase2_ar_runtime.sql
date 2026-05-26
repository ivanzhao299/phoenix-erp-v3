-- ============================================================
-- Finance V2 Phase 2 — AR Runtime 正式建立
-- Created:  2026-05-26
-- Purpose:  建立 fin_ar_invoices / fin_ar_receipts /
--           fin_ar_receipt_allocations 三张核心表
--
-- 前提：系统尚未生产运行，无真实历史数据负担
--       可直接 DROP + 重建
-- ============================================================

-- 按依赖顺序先 DROP
DROP TABLE IF EXISTS fin_ar_receipt_allocations CASCADE;
DROP TABLE IF EXISTS fin_ar_receipts            CASCADE;
DROP TABLE IF EXISTS fin_ar_invoices            CASCADE;

-- ── fin_ar_invoices — AR 应收发票台账 ──────────────────────────────────────

CREATE TABLE fin_ar_invoices (
  id                        BIGSERIAL       PRIMARY KEY,
  ar_no                     VARCHAR(60)     NOT NULL UNIQUE,

  -- 来源追踪
  -- SALES_ORDER / MANUAL / CONTRACT / OPENING
  source_type               VARCHAR(30)     NOT NULL DEFAULT 'MANUAL',
  source_id                 BIGINT          NULL,
  source_no                 VARCHAR(80)     NULL,

  -- 公司维度
  company_code              VARCHAR(64)     NOT NULL,
  company_name              VARCHAR(256)    NULL,

  -- 项目维度
  project_code              VARCHAR(64)     NULL,
  project_name              VARCHAR(256)    NULL,

  -- 客户
  customer_id               BIGINT          NULL,
  customer_code             VARCHAR(64)     NULL,
  customer_name             VARCHAR(256)    NOT NULL,

  -- 发票信息
  invoice_no                VARCHAR(100)    NULL,
  invoice_date              DATE            NULL,
  due_date                  DATE            NULL,

  -- 金额三段式（原币）
  currency_code             VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  amount_original           NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  exchange_rate             NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  amount_base               NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  base_currency             VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  -- 收款进度
  received_amount_original  NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  received_amount_base      NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  balance_amount_original   NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  balance_amount_base       NUMERIC(18, 2)  NOT NULL DEFAULT 0,

  -- 状态机
  -- OPEN / PARTIALLY_RECEIVED / RECEIVED / OVERDUE / DISPUTED / WRITTEN_OFF / CANCELLED
  status                    VARCHAR(32)     NOT NULL DEFAULT 'OPEN',

  -- 收款状态（冗余，便于快速筛选）
  -- UNRECEIVED / PARTIAL / RECEIVED
  collection_status         VARCHAR(20)     NOT NULL DEFAULT 'UNRECEIVED',

  -- 关联
  wf_instance_id            BIGINT          NULL,

  remark                    TEXT            NULL,
  created_by                VARCHAR(80)     NULL,
  updated_by                VARCHAR(80)     NULL,
  created_at                TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_ar_inv_status
    CHECK (status IN ('OPEN','PARTIALLY_RECEIVED','RECEIVED',
                      'OVERDUE','DISPUTED','WRITTEN_OFF','CANCELLED')),
  CONSTRAINT chk_fin_ar_inv_col_status
    CHECK (collection_status IN ('UNRECEIVED','PARTIAL','RECEIVED')),
  CONSTRAINT chk_fin_ar_inv_source_type
    CHECK (source_type IN ('SALES_ORDER','MANUAL','CONTRACT','OPENING')),
  CONSTRAINT chk_fin_ar_inv_balance_nonneg
    CHECK (balance_amount_original >= 0)
);

CREATE INDEX idx_fin_ar_inv_company         ON fin_ar_invoices (company_code);
CREATE INDEX idx_fin_ar_inv_customer        ON fin_ar_invoices (customer_code);
CREATE INDEX idx_fin_ar_inv_status          ON fin_ar_invoices (status);
CREATE INDEX idx_fin_ar_inv_col_status      ON fin_ar_invoices (collection_status);
CREATE INDEX idx_fin_ar_inv_due             ON fin_ar_invoices (due_date)
  WHERE status NOT IN ('RECEIVED','CANCELLED','WRITTEN_OFF');
CREATE INDEX idx_fin_ar_inv_source          ON fin_ar_invoices (source_type, source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX idx_fin_ar_inv_wf              ON fin_ar_invoices (wf_instance_id)
  WHERE wf_instance_id IS NOT NULL;

COMMENT ON TABLE  fin_ar_invoices                          IS 'Finance V2 Phase 2 — AR Runtime 应收发票台账';
COMMENT ON COLUMN fin_ar_invoices.source_type              IS 'SALES_ORDER/MANUAL/CONTRACT/OPENING';
COMMENT ON COLUMN fin_ar_invoices.collection_status        IS 'UNRECEIVED/PARTIAL/RECEIVED（冗余，便于快速筛选）';

-- ── fin_ar_receipts — 收款记录 ──────────────────────────────────────────────

CREATE TABLE fin_ar_receipts (
  id                        BIGSERIAL       PRIMARY KEY,
  receipt_no                VARCHAR(60)     NOT NULL UNIQUE,

  -- 公司维度
  company_code              VARCHAR(64)     NOT NULL,
  company_name              VARCHAR(256)    NULL,

  -- 项目维度
  project_code              VARCHAR(64)     NULL,
  project_name              VARCHAR(256)    NULL,

  -- 客户
  customer_id               BIGINT          NULL,
  customer_code             VARCHAR(64)     NULL,
  customer_name             VARCHAR(256)    NOT NULL,

  -- 收款信息
  receipt_date              DATE            NOT NULL,
  currency_code             VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  amount_original           NUMERIC(18, 2)  NOT NULL,
  exchange_rate             NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  amount_base               NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  base_currency             VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  -- 收款渠道
  receipt_method            VARCHAR(40)     NULL,  -- 银行转账 / 支票 / 现金 / 线上
  received_account_code     VARCHAR(100)    NULL,  -- 收款账户
  bank_ref                  VARCHAR(100)    NULL,  -- 银行流水号

  -- 状态：DRAFT / CONFIRMED / CANCELLED
  status                    VARCHAR(20)     NOT NULL DEFAULT 'DRAFT',

  wf_instance_id            BIGINT          NULL,

  remark                    TEXT            NULL,
  created_by                VARCHAR(80)     NULL,
  updated_by                VARCHAR(80)     NULL,
  created_at                TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_ar_receipts_status
    CHECK (status IN ('DRAFT','CONFIRMED','CANCELLED')),
  CONSTRAINT chk_fin_ar_receipts_amount_pos
    CHECK (amount_original > 0)
);

CREATE INDEX idx_fin_ar_rec_company         ON fin_ar_receipts (company_code);
CREATE INDEX idx_fin_ar_rec_customer        ON fin_ar_receipts (customer_code);
CREATE INDEX idx_fin_ar_rec_status          ON fin_ar_receipts (status);
CREATE INDEX idx_fin_ar_rec_date            ON fin_ar_receipts (receipt_date DESC);

COMMENT ON TABLE fin_ar_receipts IS 'Finance V2 Phase 2 — AR 收款记录';

-- ── fin_ar_receipt_allocations — 收款核销分摊 ────────────────────────────────
--
-- 一笔收款可分摊到多个 AR，一个 AR 可被多次部分收款。
-- 不允许超额核销（由 Service 层校验 + balance_nonneg 兜底）。

CREATE TABLE fin_ar_receipt_allocations (
  id                        BIGSERIAL       PRIMARY KEY,

  -- 收款单
  receipt_id                BIGINT          NOT NULL REFERENCES fin_ar_receipts(id),
  receipt_no                VARCHAR(60)     NOT NULL,

  -- AR 发票
  ar_invoice_id             BIGINT          NOT NULL REFERENCES fin_ar_invoices(id),
  ar_no                     VARCHAR(60)     NOT NULL,

  -- 分摊金额
  allocated_amount_original NUMERIC(18, 2)  NOT NULL,
  allocated_amount_base     NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  currency_code             VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  created_at                TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_ar_alloc_amount_pos
    CHECK (allocated_amount_original > 0)
);

CREATE INDEX idx_fin_ar_alloc_receipt    ON fin_ar_receipt_allocations (receipt_id);
CREATE INDEX idx_fin_ar_alloc_invoice    ON fin_ar_receipt_allocations (ar_invoice_id);

COMMENT ON TABLE fin_ar_receipt_allocations IS 'Finance V2 Phase 2 — AR 收款核销分摊';

DO $$
BEGIN
  RAISE NOTICE '✅ Finance V2 Phase 2 AR Runtime — 表创建完成';
  RAISE NOTICE '   fin_ar_invoices              (应收发票台账)';
  RAISE NOTICE '   fin_ar_receipts              (收款记录)';
  RAISE NOTICE '   fin_ar_receipt_allocations   (收款核销分摊)';
END $$;
