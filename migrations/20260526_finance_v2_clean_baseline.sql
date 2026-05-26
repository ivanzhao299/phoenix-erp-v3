-- ============================================================
-- Finance V2 Phase 0 — Clean Baseline DDL
-- Created:  2026-05-26
-- Purpose:  正式建立 fin_* 领域表结构
--
-- 前提说明：
--   系统尚未生产运行，当前无真实业务数据。
--   旧 finance 数据（fin_transactions / fin_payments / biz_cash_flow）
--   均为测试数据，本迁移不引用、不迁移旧表。
--   旧基线 migration（20260526_finance_v2_baseline.sql）如已执行，
--   本脚本先 DROP 旧表，再以正式字段规范重建。
--
-- 字段规范（对齐 prc2 样板）：
--   金额三段式：currency_code / amount_original / exchange_rate / amount_base / base_currency
--   公司维度：  company_code / company_name
--   项目维度：  project_code / project_name（有项目语义的表）
--   状态字段：  status（VARCHAR 32）
--   时间戳：    created_at / updated_at（TIMESTAMPTZ）
-- ============================================================

-- ── 0. 先清理旧基线表（如存在）────────────────────────────────────────────
-- 按依赖顺序 DROP：子表先，父表后

DROP TABLE IF EXISTS fin_shareholder_settlements       CASCADE;
DROP TABLE IF EXISTS fin_shareholder_contributions     CASCADE;
DROP TABLE IF EXISTS fin_cash_transactions             CASCADE;
DROP TABLE IF EXISTS fin_cash_accounts                 CASCADE;
DROP TABLE IF EXISTS fin_ar_receipts                   CASCADE;
DROP TABLE IF EXISTS fin_ar_invoices                   CASCADE;
DROP TABLE IF EXISTS fin_ap_payments                   CASCADE;
DROP TABLE IF EXISTS fin_ap_invoices                   CASCADE;
DROP TABLE IF EXISTS fin_ap_payment_allocations        CASCADE;
DROP TABLE IF EXISTS fin_exchange_rates                CASCADE;

-- ── 1. fin_exchange_rates — 汇率表（各 Phase 通用）────────────────────────

CREATE TABLE fin_exchange_rates (
  id              BIGSERIAL       PRIMARY KEY,
  from_currency   VARCHAR(10)     NOT NULL,
  to_currency     VARCHAR(10)     NOT NULL,
  rate_date       DATE            NOT NULL,
  rate            NUMERIC(20, 8)  NOT NULL,
  rate_type       VARCHAR(20)     NOT NULL DEFAULT 'MIDDLE',
  source          VARCHAR(60)     NULL,
  company_code    VARCHAR(64)     NULL,   -- NULL = 全局；有值 = 公司级
  created_by      VARCHAR(80)     NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  UNIQUE (from_currency, to_currency, rate_date, rate_type, COALESCE(company_code, ''))
);
CREATE INDEX idx_fin_exchange_rates_date
  ON fin_exchange_rates (rate_date DESC, from_currency, to_currency);

COMMENT ON TABLE  fin_exchange_rates IS 'Finance V2 — 汇率表（多币种核算基础）';
COMMENT ON COLUMN fin_exchange_rates.rate_type IS 'MIDDLE=中间价 BUY=买入价 SELL=卖出价';

-- ── 2. fin_ap_invoices — 应付发票台账（Phase 1 启用）──────────────────────

CREATE TABLE fin_ap_invoices (
  id                      BIGSERIAL       PRIMARY KEY,
  ap_no                   VARCHAR(60)     NOT NULL UNIQUE,

  -- 公司维度
  company_code            VARCHAR(64)     NOT NULL,
  company_name            VARCHAR(256)    NULL,

  -- 项目维度
  project_code            VARCHAR(64)     NULL,
  project_name            VARCHAR(256)    NULL,

  -- 供应商
  supplier_code           VARCHAR(64)     NOT NULL,
  supplier_name           VARCHAR(256)    NULL,

  -- 发票信息
  invoice_no              VARCHAR(100)    NULL,
  invoice_date            DATE            NOT NULL,
  due_date                DATE            NULL,

  -- 金额三段式
  currency_code           VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  amount_original         NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  exchange_rate           NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  amount_base             NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  base_currency           VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  -- 付款核销
  paid_amount_original    NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  balance_amount_original NUMERIC(18, 2)  GENERATED ALWAYS AS
                            (amount_original - paid_amount_original) STORED,

  -- 税费
  tax_amount              NUMERIC(18, 2)  NULL,
  tax_rate                NUMERIC(8, 4)   NULL,

  -- 状态：DRAFT / OPEN / PARTIAL / PAID / OVERDUE / VOID
  status                  VARCHAR(32)     NOT NULL DEFAULT 'OPEN',

  -- 关联
  po_no                   VARCHAR(80)     NULL,
  wf_instance_id          BIGINT          NULL,

  remark                  TEXT            NULL,
  created_by              VARCHAR(80)     NULL,
  updated_by              VARCHAR(80)     NULL,
  created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_ap_invoices_status
    CHECK (status IN ('DRAFT','OPEN','PARTIAL','PAID','OVERDUE','VOID'))
);
CREATE INDEX idx_fin_ap_invoices_company   ON fin_ap_invoices (company_code);
CREATE INDEX idx_fin_ap_invoices_supplier  ON fin_ap_invoices (supplier_code);
CREATE INDEX idx_fin_ap_invoices_status    ON fin_ap_invoices (status);
CREATE INDEX idx_fin_ap_invoices_due       ON fin_ap_invoices (due_date)
  WHERE status IN ('OPEN','PARTIAL');
CREATE INDEX idx_fin_ap_invoices_wf        ON fin_ap_invoices (wf_instance_id)
  WHERE wf_instance_id IS NOT NULL;

COMMENT ON TABLE fin_ap_invoices IS 'Finance V2 — AP 应付发票台账（Phase 1 正式启用）';

-- ── 3. fin_ap_payment_allocations — AP 付款核销（Phase 1）────────────────

CREATE TABLE fin_ap_payment_allocations (
  id                  BIGSERIAL       PRIMARY KEY,
  alloc_no            VARCHAR(60)     NOT NULL UNIQUE,
  invoice_id          BIGINT          NOT NULL REFERENCES fin_ap_invoices(id),

  company_code        VARCHAR(64)     NOT NULL,
  company_name        VARCHAR(256)    NULL,

  -- 金额三段式
  currency_code       VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  amount_original     NUMERIC(18, 2)  NOT NULL,
  exchange_rate       NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  amount_base         NUMERIC(18, 2)  NOT NULL,
  base_currency       VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  payment_date        DATE            NOT NULL,
  payment_method      VARCHAR(40)     NULL,
  bank_account        VARCHAR(100)    NULL,
  reference_no        VARCHAR(100)    NULL,

  cash_account_id     BIGINT          NULL,   -- Phase 3 关联资金账户
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

COMMENT ON TABLE fin_ap_payment_allocations IS 'Finance V2 — AP 付款核销记录（Phase 1）';

-- ── 4. fin_ar_invoices — 应收发票台账（Phase 2）────────────────────────────

CREATE TABLE fin_ar_invoices (
  id                        BIGSERIAL       PRIMARY KEY,
  ar_no                     VARCHAR(60)     NOT NULL UNIQUE,

  company_code              VARCHAR(64)     NOT NULL,
  company_name              VARCHAR(256)    NULL,

  project_code              VARCHAR(64)     NULL,
  project_name              VARCHAR(256)    NULL,

  customer_code             VARCHAR(64)     NOT NULL,
  customer_name             VARCHAR(256)    NULL,

  invoice_no                VARCHAR(100)    NULL,
  invoice_date              DATE            NOT NULL,
  due_date                  DATE            NULL,

  -- 金额三段式
  currency_code             VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  amount_original           NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  exchange_rate             NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  amount_base               NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  base_currency             VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  received_amount_original  NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  balance_amount_original   NUMERIC(18, 2)  GENERATED ALWAYS AS
                              (amount_original - received_amount_original) STORED,

  tax_amount                NUMERIC(18, 2)  NULL,

  -- 状态：DRAFT / OPEN / PARTIAL / RECEIVED / OVERDUE / VOID
  status                    VARCHAR(32)     NOT NULL DEFAULT 'OPEN',

  order_no                  VARCHAR(80)     NULL,
  wf_instance_id            BIGINT          NULL,

  remark                    TEXT            NULL,
  created_by                VARCHAR(80)     NULL,
  updated_by                VARCHAR(80)     NULL,
  created_at                TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_ar_invoices_status
    CHECK (status IN ('DRAFT','OPEN','PARTIAL','RECEIVED','OVERDUE','VOID'))
);
CREATE INDEX idx_fin_ar_invoices_company   ON fin_ar_invoices (company_code);
CREATE INDEX idx_fin_ar_invoices_customer  ON fin_ar_invoices (customer_code);
CREATE INDEX idx_fin_ar_invoices_status    ON fin_ar_invoices (status);
CREATE INDEX idx_fin_ar_invoices_due       ON fin_ar_invoices (due_date)
  WHERE status IN ('OPEN','PARTIAL');

COMMENT ON TABLE fin_ar_invoices IS 'Finance V2 — AR 应收发票台账（Phase 2 正式启用）';

-- ── 5. fin_ar_receipts — 收款核销（Phase 2）────────────────────────────────

CREATE TABLE fin_ar_receipts (
  id                  BIGSERIAL       PRIMARY KEY,
  receipt_no          VARCHAR(60)     NOT NULL UNIQUE,
  invoice_id          BIGINT          NOT NULL REFERENCES fin_ar_invoices(id),

  company_code        VARCHAR(64)     NOT NULL,
  company_name        VARCHAR(256)    NULL,

  customer_code       VARCHAR(64)     NOT NULL,
  customer_name       VARCHAR(256)    NULL,

  receipt_date        DATE            NOT NULL,

  -- 金额三段式
  currency_code       VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  amount_original     NUMERIC(18, 2)  NOT NULL,
  exchange_rate       NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  amount_base         NUMERIC(18, 2)  NOT NULL,
  base_currency       VARCHAR(8)      NOT NULL DEFAULT 'CNY',

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
CREATE INDEX idx_fin_ar_receipts_invoice   ON fin_ar_receipts (invoice_id);
CREATE INDEX idx_fin_ar_receipts_date      ON fin_ar_receipts (receipt_date DESC);
CREATE INDEX idx_fin_ar_receipts_company   ON fin_ar_receipts (company_code);

COMMENT ON TABLE fin_ar_receipts IS 'Finance V2 — AR 收款核销（Phase 2）';

-- ── 6. fin_cash_accounts — 资金账户（Phase 3）──────────────────────────────

CREATE TABLE fin_cash_accounts (
  id              BIGSERIAL       PRIMARY KEY,
  account_code    VARCHAR(60)     NOT NULL UNIQUE,
  account_name    VARCHAR(200)    NOT NULL,

  company_code    VARCHAR(64)     NOT NULL,
  company_name    VARCHAR(256)    NULL,

  -- BANK / CASH / VIRTUAL / DEPOSIT
  account_type    VARCHAR(30)     NOT NULL DEFAULT 'BANK',

  bank_name       VARCHAR(100)    NULL,
  bank_account_no VARCHAR(60)     NULL,

  currency_code   VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  opening_balance NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  current_balance NUMERIC(18, 2)  NOT NULL DEFAULT 0,

  is_active       BOOLEAN         NOT NULL DEFAULT true,
  remark          TEXT            NULL,
  created_by      VARCHAR(80)     NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_cash_accounts_type
    CHECK (account_type IN ('BANK','CASH','VIRTUAL','DEPOSIT'))
);
CREATE INDEX idx_fin_cash_accounts_company ON fin_cash_accounts (company_code);
CREATE INDEX idx_fin_cash_accounts_active  ON fin_cash_accounts (is_active) WHERE is_active = true;

COMMENT ON TABLE fin_cash_accounts IS 'Finance V2 — 资金账户（Phase 3）';

-- ── 7. fin_cash_transactions — 资金流水（Phase 3）─────────────────────────

CREATE TABLE fin_cash_transactions (
  id                  BIGSERIAL       PRIMARY KEY,
  txn_no              VARCHAR(60)     NOT NULL UNIQUE,
  account_id          BIGINT          NOT NULL REFERENCES fin_cash_accounts(id),

  company_code        VARCHAR(64)     NOT NULL,
  company_name        VARCHAR(256)    NULL,

  project_code        VARCHAR(64)     NULL,
  project_name        VARCHAR(256)    NULL,

  txn_date            DATE            NOT NULL,

  -- IN / OUT / TRANSFER_IN / TRANSFER_OUT / ADJUSTMENT
  txn_type            VARCHAR(30)     NOT NULL,

  -- 金额三段式（正数=收入，负数=支出）
  currency_code       VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  amount_original     NUMERIC(18, 2)  NOT NULL,
  exchange_rate       NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  amount_base         NUMERIC(18, 2)  NOT NULL,
  base_currency       VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  balance_after       NUMERIC(18, 2)  NOT NULL,

  -- AP_PAYMENT / AR_RECEIPT / TRANSFER / ADJUSTMENT
  reference_type      VARCHAR(40)     NULL,
  reference_id        BIGINT          NULL,
  reference_no        VARCHAR(80)     NULL,

  bank_reference      VARCHAR(100)    NULL,
  description         TEXT            NULL,
  created_by          VARCHAR(80)     NULL,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_cash_txn_type
    CHECK (txn_type IN ('IN','OUT','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT'))
);
CREATE INDEX idx_fin_cash_txn_account  ON fin_cash_transactions (account_id, txn_date DESC);
CREATE INDEX idx_fin_cash_txn_date     ON fin_cash_transactions (txn_date DESC);
CREATE INDEX idx_fin_cash_txn_ref      ON fin_cash_transactions (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

COMMENT ON TABLE fin_cash_transactions IS 'Finance V2 — 资金流水（Append-only，账户余额变动明细）';

-- ── 8. fin_shareholder_contributions — 股东出资台账（Phase 4）─────────────

CREATE TABLE fin_shareholder_contributions (
  id                  BIGSERIAL       PRIMARY KEY,
  contribution_no     VARCHAR(60)     NOT NULL UNIQUE,

  company_code        VARCHAR(64)     NOT NULL,
  company_name        VARCHAR(256)    NULL,

  project_code        VARCHAR(64)     NULL,
  project_name        VARCHAR(256)    NULL,

  shareholder_code    VARCHAR(64)     NOT NULL,
  shareholder_name    VARCHAR(200)    NOT NULL,

  -- EQUITY / LOAN / ADVANCE_PAYMENT / GUARANTEE
  contribution_type   VARCHAR(40)     NOT NULL,

  contribution_date   DATE            NOT NULL,
  maturity_date       DATE            NULL,

  -- 金额三段式
  currency_code       VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  amount_original     NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  exchange_rate       NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  amount_base         NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  base_currency       VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  -- 偿还进度
  settled_amount      NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  balance_amount      NUMERIC(18, 2)  GENERATED ALWAYS AS
                        (amount_original - settled_amount) STORED,

  -- 利息
  interest_rate       NUMERIC(8, 4)   NULL,
  interest_type       VARCHAR(20)     NULL,    -- SIMPLE / COMPOUND

  -- 状态：ACTIVE / PARTIALLY_SETTLED / SETTLED / VOID
  status              VARCHAR(32)     NOT NULL DEFAULT 'ACTIVE',

  wf_instance_id      BIGINT          NULL,
  remark              TEXT            NULL,
  created_by          VARCHAR(80)     NULL,
  updated_by          VARCHAR(80)     NULL,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_sh_contribution_type
    CHECK (contribution_type IN ('EQUITY','LOAN','ADVANCE_PAYMENT','GUARANTEE')),
  CONSTRAINT chk_fin_sh_contribution_status
    CHECK (status IN ('ACTIVE','PARTIALLY_SETTLED','SETTLED','VOID'))
);
CREATE INDEX idx_fin_sh_contrib_company      ON fin_shareholder_contributions (company_code);
CREATE INDEX idx_fin_sh_contrib_shareholder  ON fin_shareholder_contributions (shareholder_code);
CREATE INDEX idx_fin_sh_contrib_status       ON fin_shareholder_contributions (status);

COMMENT ON TABLE fin_shareholder_contributions
  IS 'Finance V2 — 股东出资/借款台账（Phase 4，复用 prc2 设计样板）';

-- ── 9. fin_shareholder_settlements — 股东资金结算（Phase 4）───────────────

CREATE TABLE fin_shareholder_settlements (
  id                  BIGSERIAL       PRIMARY KEY,
  settlement_no       VARCHAR(60)     NOT NULL UNIQUE,
  contribution_id     BIGINT          NOT NULL REFERENCES fin_shareholder_contributions(id),

  company_code        VARCHAR(64)     NOT NULL,
  company_name        VARCHAR(256)    NULL,

  shareholder_code    VARCHAR(64)     NOT NULL,
  shareholder_name    VARCHAR(200)    NULL,

  settlement_date     DATE            NOT NULL,

  -- 金额三段式
  currency_code       VARCHAR(8)      NOT NULL DEFAULT 'CNY',
  principal_original  NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  interest_original   NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  total_original      NUMERIC(18, 2)  GENERATED ALWAYS AS
                        (principal_original + interest_original) STORED,
  exchange_rate       NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  total_base          NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  base_currency       VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  payment_method      VARCHAR(40)     NULL,
  reference_no        VARCHAR(100)    NULL,
  cash_account_id     BIGINT          NULL,
  wf_instance_id      BIGINT          NULL,

  remark              TEXT            NULL,
  created_by          VARCHAR(80)     NULL,
  updated_by          VARCHAR(80)     NULL,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX idx_fin_sh_settlements_contrib  ON fin_shareholder_settlements (contribution_id);
CREATE INDEX idx_fin_sh_settlements_date     ON fin_shareholder_settlements (settlement_date DESC);
CREATE INDEX idx_fin_sh_settlements_company  ON fin_shareholder_settlements (company_code);

COMMENT ON TABLE fin_shareholder_settlements IS 'Finance V2 — 股东资金结算单（Phase 4）';

-- ── 完成标记 ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ Finance V2 Phase 0 Clean Baseline — 所有 fin_* 表已创建：';
  RAISE NOTICE '   fin_exchange_rates              (汇率表)';
  RAISE NOTICE '   fin_ap_invoices                 (AP 应付发票 — Phase 1)';
  RAISE NOTICE '   fin_ap_payment_allocations      (AP 付款核销 — Phase 1)';
  RAISE NOTICE '   fin_ar_invoices                 (AR 应收发票 — Phase 2)';
  RAISE NOTICE '   fin_ar_receipts                 (AR 收款核销 — Phase 2)';
  RAISE NOTICE '   fin_cash_accounts               (资金账户   — Phase 3)';
  RAISE NOTICE '   fin_cash_transactions           (资金流水   — Phase 3)';
  RAISE NOTICE '   fin_shareholder_contributions   (股东出资   — Phase 4)';
  RAISE NOTICE '   fin_shareholder_settlements     (股东结算   — Phase 4)';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  旧表不受影响（已废弃，只读）：';
  RAISE NOTICE '   fin_transactions / fin_payments / biz_cash_flow';
END $$;
