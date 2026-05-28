-- ═══════════════════════════════════════════════════════════════
-- Phoenix ERP V3 — DDL 23: Procurement V2 Runtime 建表
-- 幂等：所有 CREATE TABLE / INDEX 均使用 IF NOT EXISTS
-- 可重复执行，不会破坏已有数据或结构
-- 覆盖表（16 张）：
--   prc2_suppliers, prc2_projects,
--   prc2_purchase_requests, prc2_request_items,
--   prc2_purchase_orders,  prc2_order_items,
--   prc2_payments,         prc2_payment_allocations,
--   prc2_shareholder_funds,
--   prc2_ap_ledger,
--   prc2_shipments,
--   prc2_receipts,         prc2_receipt_items,
--   prc2_approvals,
--   prc2_init_batches,     prc2_init_batch_rows
-- ═══════════════════════════════════════════════════════════════

-- ── 1. 供应商主档 prc2_suppliers ─────────────────────────────────
CREATE TABLE IF NOT EXISTS prc2_suppliers (
  id                    BIGSERIAL     PRIMARY KEY,
  supplier_code         VARCHAR(64)   NOT NULL UNIQUE,
  supplier_name         VARCHAR(256)  NOT NULL,
  supplier_name_en      VARCHAR(256),
  country_code          VARCHAR(8),
  supplier_type         VARCHAR(32),
  default_currency      VARCHAR(8),
  contact_name          VARCHAR(64),
  contact_phone         VARCHAR(32),
  contact_email         VARCHAR(128),
  bank_name             VARCHAR(128),
  bank_account_name     VARCHAR(128),
  bank_account_no       VARCHAR(64),
  bank_swift            VARCHAR(32),
  tax_no                VARCHAR(64),
  address               TEXT,
  credit_days           INT           DEFAULT 30,
  payment_terms         TEXT,
  status                VARCHAR(32)   NOT NULL DEFAULT 'ACTIVE',
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  -- 共享范围：GROUP=集团共享 / COMPANY=单公司专用 / PROJECT=项目专用
  shared_scope          VARCHAR(32)   NOT NULL DEFAULT 'GROUP',
  owner_company_id      BIGINT,
  owner_company_code    VARCHAR(64),
  owner_company_name    VARCHAR(256),
  owner_project_id      BIGINT,
  owner_project_code    VARCHAR(64),
  owner_project_name    VARCHAR(256),
  remark                TEXT,
  created_by            BIGINT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_sup_status       ON prc2_suppliers (status);
CREATE INDEX IF NOT EXISTS idx_prc2_sup_scope         ON prc2_suppliers (shared_scope);
CREATE INDEX IF NOT EXISTS idx_prc2_sup_company       ON prc2_suppliers (owner_company_code) WHERE owner_company_code IS NOT NULL;

-- ── 2. 采购项目 prc2_projects ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS prc2_projects (
  id                      BIGSERIAL     PRIMARY KEY,
  company_id              BIGINT,
  company_code            VARCHAR(64),
  company_name            VARCHAR(256),
  project_code            VARCHAR(64)   NOT NULL,
  project_name            VARCHAR(256)  NOT NULL,
  project_type            VARCHAR(32),
  status                  VARCHAR(32)   NOT NULL DEFAULT 'ACTIVE',
  start_date              DATE,
  end_date                DATE,
  remark                  TEXT,
  project_manager_user_id BIGINT,
  project_manager_name    VARCHAR(128),
  created_by              BIGINT,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prc2_projects_company_project UNIQUE (company_code, project_code)
);

CREATE INDEX IF NOT EXISTS idx_prc2_proj_status       ON prc2_projects (status);
CREATE INDEX IF NOT EXISTS idx_prc2_proj_company       ON prc2_projects (company_code) WHERE company_code IS NOT NULL;

-- ── 3. 采购申请头表 prc2_purchase_requests ───────────────────────
CREATE TABLE IF NOT EXISTS prc2_purchase_requests (
  id               BIGSERIAL     PRIMARY KEY,
  req_no           VARCHAR(80)   NOT NULL UNIQUE,
  subject          VARCHAR(256)  NOT NULL,
  -- 多公司维度
  company_id       BIGINT,
  company_code     VARCHAR(64),
  company_name     VARCHAR(256),
  -- 多项目维度
  project_id       BIGINT,
  project_code     VARCHAR(64),
  project_name     VARCHAR(256),
  purchase_type    VARCHAR(32),
  urgency          VARCHAR(20)   NOT NULL DEFAULT 'NORMAL',
  currency_code    VARCHAR(8)    NOT NULL DEFAULT 'LAK',
  estimated_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  requester_id     BIGINT,
  requester_name   VARCHAR(128),
  dept_code        VARCHAR(64),
  expected_date    DATE,
  reason           TEXT,
  status           VARCHAR(32)   NOT NULL DEFAULT 'DRAFT',
  converted_po_id  BIGINT,
  converted_po_no  VARCHAR(80),
  attachment_url   TEXT,
  remark           TEXT,
  created_by       BIGINT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_req_status        ON prc2_purchase_requests (status);
CREATE INDEX IF NOT EXISTS idx_prc2_req_company        ON prc2_purchase_requests (company_code) WHERE company_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_req_project        ON prc2_purchase_requests (project_code) WHERE project_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_req_requester      ON prc2_purchase_requests (requester_id) WHERE requester_id IS NOT NULL;

-- ── 4. 采购申请明细 prc2_request_items ──────────────────────────
CREATE TABLE IF NOT EXISTS prc2_request_items (
  id                   BIGSERIAL     PRIMARY KEY,
  request_id           BIGINT        NOT NULL,
  -- 行级多项目维度（允许每行归属不同项目）
  project_id           BIGINT,
  project_code         VARCHAR(64),
  project_name         VARCHAR(256),
  item_code            VARCHAR(64),
  item_name            VARCHAR(256)  NOT NULL,
  spec                 TEXT,
  qty                  NUMERIC(18,4) NOT NULL DEFAULT 0,
  unit                 VARCHAR(20),
  estimated_unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  estimated_amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
  warehouse_code       VARCHAR(64),
  usage_desc           TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_reqitem_request   ON prc2_request_items (request_id);
CREATE INDEX IF NOT EXISTS idx_prc2_reqitem_project    ON prc2_request_items (project_code) WHERE project_code IS NOT NULL;

-- ── 5. 采购订单头表 prc2_purchase_orders ────────────────────────
CREATE TABLE IF NOT EXISTS prc2_purchase_orders (
  id                BIGSERIAL     PRIMARY KEY,
  po_no             VARCHAR(80)   NOT NULL UNIQUE,
  source_request_id BIGINT,
  source_req_no     VARCHAR(80),
  contract_no       VARCHAR(128)  UNIQUE,
  subject           VARCHAR(256)  NOT NULL,
  -- 多公司维度
  company_id        BIGINT,
  company_code      VARCHAR(64),
  company_name      VARCHAR(256),
  -- 多项目维度
  project_id        BIGINT,
  project_code      VARCHAR(64),
  project_name      VARCHAR(256),
  -- 供应商快照
  supplier_id       BIGINT,
  supplier_code     VARCHAR(64),
  supplier_name     VARCHAR(256),
  purchase_type     VARCHAR(32),
  cross_border_flag BOOLEAN       NOT NULL DEFAULT FALSE,
  origin_country    VARCHAR(8),
  destination_country VARCHAR(8),
  currency_code     VARCHAR(8)    NOT NULL DEFAULT 'LAK',
  total_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  plan_qty          NUMERIC(18,4) NOT NULL DEFAULT 0,
  received_qty      NUMERIC(18,4) NOT NULL DEFAULT 0,
  paid_amount       NUMERIC(18,2) NOT NULL DEFAULT 0,
  expected_date     DATE,
  pay_deadline      DATE,
  pay_terms         TEXT,
  status            VARCHAR(32)   NOT NULL DEFAULT 'DRAFT',
  approval_status   VARCHAR(32)   NOT NULL DEFAULT 'NONE',
  approver_id       BIGINT,
  approver_name     VARCHAR(128),
  approved_by       BIGINT,
  approved_at       TIMESTAMPTZ,
  contract_url      TEXT,
  contract_note     TEXT,
  remark            TEXT,
  created_by        BIGINT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_po_status          ON prc2_purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_prc2_po_company          ON prc2_purchase_orders (company_code) WHERE company_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_po_project          ON prc2_purchase_orders (project_code) WHERE project_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_po_supplier         ON prc2_purchase_orders (supplier_code) WHERE supplier_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_po_approval_status  ON prc2_purchase_orders (approval_status);
CREATE INDEX IF NOT EXISTS idx_prc2_po_source_req       ON prc2_purchase_orders (source_request_id) WHERE source_request_id IS NOT NULL;

-- ── 6. 采购订单明细 prc2_order_items ────────────────────────────
CREATE TABLE IF NOT EXISTS prc2_order_items (
  id           BIGSERIAL     PRIMARY KEY,
  po_id        BIGINT        NOT NULL,
  po_no        VARCHAR(80)   NOT NULL,
  -- 行级多项目维度（支持一张PO跨项目采购）
  project_id   BIGINT,
  project_code VARCHAR(64),
  project_name VARCHAR(256),
  item_code    VARCHAR(64),
  item_name    VARCHAR(256)  NOT NULL,
  spec         TEXT,
  qty          NUMERIC(18,4) NOT NULL DEFAULT 0,
  received_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
  unit         VARCHAR(20),
  unit_price   NUMERIC(18,4) NOT NULL DEFAULT 0,
  amount       NUMERIC(18,2) NOT NULL DEFAULT 0,
  warehouse_code VARCHAR(64),
  usage_desc   TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_poi_po_id          ON prc2_order_items (po_id);
CREATE INDEX IF NOT EXISTS idx_prc2_poi_project         ON prc2_order_items (project_code) WHERE project_code IS NOT NULL;

-- ── 7. 付款记录 prc2_payments ────────────────────────────────────
CREATE TABLE IF NOT EXISTS prc2_payments (
  id                    BIGSERIAL     PRIMARY KEY,
  pay_no                VARCHAR(80)   NOT NULL UNIQUE,
  payment_date          DATE,
  -- 款项归属公司
  company_id            BIGINT,
  company_code          VARCHAR(64),
  company_name          VARCHAR(256),
  -- 款项归属项目
  project_id            BIGINT,
  project_code          VARCHAR(64),
  project_name          VARCHAR(256),
  -- 实际付款人
  payer_type            VARCHAR(32)   NOT NULL,
  payer_id              BIGINT,
  payer_name            VARCHAR(128)  NOT NULL,
  payer_account         VARCHAR(128),
  -- 收款人
  payee_type            VARCHAR(32),
  payee_id              BIGINT,
  payee_name            VARCHAR(256),
  payee_account         VARCHAR(128),
  -- 金额
  currency_code         VARCHAR(8)    NOT NULL,
  amount_original       NUMERIC(18,2) NOT NULL DEFAULT 0,
  exchange_rate         NUMERIC(18,8) NOT NULL DEFAULT 1,
  amount_base           NUMERIC(18,2) NOT NULL DEFAULT 0,
  base_currency         VARCHAR(8)    NOT NULL DEFAULT 'CNY',
  payment_method        VARCHAR(32),
  fund_nature           VARCHAR(32),
  -- 股东代付信息
  is_shareholder_payment BOOLEAN      NOT NULL DEFAULT FALSE,
  shareholder_id        BIGINT,
  shareholder_name      VARCHAR(128),
  status                VARCHAR(32)   NOT NULL DEFAULT 'DRAFT',
  voucher_url           TEXT,
  remark                TEXT,
  created_by            BIGINT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_pay_status          ON prc2_payments (status);
CREATE INDEX IF NOT EXISTS idx_prc2_pay_company          ON prc2_payments (company_code) WHERE company_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_pay_project          ON prc2_payments (project_code) WHERE project_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_pay_shareholder      ON prc2_payments (shareholder_id) WHERE shareholder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_pay_date             ON prc2_payments (payment_date) WHERE payment_date IS NOT NULL;

-- ── 8. 付款分摊 prc2_payment_allocations ────────────────────────
CREATE TABLE IF NOT EXISTS prc2_payment_allocations (
  id                       BIGSERIAL     PRIMARY KEY,
  payment_id               BIGINT        NOT NULL,
  po_id                    BIGINT,
  po_no                    VARCHAR(80),
  ap_id                    BIGINT,
  ap_no                    VARCHAR(80),
  -- 多公司维度
  company_id               BIGINT,
  company_code             VARCHAR(64),
  company_name             VARCHAR(256),
  -- 多项目维度（行级快照，支持跨项目分摊）
  project_id               BIGINT,
  project_code             VARCHAR(64),
  project_name             VARCHAR(256),
  allocated_amount_original NUMERIC(18,2) NOT NULL DEFAULT 0,
  allocated_amount_base    NUMERIC(18,2) NOT NULL DEFAULT 0,
  remark                   TEXT,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_palloc_payment     ON prc2_payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_prc2_palloc_po           ON prc2_payment_allocations (po_id) WHERE po_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_palloc_ap           ON prc2_payment_allocations (ap_id) WHERE ap_id IS NOT NULL;

-- ── 9. 股东资金池 prc2_shareholder_funds ────────────────────────
CREATE TABLE IF NOT EXISTS prc2_shareholder_funds (
  id                 BIGSERIAL     PRIMARY KEY,
  fund_no            VARCHAR(80)   NOT NULL UNIQUE,
  shareholder_id     BIGINT,
  shareholder_name   VARCHAR(128)  NOT NULL,
  -- 多公司维度
  company_id         BIGINT,
  company_code       VARCHAR(64),
  company_name       VARCHAR(256),
  -- 多项目维度
  project_id         BIGINT,
  project_code       VARCHAR(64),
  project_name       VARCHAR(256),
  source_type        VARCHAR(32),
  fund_nature        VARCHAR(32),
  currency_code      VARCHAR(8),
  amount_original    NUMERIC(18,2) NOT NULL DEFAULT 0,
  exchange_rate      NUMERIC(18,8) NOT NULL DEFAULT 1,
  amount_base        NUMERIC(18,2) NOT NULL DEFAULT 0,
  base_currency      VARCHAR(8)    NOT NULL DEFAULT 'CNY',
  related_payment_id BIGINT,
  related_po_id      BIGINT,
  related_po_no      VARCHAR(80),
  occurred_date      DATE,
  status             VARCHAR(32)   NOT NULL DEFAULT 'CONFIRMED',
  remark             TEXT,
  created_by         BIGINT,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_sfund_shareholder  ON prc2_shareholder_funds (shareholder_id) WHERE shareholder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_sfund_company       ON prc2_shareholder_funds (company_code) WHERE company_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_sfund_project       ON prc2_shareholder_funds (project_code) WHERE project_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_sfund_status        ON prc2_shareholder_funds (status);

-- ── 10. 应付账款台账 prc2_ap_ledger ─────────────────────────────
CREATE TABLE IF NOT EXISTS prc2_ap_ledger (
  id                     BIGSERIAL     PRIMARY KEY,
  ap_no                  VARCHAR(80)   NOT NULL UNIQUE,
  po_id                  BIGINT        UNIQUE,
  po_no                  VARCHAR(80),
  -- 多公司维度
  company_id             BIGINT,
  company_code           VARCHAR(64),
  company_name           VARCHAR(256),
  -- 多项目维度
  project_id             BIGINT,
  project_code           VARCHAR(64),
  project_name           VARCHAR(256),
  -- 供应商快照
  supplier_id            BIGINT,
  supplier_code          VARCHAR(64),
  supplier_name          VARCHAR(256),
  currency_code          VARCHAR(8),
  amount_original        NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid_amount_original   NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_amount_original NUMERIC(18,2) NOT NULL DEFAULT 0,
  exchange_rate          NUMERIC(18,8) NOT NULL DEFAULT 1,
  amount_base            NUMERIC(18,2) NOT NULL DEFAULT 0,
  status                 VARCHAR(32)   NOT NULL DEFAULT 'OPEN',
  due_date               DATE,
  remark                 TEXT,
  created_by             BIGINT,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_ap_status          ON prc2_ap_ledger (status);
CREATE INDEX IF NOT EXISTS idx_prc2_ap_supplier         ON prc2_ap_ledger (supplier_code) WHERE supplier_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_ap_company          ON prc2_ap_ledger (company_code) WHERE company_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_ap_due_date         ON prc2_ap_ledger (due_date) WHERE due_date IS NOT NULL;

-- ── 11. 物流/运单 prc2_shipments ─────────────────────────────────
CREATE TABLE IF NOT EXISTS prc2_shipments (
  id                   BIGSERIAL     PRIMARY KEY,
  shipment_no          VARCHAR(80)   NOT NULL UNIQUE,
  po_id                BIGINT,
  po_no                VARCHAR(80),
  -- 多公司维度
  company_id           BIGINT,
  company_code         VARCHAR(64),
  company_name         VARCHAR(256),
  -- 多项目维度
  project_id           BIGINT,
  project_code         VARCHAR(64),
  project_name         VARCHAR(256),
  shipment_type        VARCHAR(32),
  carrier_name         VARCHAR(128),
  tracking_no          VARCHAR(128),
  origin_country       VARCHAR(8),
  origin_address       TEXT,
  destination_country  VARCHAR(8),
  destination_address  TEXT,
  customs_required     BOOLEAN       NOT NULL DEFAULT FALSE,
  customs_status       VARCHAR(32),
  customs_decl_no      VARCHAR(128),
  departure_date       DATE,
  arrival_date         DATE,
  freight_amount       NUMERIC(18,2),
  freight_currency     VARCHAR(8),
  customs_duty         NUMERIC(18,2),
  customs_currency     VARCHAR(8),
  status               VARCHAR(32)   NOT NULL DEFAULT 'DRAFT',
  remark               TEXT,
  created_by           BIGINT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_ship_status        ON prc2_shipments (status);
CREATE INDEX IF NOT EXISTS idx_prc2_ship_po_id          ON prc2_shipments (po_id) WHERE po_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prc2_ship_tracking       ON prc2_shipments (tracking_no) WHERE tracking_no IS NOT NULL;

-- ── 12. 收货记录头表 prc2_receipts ──────────────────────────────
CREATE TABLE IF NOT EXISTS prc2_receipts (
  id             BIGSERIAL     PRIMARY KEY,
  receipt_no     VARCHAR(80)   NOT NULL UNIQUE,
  po_id          BIGINT        NOT NULL,
  po_no          VARCHAR(80)   NOT NULL,
  shipment_id    BIGINT,
  shipment_no    VARCHAR(80),
  -- 多公司维度
  company_id     BIGINT,
  company_code   VARCHAR(64),
  company_name   VARCHAR(256),
  -- 多项目维度
  project_id     BIGINT,
  project_code   VARCHAR(64),
  project_name   VARCHAR(256),
  warehouse_code VARCHAR(64),
  receiver_id    BIGINT,
  receiver_name  VARCHAR(128),
  receipt_date   DATE,
  status         VARCHAR(32)   NOT NULL DEFAULT 'DRAFT',
  confirmed_by   BIGINT,
  confirmed_at   TIMESTAMPTZ,
  posted_by      BIGINT,
  posted_at      TIMESTAMPTZ,
  remark         TEXT,
  created_by     BIGINT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_rcpt_status        ON prc2_receipts (status);
CREATE INDEX IF NOT EXISTS idx_prc2_rcpt_po_id          ON prc2_receipts (po_id);
CREATE INDEX IF NOT EXISTS idx_prc2_rcpt_company        ON prc2_receipts (company_code) WHERE company_code IS NOT NULL;

-- ── 13. 收货明细 prc2_receipt_items ─────────────────────────────
CREATE TABLE IF NOT EXISTS prc2_receipt_items (
  id             BIGSERIAL     PRIMARY KEY,
  receipt_id     BIGINT        NOT NULL,
  po_item_id     BIGINT,
  -- 行级多项目维度（支持一批货分配到多个工厂/项目）
  project_id     BIGINT,
  project_code   VARCHAR(64),
  project_name   VARCHAR(256),
  item_code      VARCHAR(64),
  item_name      VARCHAR(256)  NOT NULL,
  spec           TEXT,
  expected_qty   NUMERIC(18,4) NOT NULL DEFAULT 0,
  actual_qty     NUMERIC(18,4) NOT NULL DEFAULT 0,
  rejected_qty   NUMERIC(18,4) NOT NULL DEFAULT 0,
  unit           VARCHAR(20),
  quality_status VARCHAR(32),
  remark         TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_rcpti_receipt_id  ON prc2_receipt_items (receipt_id);
CREATE INDEX IF NOT EXISTS idx_prc2_rcpti_project      ON prc2_receipt_items (project_code) WHERE project_code IS NOT NULL;

-- ── 14. 审批日志 prc2_approvals ──────────────────────────────────
CREATE TABLE IF NOT EXISTS prc2_approvals (
  id            BIGSERIAL     PRIMARY KEY,
  biz_type      VARCHAR(32)   NOT NULL,
  biz_id        BIGINT        NOT NULL,
  biz_no        VARCHAR(80),
  approval_node VARCHAR(64),
  approver_id   BIGINT,
  approver_name VARCHAR(128),
  action        VARCHAR(32),
  comment       TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_appr_biz           ON prc2_approvals (biz_type, biz_id);
CREATE INDEX IF NOT EXISTS idx_prc2_appr_approver       ON prc2_approvals (approver_id) WHERE approver_id IS NOT NULL;

-- ── 15. 历史数据初始化批次 prc2_init_batches ──────────────────────
CREATE TABLE IF NOT EXISTS prc2_init_batches (
  id              BIGSERIAL    PRIMARY KEY,
  batch_no        VARCHAR(80)  NOT NULL UNIQUE,
  batch_type      VARCHAR(64)  NOT NULL,
  file_name       VARCHAR(256),
  file_url        TEXT,
  status          VARCHAR(32)  NOT NULL DEFAULT 'DRAFT',
  total_rows      INT          NOT NULL DEFAULT 0,
  success_rows    INT          NOT NULL DEFAULT 0,
  failed_rows     INT          NOT NULL DEFAULT 0,
  created_by      BIGINT,
  created_by_name VARCHAR(64),
  remark          TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_ibatch_status      ON prc2_init_batches (status);

-- ── 16. 历史数据初始化明细行 prc2_init_batch_rows ─────────────────
CREATE TABLE IF NOT EXISTS prc2_init_batch_rows (
  id                  BIGSERIAL    PRIMARY KEY,
  batch_id            BIGINT       NOT NULL,
  row_no              INT          NOT NULL,
  raw_data            JSONB,
  status              VARCHAR(32)  NOT NULL DEFAULT 'PENDING',
  error_message       TEXT,
  related_po_id       BIGINT,
  related_po_no       VARCHAR(80),
  related_payment_id  BIGINT,
  related_pay_no      VARCHAR(80),
  related_fund_id     BIGINT,
  related_fund_no     VARCHAR(80),
  related_receipt_id  BIGINT,
  related_receipt_no  VARCHAR(80),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc2_ibrow_batch_id     ON prc2_init_batch_rows (batch_id);
CREATE INDEX IF NOT EXISTS idx_prc2_ibrow_status        ON prc2_init_batch_rows (status);

-- ── 确认 ──────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ DDL 23 Procurement V2 tables applied (16 tables, idempotent)';
END$$;
