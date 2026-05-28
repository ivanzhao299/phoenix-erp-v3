-- ═══════════════════════════════════════════════════════════════════════════
-- Phoenix ERP V3 — DDL 22: Finance V2 全量建表（幂等）
-- 从 TypeORM Entity 定义提取，与 src/modules/finance-v2/entities/ 保持一致
-- 执行顺序：exchange_rates → ap/ar → cash → shareholder → expense/reimbursement
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. fin_exchange_rates — 汇率表（Phase 0 基线）─────────────────────────
CREATE TABLE IF NOT EXISTS fin_exchange_rates (
  id             BIGSERIAL    PRIMARY KEY,
  from_currency  VARCHAR(10)  NOT NULL,
  to_currency    VARCHAR(10)  NOT NULL,
  rate_date      DATE         NOT NULL,
  rate           NUMERIC(20,8) NOT NULL,
  rate_type      VARCHAR(20)  NOT NULL DEFAULT 'MIDDLE',
  source         VARCHAR(60),
  company_code   VARCHAR(64),
  created_by     VARCHAR(80),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_exrate_pair_date
  ON fin_exchange_rates (from_currency, to_currency, rate_date DESC);

-- ── 2. fin_ap_invoices — 应付发票台账（Phase 1）──────────────────────────
CREATE TABLE IF NOT EXISTS fin_ap_invoices (
  id                      BIGSERIAL    PRIMARY KEY,
  ap_no                   VARCHAR(60)  NOT NULL UNIQUE,

  -- 来源追踪
  source_type             VARCHAR(30)  NOT NULL DEFAULT 'MANUAL',
  source_id               BIGINT,
  source_no               VARCHAR(80),

  -- 公司 / 项目
  company_code            VARCHAR(64)  NOT NULL,
  company_name            VARCHAR(256),
  project_code            VARCHAR(64),
  project_name            VARCHAR(256),

  -- 供应商
  supplier_id             BIGINT,
  supplier_code           VARCHAR(64),
  supplier_name           VARCHAR(256) NOT NULL,

  -- 发票信息
  invoice_no              VARCHAR(100),
  invoice_date            DATE,
  due_date                DATE,

  -- 金额三段式
  currency_code           VARCHAR(8)   NOT NULL DEFAULT 'CNY',
  amount_original         NUMERIC(18,2) NOT NULL DEFAULT 0,
  exchange_rate           NUMERIC(18,8) NOT NULL DEFAULT 1,
  amount_base             NUMERIC(18,2) NOT NULL DEFAULT 0,
  base_currency           VARCHAR(8)   NOT NULL DEFAULT 'CNY',

  -- 付款进度
  paid_amount_original    NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid_amount_base        NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_amount_original NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_amount_base     NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- 状态
  status                  VARCHAR(32)  NOT NULL DEFAULT 'OPEN',
  payment_status          VARCHAR(20)  NOT NULL DEFAULT 'UNPAID',

  -- 税费
  tax_amount              NUMERIC(18,2),
  tax_rate                NUMERIC(8,4),

  -- 关联
  wf_instance_id          BIGINT,
  remark                  TEXT,
  created_by              VARCHAR(80),
  updated_by              VARCHAR(80),
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_ap_company_status
  ON fin_ap_invoices (company_code, status);
CREATE INDEX IF NOT EXISTS idx_fin_ap_supplier_status
  ON fin_ap_invoices (supplier_code, status) WHERE supplier_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_ap_due_date
  ON fin_ap_invoices (due_date) WHERE due_date IS NOT NULL;

-- ── 3. fin_ar_invoices — 应收发票台账（Phase 2）──────────────────────────
CREATE TABLE IF NOT EXISTS fin_ar_invoices (
  id                         BIGSERIAL    PRIMARY KEY,
  ar_no                      VARCHAR(60)  NOT NULL UNIQUE,

  -- 来源追踪
  source_type                VARCHAR(30)  NOT NULL DEFAULT 'MANUAL',
  source_id                  BIGINT,
  source_no                  VARCHAR(80),

  -- 公司 / 项目
  company_code               VARCHAR(64)  NOT NULL,
  company_name               VARCHAR(256),
  project_code               VARCHAR(64),
  project_name               VARCHAR(256),

  -- 客户
  customer_id                BIGINT,
  customer_code              VARCHAR(64),
  customer_name              VARCHAR(256) NOT NULL,

  -- 发票信息
  invoice_no                 VARCHAR(100),
  invoice_date               DATE,
  due_date                   DATE,

  -- 金额三段式
  currency_code              VARCHAR(8)   NOT NULL DEFAULT 'CNY',
  amount_original            NUMERIC(18,2) NOT NULL DEFAULT 0,
  exchange_rate              NUMERIC(18,8) NOT NULL DEFAULT 1,
  amount_base                NUMERIC(18,2) NOT NULL DEFAULT 0,
  base_currency              VARCHAR(8)   NOT NULL DEFAULT 'CNY',

  -- 收款进度
  received_amount_original   NUMERIC(18,2) NOT NULL DEFAULT 0,
  received_amount_base       NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_amount_original    NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_amount_base        NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- 状态
  status                     VARCHAR(32)  NOT NULL DEFAULT 'OPEN',
  collection_status          VARCHAR(20)  NOT NULL DEFAULT 'UNRECEIVED',

  -- 关联
  wf_instance_id             BIGINT,
  remark                     TEXT,
  created_by                 VARCHAR(80),
  updated_by                 VARCHAR(80),
  created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_ar_company_status
  ON fin_ar_invoices (company_code, status);
CREATE INDEX IF NOT EXISTS idx_fin_ar_customer_status
  ON fin_ar_invoices (customer_code, status) WHERE customer_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_ar_due_date
  ON fin_ar_invoices (due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_ar_source_no
  ON fin_ar_invoices (source_no) WHERE source_no IS NOT NULL;

-- ── 4. fin_ar_receipts — 收款记录（Phase 2）──────────────────────────────
CREATE TABLE IF NOT EXISTS fin_ar_receipts (
  id                    BIGSERIAL    PRIMARY KEY,
  receipt_no            VARCHAR(60)  NOT NULL UNIQUE,

  -- 公司 / 项目
  company_code          VARCHAR(64)  NOT NULL,
  company_name          VARCHAR(256),
  project_code          VARCHAR(64),
  project_name          VARCHAR(256),

  -- 客户
  customer_id           BIGINT,
  customer_code         VARCHAR(64),
  customer_name         VARCHAR(256) NOT NULL,

  -- 收款信息
  receipt_date          DATE         NOT NULL,
  currency_code         VARCHAR(8)   NOT NULL DEFAULT 'CNY',
  amount_original       NUMERIC(18,2) NOT NULL,
  exchange_rate         NUMERIC(18,8) NOT NULL DEFAULT 1,
  amount_base           NUMERIC(18,2) NOT NULL DEFAULT 0,
  base_currency         VARCHAR(8)   NOT NULL DEFAULT 'CNY',

  -- 渠道
  receipt_method        VARCHAR(40),
  received_account_code VARCHAR(100),
  bank_ref              VARCHAR(100),

  -- 状态
  status                VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',

  -- 关联
  wf_instance_id        BIGINT,
  remark                TEXT,
  created_by            VARCHAR(80),
  updated_by            VARCHAR(80),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_ar_receipts_company
  ON fin_ar_receipts (company_code, status);
CREATE INDEX IF NOT EXISTS idx_fin_ar_receipts_customer
  ON fin_ar_receipts (customer_code) WHERE customer_code IS NOT NULL;

-- ── 5. fin_ar_receipt_allocations — 收款核销分摊（Phase 2）───────────────
CREATE TABLE IF NOT EXISTS fin_ar_receipt_allocations (
  id                         BIGSERIAL    PRIMARY KEY,
  receipt_id                 BIGINT       NOT NULL,
  receipt_no                 VARCHAR(60)  NOT NULL,
  ar_invoice_id              BIGINT       NOT NULL,
  ar_no                      VARCHAR(60)  NOT NULL,
  allocated_amount_original  NUMERIC(18,2) NOT NULL,
  allocated_amount_base      NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency_code              VARCHAR(8)   NOT NULL DEFAULT 'CNY',
  created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_fin_alloc_positive CHECK (allocated_amount_original > 0)
);
CREATE INDEX IF NOT EXISTS idx_fin_alloc_receipt  ON fin_ar_receipt_allocations (receipt_id);
CREATE INDEX IF NOT EXISTS idx_fin_alloc_ar       ON fin_ar_receipt_allocations (ar_invoice_id);

-- ── 6. fin_cash_accounts — 资金账户台账（Phase 3）────────────────────────
CREATE TABLE IF NOT EXISTS fin_cash_accounts (
  id               BIGSERIAL    PRIMARY KEY,
  account_code     VARCHAR(60)  NOT NULL UNIQUE,
  account_name     VARCHAR(200) NOT NULL,

  -- 公司维度
  company_code     VARCHAR(64)  NOT NULL,
  company_name     VARCHAR(256),

  -- 货币 / 类型
  currency_code    VARCHAR(8)   NOT NULL DEFAULT 'CNY',
  account_type     VARCHAR(30)  NOT NULL DEFAULT 'BANK',

  -- 余额
  opening_balance  NUMERIC(18,2) NOT NULL DEFAULT 0,
  current_balance  NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- 银行信息
  bank_name        VARCHAR(100),
  bank_account_no  VARCHAR(60),

  -- 状态
  status           VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  remark           TEXT,
  created_by       VARCHAR(80),
  updated_by       VARCHAR(80),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_cash_accounts_company
  ON fin_cash_accounts (company_code, status);

-- ── 7. fin_cash_transactions — 资金流水（Phase 3，Append-Only）───────────
CREATE TABLE IF NOT EXISTS fin_cash_transactions (
  id            BIGSERIAL    PRIMARY KEY,
  txn_no        VARCHAR(60)  NOT NULL UNIQUE,

  -- 账户
  account_id    BIGINT       NOT NULL,
  account_code  VARCHAR(60)  NOT NULL,
  account_name  VARCHAR(200) NOT NULL,

  -- 公司维度
  company_code  VARCHAR(64)  NOT NULL,
  company_name  VARCHAR(256),

  -- 方向与金额
  direction     VARCHAR(8)   NOT NULL,   -- IN / OUT
  source_type   VARCHAR(30),
  source_id     BIGINT,
  source_no     VARCHAR(80),
  currency_code VARCHAR(8)   NOT NULL,
  amount        NUMERIC(18,2) NOT NULL,
  balance_after NUMERIC(18,2) NOT NULL,
  txn_date      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  remark        TEXT,
  created_by    VARCHAR(80),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_cash_txn_account_date
  ON fin_cash_transactions (account_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_cash_txn_company_date
  ON fin_cash_transactions (company_code, txn_date DESC);

-- ── 8. fin_fund_transfers — 账户间转账（Phase 3）─────────────────────────
CREATE TABLE IF NOT EXISTS fin_fund_transfers (
  id                 BIGSERIAL    PRIMARY KEY,
  transfer_no        VARCHAR(60)  NOT NULL UNIQUE,

  -- 转出
  from_account_id    BIGINT       NOT NULL,
  from_account_code  VARCHAR(60)  NOT NULL,
  from_account_name  VARCHAR(200) NOT NULL,

  -- 转入
  to_account_id      BIGINT       NOT NULL,
  to_account_code    VARCHAR(60)  NOT NULL,
  to_account_name    VARCHAR(200) NOT NULL,

  -- 公司维度
  company_code       VARCHAR(64)  NOT NULL,
  company_name       VARCHAR(256),

  -- 金额三段式
  currency_code      VARCHAR(8)   NOT NULL,
  amount_original    NUMERIC(18,2) NOT NULL,
  exchange_rate      NUMERIC(18,8) NOT NULL DEFAULT 1,
  amount_base        NUMERIC(18,2) NOT NULL DEFAULT 0,
  base_currency      VARCHAR(8)   NOT NULL DEFAULT 'CNY',

  -- 状态
  status             VARCHAR(30)  NOT NULL DEFAULT 'DRAFT',

  -- 关联
  wf_instance_id     BIGINT,
  out_txn_id         BIGINT,
  in_txn_id          BIGINT,
  remark             TEXT,
  created_by         VARCHAR(80),
  updated_by         VARCHAR(80),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_fin_transfer_diff_accounts CHECK (from_account_id <> to_account_id)
);
CREATE INDEX IF NOT EXISTS idx_fin_fund_transfers_company
  ON fin_fund_transfers (company_code, status);

-- ── 9. fin_shareholder_contributions — 股东出资台账（Phase 4）────────────
CREATE TABLE IF NOT EXISTS fin_shareholder_contributions (
  id                       BIGSERIAL    PRIMARY KEY,
  contribution_no          VARCHAR(60)  NOT NULL UNIQUE,

  -- 股东
  shareholder_id           BIGINT,
  shareholder_code         VARCHAR(64),
  shareholder_name         VARCHAR(200) NOT NULL,

  -- 公司 / 项目
  company_code             VARCHAR(64)  NOT NULL,
  company_name             VARCHAR(256),
  project_code             VARCHAR(64),
  project_name             VARCHAR(256),

  -- 来源
  source_type              VARCHAR(30)  NOT NULL DEFAULT 'MANUAL',
  source_id                BIGINT,
  source_no                VARCHAR(80),

  -- 资金类型
  contribution_type        VARCHAR(40)  NOT NULL,
  fund_nature              VARCHAR(40),

  -- 金额三段式
  currency_code            VARCHAR(8)   NOT NULL,
  amount_original          NUMERIC(18,2) NOT NULL,
  exchange_rate            NUMERIC(18,8) NOT NULL DEFAULT 1,
  amount_base              NUMERIC(18,2) NOT NULL DEFAULT 0,
  base_currency            VARCHAR(8)   NOT NULL DEFAULT 'CNY',

  -- 偿还进度
  settled_amount_original  NUMERIC(18,2) NOT NULL DEFAULT 0,
  settled_amount_base      NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_amount_original  NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_amount_base      NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- 利息
  expected_return_date     DATE,
  interest_rate            NUMERIC(8,4),

  -- 状态
  status                   VARCHAR(30)  NOT NULL DEFAULT 'DRAFT',
  wf_instance_id           BIGINT,
  cash_account_id          BIGINT,
  remark                   TEXT,
  created_by               VARCHAR(80),
  updated_by               VARCHAR(80),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_sh_contrib_company
  ON fin_shareholder_contributions (company_code, status);

-- ── 10. fin_shareholder_settlements — 股东出资核销（Phase 4）────────────
CREATE TABLE IF NOT EXISTS fin_shareholder_settlements (
  id                 BIGSERIAL    PRIMARY KEY,
  settlement_no      VARCHAR(60)  NOT NULL UNIQUE,

  -- 关联出资
  contribution_id    BIGINT       NOT NULL,
  contribution_no    VARCHAR(60)  NOT NULL,

  -- 股东
  shareholder_id     BIGINT,
  shareholder_code   VARCHAR(64),
  shareholder_name   VARCHAR(200) NOT NULL,

  -- 公司 / 项目
  company_code       VARCHAR(64)  NOT NULL,
  company_name       VARCHAR(256),
  project_code       VARCHAR(64),
  project_name       VARCHAR(256),

  -- 还款类型
  settlement_type    VARCHAR(30)  NOT NULL,

  -- 金额三段式
  currency_code      VARCHAR(8)   NOT NULL,
  amount_original    NUMERIC(18,2) NOT NULL,
  exchange_rate      NUMERIC(18,8) NOT NULL DEFAULT 1,
  amount_base        NUMERIC(18,2) NOT NULL DEFAULT 0,
  base_currency      VARCHAR(8)   NOT NULL DEFAULT 'CNY',

  -- 现金账户
  cash_account_id    BIGINT,
  cash_account_code  VARCHAR(60),
  out_txn_id         BIGINT,

  -- 状态
  status             VARCHAR(30)  NOT NULL DEFAULT 'DRAFT',
  wf_instance_id     BIGINT,
  remark             TEXT,
  created_by         VARCHAR(80),
  updated_by         VARCHAR(80),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_sh_settle_contrib
  ON fin_shareholder_settlements (contribution_id, status);

-- ── 11. fin_expense_requests — 费用申请台账（Phase 5）────────────────────
CREATE TABLE IF NOT EXISTS fin_expense_requests (
  id                   BIGSERIAL    PRIMARY KEY,
  expense_no           VARCHAR(64)  NOT NULL UNIQUE,

  -- 申请人
  requester_id         BIGINT,
  requester_name       VARCHAR(128),

  -- 公司 / 项目
  company_code         VARCHAR(32)  NOT NULL,
  company_name         VARCHAR(128),
  project_code         VARCHAR(64),
  project_name         VARCHAR(128),

  -- 费用类型与金额
  expense_type         VARCHAR(32)  NOT NULL,
  currency_code        VARCHAR(8)   NOT NULL DEFAULT 'CNY',
  amount_original      NUMERIC(18,2) NOT NULL,
  exchange_rate        NUMERIC(18,8) NOT NULL DEFAULT 1,
  amount_base          NUMERIC(18,2) NOT NULL,
  base_currency        VARCHAR(8)   NOT NULL DEFAULT 'CNY',

  -- 费用详情
  expense_date         DATE,
  description          TEXT,
  attachment_urls      JSONB,

  -- Workflow
  form_submission_id   BIGINT,
  wf_instance_id       BIGINT,

  -- 状态
  status               VARCHAR(32)  NOT NULL DEFAULT 'DRAFT',
  remark               TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_expense_company_status
  ON fin_expense_requests (company_code, status);

-- ── 12. fin_reimbursements — 报销台账（Phase 5）──────────────────────────
CREATE TABLE IF NOT EXISTS fin_reimbursements (
  id                      BIGSERIAL    PRIMARY KEY,
  reimb_no                VARCHAR(64)  NOT NULL UNIQUE,

  -- 关联费用申请
  expense_request_id      BIGINT       NOT NULL,
  expense_no              VARCHAR(64)  NOT NULL,

  -- 员工 / 公司
  employee_id             BIGINT,
  employee_name           VARCHAR(128) NOT NULL,
  company_code            VARCHAR(32)  NOT NULL,
  company_name            VARCHAR(128),

  -- 金额三段式
  currency_code           VARCHAR(8)   NOT NULL DEFAULT 'CNY',
  reimb_amount_original   NUMERIC(18,2) NOT NULL,
  exchange_rate           NUMERIC(18,8) NOT NULL DEFAULT 1,
  reimb_amount_base       NUMERIC(18,2) NOT NULL,
  base_currency           VARCHAR(8)   NOT NULL DEFAULT 'CNY',

  -- 付款信息
  cash_account_id         BIGINT,
  cash_account_code       VARCHAR(64),
  payment_txn_id          BIGINT,

  -- 状态
  status                  VARCHAR(32)  NOT NULL DEFAULT 'PENDING',
  wf_instance_id          BIGINT,
  remark                  TEXT,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_reimb_expense
  ON fin_reimbursements (expense_request_id);
CREATE INDEX IF NOT EXISTS idx_fin_reimb_company_status
  ON fin_reimbursements (company_code, status);

-- ═══════════════════════════════════════════════════════════════════════════
-- 验证（执行后可手动确认）：
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name LIKE 'fin_%'
--   ORDER BY table_name;
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '✅ Finance V2 tables (22_finance_v2_tables.sql) applied — 12 tables, idempotent';
END$$;
