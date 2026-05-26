-- ============================================================
-- Finance V2 Phase 0 — Domain Table Baseline
-- Created:  2026-05-26
-- Purpose:  建立 Finance V2 原生 Runtime 的领域表骨架（当前为空表，
--           Phase 0 数据仍来自 prc2_ap_ledger 适配层）
-- Author:   Phoenix ERP V3 Finance V2 Phase 0
-- ============================================================
-- 说明：
--   所有表当前为空。业务数据将在各 Phase 中通过 Workflow Runtime 写入：
--     Phase 1 — fin_ap_invoices, fin_ap_payments
--     Phase 2 — fin_ar_invoices, fin_ar_receipts
--     Phase 3 — fin_cash_accounts, fin_cash_transactions
--     Phase 4 — fin_shareholder_contributions, fin_shareholder_settlements
--     Phase 5 — fin_exchange_rates（汇率引擎）
-- ============================================================

-- ── 汇率表（各 Phase 通用）───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_exchange_rates (
  id              BIGSERIAL PRIMARY KEY,
  from_currency   VARCHAR(10)     NOT NULL,            -- 源币种（ISO 4217）
  to_currency     VARCHAR(10)     NOT NULL,            -- 目标币种
  rate_date       DATE            NOT NULL,            -- 汇率生效日期
  rate            NUMERIC(20, 8)  NOT NULL,            -- 汇率值
  rate_type       VARCHAR(20)     NOT NULL DEFAULT 'MIDDLE',  -- MIDDLE / BUY / SELL
  source          VARCHAR(60)     NULL,                -- 来源（MANUAL / PBC / PBOC）
  company_code    VARCHAR(20)     NULL,                -- NULL = 全局汇率
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  created_by      VARCHAR(80)     NULL,
  UNIQUE (from_currency, to_currency, rate_date, rate_type, company_code)
);
CREATE INDEX IF NOT EXISTS idx_fin_exchange_rates_date
  ON fin_exchange_rates (rate_date DESC, from_currency, to_currency);

COMMENT ON TABLE  fin_exchange_rates IS 'Finance V2 — 汇率表（多币种核算基础）';
COMMENT ON COLUMN fin_exchange_rates.rate_type IS 'MIDDLE=中间价 BUY=买入价 SELL=卖出价';

-- ── AP Runtime（Phase 1）────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_ap_invoices (
  id              BIGSERIAL PRIMARY KEY,
  ap_no           VARCHAR(40)     NOT NULL UNIQUE,     -- AP 编号（系统生成）
  company_code    VARCHAR(20)     NOT NULL,
  supplier_code   VARCHAR(40)     NOT NULL,
  supplier_name   VARCHAR(120)    NULL,
  invoice_no      VARCHAR(80)     NULL,                -- 供应商发票号
  invoice_date    DATE            NOT NULL,
  due_date        DATE            NULL,
  amount          NUMERIC(18, 4)  NOT NULL,
  paid_amount     NUMERIC(18, 4)  NOT NULL DEFAULT 0,
  balance         NUMERIC(18, 4)  GENERATED ALWAYS AS (amount - paid_amount) STORED,
  currency_code   VARCHAR(10)     NOT NULL DEFAULT 'CNY',
  status          VARCHAR(20)     NOT NULL DEFAULT 'OPEN',   -- OPEN/PARTIAL/PAID/VOID
  po_no           VARCHAR(40)     NULL,                -- 关联采购单号
  description     TEXT            NULL,
  tax_amount      NUMERIC(18, 4)  NULL,
  tax_rate        NUMERIC(8, 4)   NULL,
  wf_instance_id  BIGINT          NULL,               -- 关联审批实例
  project_code    VARCHAR(40)     NULL,
  department_code VARCHAR(40)     NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  created_by      VARCHAR(80)     NULL,
  updated_by      VARCHAR(80)     NULL,
  CONSTRAINT chk_fin_ap_invoices_status
    CHECK (status IN ('OPEN','PARTIAL','PAID','VOID','OVERDUE'))
);
CREATE INDEX IF NOT EXISTS idx_fin_ap_invoices_company    ON fin_ap_invoices (company_code);
CREATE INDEX IF NOT EXISTS idx_fin_ap_invoices_supplier   ON fin_ap_invoices (supplier_code);
CREATE INDEX IF NOT EXISTS idx_fin_ap_invoices_status     ON fin_ap_invoices (status);
CREATE INDEX IF NOT EXISTS idx_fin_ap_invoices_due        ON fin_ap_invoices (due_date) WHERE status IN ('OPEN','PARTIAL');
CREATE INDEX IF NOT EXISTS idx_fin_ap_invoices_wf         ON fin_ap_invoices (wf_instance_id) WHERE wf_instance_id IS NOT NULL;

COMMENT ON TABLE  fin_ap_invoices IS 'Finance V2 — AP 应付发票台账（Phase 1 原生 Runtime）';
COMMENT ON COLUMN fin_ap_invoices.balance IS '计算列：amount - paid_amount';

CREATE TABLE IF NOT EXISTS fin_ap_payments (
  id              BIGSERIAL PRIMARY KEY,
  payment_no      VARCHAR(40)     NOT NULL UNIQUE,
  invoice_id      BIGINT          NOT NULL REFERENCES fin_ap_invoices(id),
  company_code    VARCHAR(20)     NOT NULL,
  supplier_code   VARCHAR(40)     NOT NULL,
  payment_date    DATE            NOT NULL,
  amount          NUMERIC(18, 4)  NOT NULL,
  currency_code   VARCHAR(10)     NOT NULL DEFAULT 'CNY',
  exchange_rate   NUMERIC(20, 8)  NOT NULL DEFAULT 1,
  amount_cny      NUMERIC(18, 4)  GENERATED ALWAYS AS (amount * exchange_rate) STORED,
  payment_method  VARCHAR(30)     NULL,               -- BANK_TRANSFER / CASH / CHECK
  bank_account    VARCHAR(80)     NULL,
  reference_no    VARCHAR(80)     NULL,               -- 银行流水号
  note            TEXT            NULL,
  cash_account_id BIGINT          NULL,               -- 关联资金账户（Phase 3）
  wf_instance_id  BIGINT          NULL,               -- 付款审批实例
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  created_by      VARCHAR(80)     NULL,
  updated_by      VARCHAR(80)     NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_ap_payments_invoice    ON fin_ap_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_fin_ap_payments_date       ON fin_ap_payments (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_ap_payments_company    ON fin_ap_payments (company_code);

COMMENT ON TABLE fin_ap_payments IS 'Finance V2 — AP 付款记录（关联 fin_ap_invoices）';

-- ── AR Runtime（Phase 2）────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_ar_invoices (
  id              BIGSERIAL PRIMARY KEY,
  ar_no           VARCHAR(40)     NOT NULL UNIQUE,
  company_code    VARCHAR(20)     NOT NULL,
  customer_code   VARCHAR(40)     NOT NULL,
  customer_name   VARCHAR(120)    NULL,
  invoice_no      VARCHAR(80)     NULL,
  invoice_date    DATE            NOT NULL,
  due_date        DATE            NULL,
  amount          NUMERIC(18, 4)  NOT NULL,
  received_amount NUMERIC(18, 4)  NOT NULL DEFAULT 0,
  balance         NUMERIC(18, 4)  GENERATED ALWAYS AS (amount - received_amount) STORED,
  currency_code   VARCHAR(10)     NOT NULL DEFAULT 'CNY',
  status          VARCHAR(20)     NOT NULL DEFAULT 'OPEN',   -- OPEN/PARTIAL/RECEIVED/VOID
  order_no        VARCHAR(40)     NULL,
  description     TEXT            NULL,
  tax_amount      NUMERIC(18, 4)  NULL,
  wf_instance_id  BIGINT          NULL,
  project_code    VARCHAR(40)     NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  created_by      VARCHAR(80)     NULL,
  updated_by      VARCHAR(80)     NULL,
  CONSTRAINT chk_fin_ar_invoices_status
    CHECK (status IN ('OPEN','PARTIAL','RECEIVED','VOID','OVERDUE'))
);
CREATE INDEX IF NOT EXISTS idx_fin_ar_invoices_company    ON fin_ar_invoices (company_code);
CREATE INDEX IF NOT EXISTS idx_fin_ar_invoices_customer   ON fin_ar_invoices (customer_code);
CREATE INDEX IF NOT EXISTS idx_fin_ar_invoices_status     ON fin_ar_invoices (status);
CREATE INDEX IF NOT EXISTS idx_fin_ar_invoices_due        ON fin_ar_invoices (due_date) WHERE status IN ('OPEN','PARTIAL');

COMMENT ON TABLE fin_ar_invoices IS 'Finance V2 — AR 应收发票台账（Phase 2 原生 Runtime）';

CREATE TABLE IF NOT EXISTS fin_ar_receipts (
  id              BIGSERIAL PRIMARY KEY,
  receipt_no      VARCHAR(40)     NOT NULL UNIQUE,
  invoice_id      BIGINT          NOT NULL REFERENCES fin_ar_invoices(id),
  company_code    VARCHAR(20)     NOT NULL,
  customer_code   VARCHAR(40)     NOT NULL,
  receipt_date    DATE            NOT NULL,
  amount          NUMERIC(18, 4)  NOT NULL,
  currency_code   VARCHAR(10)     NOT NULL DEFAULT 'CNY',
  exchange_rate   NUMERIC(20, 8)  NOT NULL DEFAULT 1,
  amount_cny      NUMERIC(18, 4)  GENERATED ALWAYS AS (amount * exchange_rate) STORED,
  payment_method  VARCHAR(30)     NULL,
  bank_account    VARCHAR(80)     NULL,
  reference_no    VARCHAR(80)     NULL,
  note            TEXT            NULL,
  cash_account_id BIGINT          NULL,
  wf_instance_id  BIGINT          NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  created_by      VARCHAR(80)     NULL,
  updated_by      VARCHAR(80)     NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_ar_receipts_invoice    ON fin_ar_receipts (invoice_id);
CREATE INDEX IF NOT EXISTS idx_fin_ar_receipts_date       ON fin_ar_receipts (receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_ar_receipts_company    ON fin_ar_receipts (company_code);

COMMENT ON TABLE fin_ar_receipts IS 'Finance V2 — AR 收款记录（关联 fin_ar_invoices）';

-- ── 资金账户（Phase 3）──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_cash_accounts (
  id              BIGSERIAL PRIMARY KEY,
  account_code    VARCHAR(40)     NOT NULL UNIQUE,
  account_name    VARCHAR(120)    NOT NULL,
  company_code    VARCHAR(20)     NOT NULL,
  account_type    VARCHAR(20)     NOT NULL DEFAULT 'BANK',  -- BANK / CASH / VIRTUAL
  bank_name       VARCHAR(80)     NULL,
  bank_account_no VARCHAR(60)     NULL,
  currency_code   VARCHAR(10)     NOT NULL DEFAULT 'CNY',
  opening_balance NUMERIC(18, 4)  NOT NULL DEFAULT 0,
  current_balance NUMERIC(18, 4)  NOT NULL DEFAULT 0,
  is_active       BOOLEAN         NOT NULL DEFAULT true,
  note            TEXT            NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  created_by      VARCHAR(80)     NULL,
  CONSTRAINT chk_fin_cash_accounts_type
    CHECK (account_type IN ('BANK','CASH','VIRTUAL','DEPOSIT'))
);
CREATE INDEX IF NOT EXISTS idx_fin_cash_accounts_company  ON fin_cash_accounts (company_code);
CREATE INDEX IF NOT EXISTS idx_fin_cash_accounts_active   ON fin_cash_accounts (is_active) WHERE is_active = true;

COMMENT ON TABLE fin_cash_accounts IS 'Finance V2 — 资金账户（Phase 3）';

CREATE TABLE IF NOT EXISTS fin_cash_transactions (
  id              BIGSERIAL PRIMARY KEY,
  txn_no          VARCHAR(40)     NOT NULL UNIQUE,
  account_id      BIGINT          NOT NULL REFERENCES fin_cash_accounts(id),
  company_code    VARCHAR(20)     NOT NULL,
  txn_date        DATE            NOT NULL,
  txn_type        VARCHAR(20)     NOT NULL,            -- IN / OUT / TRANSFER
  amount          NUMERIC(18, 4)  NOT NULL,            -- 正数=收 负数=付
  balance_after   NUMERIC(18, 4)  NOT NULL,
  currency_code   VARCHAR(10)     NOT NULL DEFAULT 'CNY',
  exchange_rate   NUMERIC(20, 8)  NOT NULL DEFAULT 1,
  reference_type  VARCHAR(40)     NULL,               -- AP_PAYMENT / AR_RECEIPT / TRANSFER
  reference_id    BIGINT          NULL,
  reference_no    VARCHAR(80)     NULL,
  description     TEXT            NULL,
  bank_reference  VARCHAR(80)     NULL,               -- 银行流水号
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  created_by      VARCHAR(80)     NULL,
  CONSTRAINT chk_fin_cash_transactions_type
    CHECK (txn_type IN ('IN','OUT','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT'))
);
CREATE INDEX IF NOT EXISTS idx_fin_cash_txn_account   ON fin_cash_transactions (account_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_cash_txn_date      ON fin_cash_transactions (txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_cash_txn_ref       ON fin_cash_transactions (reference_type, reference_id) WHERE reference_id IS NOT NULL;

COMMENT ON TABLE fin_cash_transactions IS 'Finance V2 — 资金流水（账户余额变动明细）';

-- ── 股东资金（Phase 4）──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_shareholder_contributions (
  id              BIGSERIAL PRIMARY KEY,
  contribution_no VARCHAR(40)     NOT NULL UNIQUE,
  company_code    VARCHAR(20)     NOT NULL,
  shareholder_code VARCHAR(40)    NOT NULL,           -- 股东标识
  shareholder_name VARCHAR(120)   NULL,
  contribution_type VARCHAR(30)   NOT NULL,           -- EQUITY / LOAN / ADVANCE_PAYMENT
  amount          NUMERIC(18, 4)  NOT NULL,
  currency_code   VARCHAR(10)     NOT NULL DEFAULT 'CNY',
  contribution_date DATE          NOT NULL,
  interest_rate   NUMERIC(8, 4)   NULL,               -- 年化利率（贷款类）
  interest_type   VARCHAR(10)     NULL,               -- SIMPLE / COMPOUND
  maturity_date   DATE            NULL,
  status          VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE',
  settled_amount  NUMERIC(18, 4)  NOT NULL DEFAULT 0,
  balance         NUMERIC(18, 4)  GENERATED ALWAYS AS (amount - settled_amount) STORED,
  wf_instance_id  BIGINT          NULL,
  note            TEXT            NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  created_by      VARCHAR(80)     NULL,
  updated_by      VARCHAR(80)     NULL,
  CONSTRAINT chk_fin_sh_contribution_type
    CHECK (contribution_type IN ('EQUITY','LOAN','ADVANCE_PAYMENT','GUARANTEE')),
  CONSTRAINT chk_fin_sh_contribution_status
    CHECK (status IN ('ACTIVE','PARTIALLY_SETTLED','SETTLED','VOID'))
);
CREATE INDEX IF NOT EXISTS idx_fin_sh_contrib_company     ON fin_shareholder_contributions (company_code);
CREATE INDEX IF NOT EXISTS idx_fin_sh_contrib_shareholder ON fin_shareholder_contributions (shareholder_code);
CREATE INDEX IF NOT EXISTS idx_fin_sh_contrib_status      ON fin_shareholder_contributions (status);

COMMENT ON TABLE fin_shareholder_contributions IS 'Finance V2 — 股东出资/贷款台账（Phase 4）';

CREATE TABLE IF NOT EXISTS fin_shareholder_settlements (
  id              BIGSERIAL PRIMARY KEY,
  settlement_no   VARCHAR(40)     NOT NULL UNIQUE,
  contribution_id BIGINT          NOT NULL REFERENCES fin_shareholder_contributions(id),
  company_code    VARCHAR(20)     NOT NULL,
  shareholder_code VARCHAR(40)    NOT NULL,
  settlement_date DATE            NOT NULL,
  principal_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  interest_amount NUMERIC(18, 4)  NOT NULL DEFAULT 0,
  total_amount    NUMERIC(18, 4)  GENERATED ALWAYS AS (principal_amount + interest_amount) STORED,
  currency_code   VARCHAR(10)     NOT NULL DEFAULT 'CNY',
  payment_method  VARCHAR(30)     NULL,
  reference_no    VARCHAR(80)     NULL,
  note            TEXT            NULL,
  wf_instance_id  BIGINT          NULL,
  cash_account_id BIGINT          NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  created_by      VARCHAR(80)     NULL,
  updated_by      VARCHAR(80)     NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_sh_settlements_contrib ON fin_shareholder_settlements (contribution_id);
CREATE INDEX IF NOT EXISTS idx_fin_sh_settlements_date    ON fin_shareholder_settlements (settlement_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_sh_settlements_company ON fin_shareholder_settlements (company_code);

COMMENT ON TABLE fin_shareholder_settlements IS 'Finance V2 — 股东资金结算单（Phase 4）';

-- ── 完成标记 ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ Finance V2 Phase 0 baseline tables created (or already exist):';
  RAISE NOTICE '   fin_exchange_rates, fin_ap_invoices, fin_ap_payments,';
  RAISE NOTICE '   fin_ar_invoices, fin_ar_receipts,';
  RAISE NOTICE '   fin_cash_accounts, fin_cash_transactions,';
  RAISE NOTICE '   fin_shareholder_contributions, fin_shareholder_settlements';
END $$;
