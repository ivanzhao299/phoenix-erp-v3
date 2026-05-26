-- ============================================================
-- Finance V2 Phase 1 — AP Runtime 升格
-- Created:  2026-05-26
-- Purpose:  重建 fin_ap_invoices 为正式 AP Runtime 基线
--           添加 source_type/source_id、payment_status、
--           paid_amount_base / balance_amount_base 等字段
--
-- 前提：无生产数据，直接 DROP + 重建
-- ============================================================

-- 先 DROP 依赖表（按依赖顺序）
DROP TABLE IF EXISTS fin_ap_payment_allocations CASCADE;
DROP TABLE IF EXISTS fin_ap_invoices            CASCADE;

-- ── fin_ap_invoices — AP Runtime 正式表 ───────────────────────────────────

CREATE TABLE fin_ap_invoices (
  id                      BIGSERIAL       PRIMARY KEY,
  ap_no                   VARCHAR(60)     NOT NULL UNIQUE,

  -- 来源追踪
  source_type             VARCHAR(30)     NOT NULL DEFAULT 'MANUAL',
  -- PO / MANUAL / EXPENSE / REIMBURSEMENT / OPENING
  source_id               BIGINT          NULL,   -- PO 时填 po_id
  source_no               VARCHAR(80)     NULL,   -- PO 时填 po_no

  -- 公司维度
  company_code            VARCHAR(64)     NOT NULL,
  company_name            VARCHAR(256)    NULL,

  -- 项目维度
  project_code            VARCHAR(64)     NULL,
  project_name            VARCHAR(256)    NULL,

  -- 供应商
  supplier_id             BIGINT          NULL,
  supplier_code           VARCHAR(64)     NULL,
  supplier_name           VARCHAR(256)    NOT NULL,

  -- 发票信息
  invoice_no              VARCHAR(100)    NULL,
  invoice_date            DATE            NULL,
  due_date                DATE            NULL,

  -- 金额三段式（原币）
  currency_code           VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  amount_original         NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  exchange_rate           NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  amount_base             NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  base_currency           VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  -- 付款进度（原币）
  paid_amount_original    NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  paid_amount_base        NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  balance_amount_original NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  balance_amount_base     NUMERIC(18, 2)  NOT NULL DEFAULT 0,

  -- 状态
  -- OPEN / PARTIALLY_PAID / PAID / DISPUTED / CANCELLED
  status                  VARCHAR(32)     NOT NULL DEFAULT 'OPEN',

  -- 付款状态（冗余，便于快速筛选）
  -- UNPAID / PARTIAL / PAID
  payment_status          VARCHAR(20)     NOT NULL DEFAULT 'UNPAID',

  -- 税费
  tax_amount              NUMERIC(18, 2)  NULL,
  tax_rate                NUMERIC(8, 4)   NULL,

  -- 关联
  wf_instance_id          BIGINT          NULL,

  remark                  TEXT            NULL,
  created_by              VARCHAR(80)     NULL,
  updated_by              VARCHAR(80)     NULL,
  created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_ap_invoices_status
    CHECK (status IN ('OPEN','PARTIALLY_PAID','PAID','DISPUTED','CANCELLED')),
  CONSTRAINT chk_fin_ap_invoices_payment_status
    CHECK (payment_status IN ('UNPAID','PARTIAL','PAID')),
  CONSTRAINT chk_fin_ap_invoices_source_type
    CHECK (source_type IN ('PO','MANUAL','EXPENSE','REIMBURSEMENT','OPENING')),
  CONSTRAINT chk_fin_ap_invoices_balance_nonneg
    CHECK (balance_amount_original >= 0)
);

CREATE INDEX idx_fin_ap_inv_company        ON fin_ap_invoices (company_code);
CREATE INDEX idx_fin_ap_inv_supplier       ON fin_ap_invoices (supplier_code);
CREATE INDEX idx_fin_ap_inv_status         ON fin_ap_invoices (status);
CREATE INDEX idx_fin_ap_inv_payment_status ON fin_ap_invoices (payment_status);
CREATE INDEX idx_fin_ap_inv_due            ON fin_ap_invoices (due_date)
  WHERE status NOT IN ('PAID','CANCELLED');
CREATE INDEX idx_fin_ap_inv_source         ON fin_ap_invoices (source_type, source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX idx_fin_ap_inv_wf             ON fin_ap_invoices (wf_instance_id)
  WHERE wf_instance_id IS NOT NULL;

COMMENT ON TABLE fin_ap_invoices IS 'Finance V2 Phase 1 — AP Runtime 正式应付发票台账';
COMMENT ON COLUMN fin_ap_invoices.source_type IS 'PO/MANUAL/EXPENSE/REIMBURSEMENT/OPENING';
COMMENT ON COLUMN fin_ap_invoices.payment_status IS 'UNPAID/PARTIAL/PAID（冗余，便于快速筛选）';

-- ── fin_ap_payment_allocations — 付款核销（重建）──────────────────────────

CREATE TABLE fin_ap_payment_allocations (
  id                  BIGSERIAL       PRIMARY KEY,
  alloc_no            VARCHAR(60)     NOT NULL UNIQUE,
  invoice_id          BIGINT          NOT NULL REFERENCES fin_ap_invoices(id),

  company_code        VARCHAR(64)     NOT NULL,
  company_name        VARCHAR(256)    NULL,

  currency_code       VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  amount_original     NUMERIC(18, 2)  NOT NULL,
  exchange_rate       NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  amount_base         NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  base_currency       VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  payment_date        DATE            NOT NULL,
  payment_method      VARCHAR(40)     NULL,
  bank_account        VARCHAR(100)    NULL,
  reference_no        VARCHAR(100)    NULL,

  cash_account_id     BIGINT          NULL,
  wf_instance_id      BIGINT          NULL,

  remark              TEXT            NULL,
  created_by          VARCHAR(80)     NULL,
  updated_by          VARCHAR(80)     NULL,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_ap_alloc_invoice  ON fin_ap_payment_allocations (invoice_id);
CREATE INDEX idx_fin_ap_alloc_date     ON fin_ap_payment_allocations (payment_date DESC);
CREATE INDEX idx_fin_ap_alloc_company  ON fin_ap_payment_allocations (company_code);

COMMENT ON TABLE fin_ap_payment_allocations IS 'Finance V2 — AP 付款核销记录';

DO $$
BEGIN
  RAISE NOTICE '✅ Finance V2 Phase 1 AP Runtime — 表创建完成';
  RAISE NOTICE '   fin_ap_invoices             (正式 AP Runtime)';
  RAISE NOTICE '   fin_ap_payment_allocations  (付款核销)';
END $$;
