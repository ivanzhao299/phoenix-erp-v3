-- Finance V2 Phase 4 — Shareholder Runtime
-- DROP 旧表重建（旧 Phase 0 骨架与 Phase 4 规范不符）

BEGIN;

-- 1. 重建 fin_shareholder_contributions
DROP TABLE IF EXISTS fin_shareholder_contributions CASCADE;
CREATE TABLE fin_shareholder_contributions (
  id                     bigserial PRIMARY KEY,
  contribution_no        varchar(60)  NOT NULL UNIQUE,

  shareholder_id         bigint       NULL,
  shareholder_code       varchar(64)  NULL,
  shareholder_name       varchar(200) NOT NULL,

  company_code           varchar(64)  NOT NULL,
  company_name           varchar(256) NULL,
  project_code           varchar(64)  NULL,
  project_name           varchar(256) NULL,

  source_type            varchar(30)  NOT NULL DEFAULT 'MANUAL',
  source_id              bigint       NULL,
  source_no              varchar(80)  NULL,

  contribution_type      varchar(40)  NOT NULL,
  fund_nature            varchar(40)  NULL,

  currency_code          varchar(8)   NOT NULL,
  amount_original        numeric(18,2) NOT NULL CHECK (amount_original > 0),
  exchange_rate          numeric(18,8) NOT NULL DEFAULT 1,
  amount_base            numeric(18,2) NOT NULL DEFAULT 0,
  base_currency          varchar(8)   NOT NULL DEFAULT 'CNY',

  settled_amount_original numeric(18,2) NOT NULL DEFAULT 0,
  settled_amount_base     numeric(18,2) NOT NULL DEFAULT 0,
  balance_amount_original numeric(18,2) NOT NULL DEFAULT 0,
  balance_amount_base     numeric(18,2) NOT NULL DEFAULT 0,

  expected_return_date   date         NULL,
  interest_rate          numeric(8,4) NULL,

  status                 varchar(30)  NOT NULL DEFAULT 'DRAFT',

  wf_instance_id         bigint       NULL,
  cash_account_id        bigint       NULL,

  remark                 text         NULL,
  created_by             varchar(80)  NULL,
  updated_by             varchar(80)  NULL,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT chk_contribution_type CHECK (contribution_type IN ('INVESTMENT','LOAN','ADVANCE','GUARANTEE','PAYMENT_ON_BEHALF')),
  CONSTRAINT chk_source_type       CHECK (source_type IN ('MANUAL','PAYMENT','OPENING','IMPORT')),
  CONSTRAINT chk_status            CHECK (status IN ('DRAFT','PENDING_CONFIRM','CONFIRMED','PARTIALLY_SETTLED','SETTLED','CANCELLED')),
  CONSTRAINT chk_settled_not_exceed CHECK (settled_amount_original <= amount_original),
  CONSTRAINT chk_balance_non_neg    CHECK (balance_amount_original >= 0)
);

CREATE UNIQUE INDEX uniq_fin_sh_contrib_source ON fin_shareholder_contributions (source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX idx_fin_sh_contrib_company  ON fin_shareholder_contributions (company_code);
CREATE INDEX idx_fin_sh_contrib_sh       ON fin_shareholder_contributions (shareholder_code);
CREATE INDEX idx_fin_sh_contrib_status   ON fin_shareholder_contributions (status);
CREATE INDEX idx_fin_sh_contrib_return   ON fin_shareholder_contributions (expected_return_date) WHERE expected_return_date IS NOT NULL;

-- 2. 重建 fin_shareholder_settlements
DROP TABLE IF EXISTS fin_shareholder_settlements CASCADE;
CREATE TABLE fin_shareholder_settlements (
  id                bigserial    PRIMARY KEY,
  settlement_no     varchar(60)  NOT NULL UNIQUE,

  contribution_id   bigint       NOT NULL REFERENCES fin_shareholder_contributions(id),
  contribution_no   varchar(60)  NOT NULL,

  shareholder_id    bigint       NULL,
  shareholder_code  varchar(64)  NULL,
  shareholder_name  varchar(200) NOT NULL,

  company_code      varchar(64)  NOT NULL,
  company_name      varchar(256) NULL,
  project_code      varchar(64)  NULL,
  project_name      varchar(256) NULL,

  settlement_type   varchar(30)  NOT NULL,

  currency_code     varchar(8)   NOT NULL,
  amount_original   numeric(18,2) NOT NULL CHECK (amount_original > 0),
  exchange_rate     numeric(18,8) NOT NULL DEFAULT 1,
  amount_base       numeric(18,2) NOT NULL DEFAULT 0,
  base_currency     varchar(8)   NOT NULL DEFAULT 'CNY',

  cash_account_id   bigint       NULL,
  cash_account_code varchar(60)  NULL,

  out_txn_id        bigint       NULL,

  status            varchar(30)  NOT NULL DEFAULT 'DRAFT',
  wf_instance_id    bigint       NULL,

  remark            text         NULL,
  created_by        varchar(80)  NULL,
  updated_by        varchar(80)  NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT chk_settlement_type CHECK (settlement_type IN ('RETURN','OFFSET','TRANSFER','WRITE_OFF')),
  CONSTRAINT chk_settlement_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SETTLED','CANCELLED')),
  CONSTRAINT chk_return_needs_cash CHECK (
    settlement_type != 'RETURN' OR cash_account_id IS NOT NULL
  )
);

CREATE INDEX idx_fin_sh_settle_contrib ON fin_shareholder_settlements (contribution_id);
CREATE INDEX idx_fin_sh_settle_company ON fin_shareholder_settlements (company_code);
CREATE INDEX idx_fin_sh_settle_status  ON fin_shareholder_settlements (status);

COMMIT;
