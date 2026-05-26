-- ============================================================
-- Finance V2 Phase 5 — Expense Runtime + Reimbursement Runtime
-- 日期：2026-05-26
-- ============================================================

-- ── fin_expense_requests ─────────────────────────────────────────────────────

DROP TABLE IF EXISTS fin_reimbursements CASCADE;
DROP TABLE IF EXISTS fin_expense_requests CASCADE;

CREATE TABLE fin_expense_requests (
  id                  bigserial          PRIMARY KEY,
  expense_no          varchar(64)        UNIQUE NOT NULL,

  requester_id        bigint,
  requester_name      varchar(128),

  company_code        varchar(32)        NOT NULL,
  company_name        varchar(128),

  project_code        varchar(64),
  project_name        varchar(128),

  expense_type        varchar(32)        NOT NULL,
  currency_code       varchar(8)         NOT NULL DEFAULT 'CNY',

  amount_original     numeric(18,2)      NOT NULL,
  exchange_rate       numeric(18,8)      NOT NULL DEFAULT 1,
  amount_base         numeric(18,2)      NOT NULL,
  base_currency       varchar(8)         NOT NULL DEFAULT 'CNY',

  expense_date        date,
  description         text,
  attachment_urls     jsonb,

  form_submission_id  bigint,
  wf_instance_id      bigint,

  status              varchar(32)        NOT NULL DEFAULT 'DRAFT',
  remark              text,

  created_at          timestamptz        NOT NULL DEFAULT now(),
  updated_at          timestamptz        NOT NULL DEFAULT now(),

  CONSTRAINT chk_expense_type CHECK (
    expense_type IN ('TRAVEL','MEAL','ENTERTAINMENT','OFFICE','MATERIAL','TRANSPORT','OTHER')
  ),
  CONSTRAINT chk_expense_status CHECK (
    status IN ('DRAFT','SUBMITTED','PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED','REIMBURSED')
  )
);

CREATE INDEX idx_fin_expense_company   ON fin_expense_requests(company_code);
CREATE INDEX idx_fin_expense_requester ON fin_expense_requests(requester_id);
CREATE INDEX idx_fin_expense_status    ON fin_expense_requests(status);
CREATE INDEX idx_fin_expense_wf        ON fin_expense_requests(wf_instance_id);

COMMENT ON TABLE  fin_expense_requests              IS 'Finance V2 Phase 5 — 费用申请台账';
COMMENT ON COLUMN fin_expense_requests.expense_type IS 'TRAVEL/MEAL/ENTERTAINMENT/OFFICE/MATERIAL/TRANSPORT/OTHER';
COMMENT ON COLUMN fin_expense_requests.status       IS 'DRAFT/SUBMITTED/PENDING_APPROVAL/APPROVED/REJECTED/CANCELLED/REIMBURSED';

-- ── fin_reimbursements ───────────────────────────────────────────────────────

CREATE TABLE fin_reimbursements (
  id                      bigserial      PRIMARY KEY,
  reimb_no                varchar(64)    UNIQUE NOT NULL,

  expense_request_id      bigint         NOT NULL REFERENCES fin_expense_requests(id),
  expense_no              varchar(64)    NOT NULL,

  employee_id             bigint,
  employee_name           varchar(128)   NOT NULL,

  company_code            varchar(32)    NOT NULL,
  company_name            varchar(128),

  currency_code           varchar(8)     NOT NULL DEFAULT 'CNY',
  reimb_amount_original   numeric(18,2)  NOT NULL,
  exchange_rate           numeric(18,8)  NOT NULL DEFAULT 1,
  reimb_amount_base       numeric(18,2)  NOT NULL,
  base_currency           varchar(8)     NOT NULL DEFAULT 'CNY',

  cash_account_id         bigint,
  cash_account_code       varchar(64),
  payment_txn_id          bigint,

  status                  varchar(32)    NOT NULL DEFAULT 'PENDING',
  wf_instance_id          bigint,
  remark                  text,

  created_at              timestamptz    NOT NULL DEFAULT now(),
  updated_at              timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT chk_reimb_status CHECK (
    status IN ('PENDING','PENDING_APPROVAL','APPROVED','PAID','CANCELLED')
  )
);

CREATE INDEX idx_fin_reimb_expense ON fin_reimbursements(expense_request_id);
CREATE INDEX idx_fin_reimb_company ON fin_reimbursements(company_code);
CREATE INDEX idx_fin_reimb_status  ON fin_reimbursements(status);

COMMENT ON TABLE  fin_reimbursements         IS 'Finance V2 Phase 5 — 报销台账（由 Expense 审批通过后自动生成）';
COMMENT ON COLUMN fin_reimbursements.status  IS 'PENDING/PENDING_APPROVAL/APPROVED/PAID/CANCELLED';

-- ── Workflow Form Definition — EXPENSE_REQUEST_FORM ──────────────────────────
-- Workflow Native 表单：费用申请表单定义（幂等插入）

INSERT INTO wf_form_definition
  (code, name, biz_type, module_code, category, status, remark, created_at, updated_at)
VALUES
  ('EXPENSE_REQUEST_FORM', '费用申请表单', 'EXPENSE_REQUEST', 'MENU_FIN2_EXPENSE', 'FINANCE', 'ACTIVE', 'Finance V2 Phase 5 Expense Runtime — Workflow Native 费用申请表单', NOW(), NOW())
ON CONFLICT (code) DO UPDATE
  SET name        = EXCLUDED.name,
      biz_type    = EXCLUDED.biz_type,
      module_code = EXCLUDED.module_code,
      status      = 'ACTIVE',
      updated_at  = NOW();

-- 插入表单版本（JSON Schema）
INSERT INTO wf_form_version
  (form_id, version_no, status, schema_json, ui_schema_json, validation_json, published_at, created_at, updated_at)
SELECT
  fd.id,
  1,
  'PUBLISHED',
  '{
    "type": "object",
    "properties": {
      "subject":      { "type": "string",  "title": "申请主题" },
      "expenseType":  { "type": "string",  "title": "费用类型", "enum": ["TRAVEL","MEAL","ENTERTAINMENT","OFFICE","MATERIAL","TRANSPORT","OTHER"] },
      "amount":       { "type": "number",  "title": "金额", "minimum": 0.01 },
      "currencyCode": { "type": "string",  "title": "币种", "enum": ["CNY","USD","EUR","HKD"] },
      "expenseDate":  { "type": "string",  "title": "费用日期", "format": "date" },
      "description":  { "type": "string",  "title": "费用说明" },
      "attachments":  { "type": "array",   "title": "附件", "items": { "type": "string" } }
    },
    "required": ["expenseType", "amount", "currencyCode"]
  }'::jsonb,
  '{
    "expenseType":  { "ui:widget": "select", "ui:placeholder": "请选择费用类型" },
    "amount":       { "ui:placeholder": "请输入金额" },
    "currencyCode": { "ui:widget": "select" },
    "expenseDate":  { "ui:widget": "date" },
    "description":  { "ui:widget": "textarea", "ui:rows": 3 },
    "attachments":  { "ui:widget": "file", "ui:multiple": true }
  }'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW(),
  NOW()
FROM wf_form_definition fd
WHERE fd.code = 'EXPENSE_REQUEST_FORM'
  AND NOT EXISTS (
    SELECT 1 FROM wf_form_version fv WHERE fv.form_id = fd.id AND fv.version_no = 1
  );

-- 回写 current_version_id
UPDATE wf_form_definition fd
   SET current_version_id = (
     SELECT id FROM wf_form_version fv
      WHERE fv.form_id = fd.id AND fv.status = 'PUBLISHED'
      ORDER BY fv.version_no DESC LIMIT 1
   )
WHERE fd.code = 'EXPENSE_REQUEST_FORM';

