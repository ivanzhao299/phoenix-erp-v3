-- ============================================================
-- Finance V2 Phase 3 — Cash Runtime 资金账户中心
-- Created:  2026-05-26
-- Purpose:  建立正式 Cash Runtime：
--           fin_cash_accounts  — 资金账户台账
--           fin_cash_transactions — Append-only 资金流水
--           fin_fund_transfers — 账户间转账
--
-- 依赖：Phase 1（fin_ap_invoices）+ Phase 2（fin_ar_receipts）
-- 前提：无生产数据，可直接 DROP + 重建
-- ============================================================

-- 按依赖顺序先 DROP
DROP TABLE IF EXISTS fin_fund_transfers    CASCADE;
DROP TABLE IF EXISTS fin_cash_transactions CASCADE;
DROP TABLE IF EXISTS fin_cash_accounts     CASCADE;

-- ── fin_cash_accounts — 资金账户台账 ──────────────────────────────────────

CREATE TABLE fin_cash_accounts (
  id                  BIGSERIAL       PRIMARY KEY,

  account_code        VARCHAR(60)     NOT NULL UNIQUE,
  account_name        VARCHAR(200)    NOT NULL,

  -- 公司维度
  company_code        VARCHAR(64)     NOT NULL,
  company_name        VARCHAR(256)    NULL,

  -- 货币
  currency_code       VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  -- 账户类型
  -- BANK / CASH / VIRTUAL / SHAREHOLDER / INTERNAL
  account_type        VARCHAR(30)     NOT NULL DEFAULT 'BANK',

  -- 余额
  opening_balance     NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  current_balance     NUMERIC(18, 2)  NOT NULL DEFAULT 0,

  -- 银行信息
  bank_name           VARCHAR(100)    NULL,
  bank_account_no     VARCHAR(60)     NULL,

  -- 状态：ACTIVE / FROZEN / CLOSED
  status              VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE',

  remark              TEXT            NULL,
  created_by          VARCHAR(80)     NULL,
  updated_by          VARCHAR(80)     NULL,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_cash_acc_type
    CHECK (account_type IN ('BANK','CASH','VIRTUAL','SHAREHOLDER','INTERNAL')),
  CONSTRAINT chk_fin_cash_acc_status
    CHECK (status IN ('ACTIVE','FROZEN','CLOSED'))
);

CREATE INDEX idx_fin_cash_acc_company    ON fin_cash_accounts (company_code);
CREATE INDEX idx_fin_cash_acc_status     ON fin_cash_accounts (status);
CREATE INDEX idx_fin_cash_acc_type       ON fin_cash_accounts (account_type);

COMMENT ON TABLE  fin_cash_accounts                IS 'Finance V2 Phase 3 — 资金账户台账';
COMMENT ON COLUMN fin_cash_accounts.account_type   IS 'BANK/CASH/VIRTUAL/SHAREHOLDER/INTERNAL';
COMMENT ON COLUMN fin_cash_accounts.current_balance IS '实时余额快照，由 fin_cash_transactions 驱动';

-- ── fin_cash_transactions — 资金流水（Append-only）────────────────────────

CREATE TABLE fin_cash_transactions (
  id                  BIGSERIAL       PRIMARY KEY,

  txn_no              VARCHAR(60)     NOT NULL UNIQUE,

  -- 账户
  account_id          BIGINT          NOT NULL REFERENCES fin_cash_accounts(id),
  account_code        VARCHAR(60)     NOT NULL,
  account_name        VARCHAR(200)    NOT NULL,

  -- 公司维度
  company_code        VARCHAR(64)     NOT NULL,
  company_name        VARCHAR(256)    NULL,

  -- 方向：IN / OUT
  direction           VARCHAR(8)      NOT NULL,

  -- 来源追踪
  -- AP_PAYMENT / AR_RECEIPT / TRANSFER / SHAREHOLDER / MANUAL / OPENING
  source_type         VARCHAR(30)     NULL,
  source_id           BIGINT          NULL,
  source_no           VARCHAR(80)     NULL,

  -- 金额（只存原币 + 汇后本位币）
  currency_code       VARCHAR(8)      NOT NULL,
  amount              NUMERIC(18, 2)  NOT NULL,   -- 恒为正数
  balance_after       NUMERIC(18, 2)  NOT NULL,   -- 本条流水后账户余额快照

  txn_date            TIMESTAMPTZ     NOT NULL DEFAULT now(),

  remark              TEXT            NULL,
  created_by          VARCHAR(80)     NULL,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_cash_txn_direction
    CHECK (direction IN ('IN','OUT')),
  CONSTRAINT chk_fin_cash_txn_amount_pos
    CHECK (amount > 0),
  CONSTRAINT chk_fin_cash_txn_source_type
    CHECK (source_type IS NULL OR source_type IN
           ('AP_PAYMENT','AR_RECEIPT','TRANSFER','SHAREHOLDER','MANUAL','OPENING'))
);

CREATE INDEX idx_fin_cash_txn_account    ON fin_cash_transactions (account_id);
CREATE INDEX idx_fin_cash_txn_date       ON fin_cash_transactions (txn_date DESC);
CREATE INDEX idx_fin_cash_txn_company    ON fin_cash_transactions (company_code);
CREATE INDEX idx_fin_cash_txn_source     ON fin_cash_transactions (source_type, source_id)
  WHERE source_id IS NOT NULL;

COMMENT ON TABLE  fin_cash_transactions          IS 'Finance V2 Phase 3 — Append-only 资金流水';
COMMENT ON COLUMN fin_cash_transactions.direction IS 'IN=资金流入 OUT=资金流出';
COMMENT ON COLUMN fin_cash_transactions.amount    IS '恒为正数，方向由 direction 决定';
COMMENT ON COLUMN fin_cash_transactions.balance_after IS '本条流水后账户余额快照（不可修改）';

-- ── fin_fund_transfers — 账户间转账 ───────────────────────────────────────

CREATE TABLE fin_fund_transfers (
  id                  BIGSERIAL       PRIMARY KEY,

  transfer_no         VARCHAR(60)     NOT NULL UNIQUE,

  -- 转出账户
  from_account_id     BIGINT          NOT NULL REFERENCES fin_cash_accounts(id),
  from_account_code   VARCHAR(60)     NOT NULL,
  from_account_name   VARCHAR(200)    NOT NULL,

  -- 转入账户
  to_account_id       BIGINT          NOT NULL REFERENCES fin_cash_accounts(id),
  to_account_code     VARCHAR(60)     NOT NULL,
  to_account_name     VARCHAR(200)    NOT NULL,

  -- 公司维度
  company_code        VARCHAR(64)     NOT NULL,
  company_name        VARCHAR(256)    NULL,

  -- 金额
  currency_code       VARCHAR(8)      NOT NULL,
  amount_original     NUMERIC(18, 2)  NOT NULL,
  exchange_rate       NUMERIC(18, 8)  NOT NULL DEFAULT 1,
  amount_base         NUMERIC(18, 2)  NOT NULL DEFAULT 0,
  base_currency       VARCHAR(8)      NOT NULL DEFAULT 'CNY',

  -- 状态机
  -- DRAFT → PENDING_APPROVAL → APPROVED → EXECUTED
  --       → CANCELLED（仅 DRAFT/PENDING_APPROVAL 可取消）
  status              VARCHAR(30)     NOT NULL DEFAULT 'DRAFT',

  -- 审批关联
  wf_instance_id      BIGINT          NULL,

  -- 执行后生成的两条流水 ID
  out_txn_id          BIGINT          NULL,
  in_txn_id           BIGINT          NULL,

  remark              TEXT            NULL,
  created_by          VARCHAR(80)     NULL,
  updated_by          VARCHAR(80)     NULL,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT chk_fin_fund_transfer_status
    CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','EXECUTED','CANCELLED')),
  CONSTRAINT chk_fin_fund_transfer_amount_pos
    CHECK (amount_original > 0),
  CONSTRAINT chk_fin_fund_transfer_diff_accounts
    CHECK (from_account_id <> to_account_id)
);

CREATE INDEX idx_fin_fund_transfer_company ON fin_fund_transfers (company_code);
CREATE INDEX idx_fin_fund_transfer_status  ON fin_fund_transfers (status);
CREATE INDEX idx_fin_fund_transfer_from    ON fin_fund_transfers (from_account_id);
CREATE INDEX idx_fin_fund_transfer_to      ON fin_fund_transfers (to_account_id);

COMMENT ON TABLE  fin_fund_transfers          IS 'Finance V2 Phase 3 — 账户间资金转账';
COMMENT ON COLUMN fin_fund_transfers.status   IS 'DRAFT/PENDING_APPROVAL/APPROVED/EXECUTED/CANCELLED';

DO $$
BEGIN
  RAISE NOTICE '✅ Finance V2 Phase 3 Cash Runtime — 表创建完成';
  RAISE NOTICE '   fin_cash_accounts       (资金账户台账)';
  RAISE NOTICE '   fin_cash_transactions   (Append-only 资金流水)';
  RAISE NOTICE '   fin_fund_transfers      (账户间转账)';
END $$;
