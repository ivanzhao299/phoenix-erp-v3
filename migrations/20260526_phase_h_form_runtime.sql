-- =============================================================================
-- Phoenix ERP V3 — Workflow 2.0 Phase H: Form Runtime Schema
-- Version: 20260526_phase_h
-- Description:
--   1. wf_form_definition  补充 biz_type / module_code / remark
--   2. wf_form_version     补充 ui_schema_json / validation_json / updated_at
--   3. wf_definition       补充 form_code
--   4. 新表 wf_form_submission（提交快照）
--   5. Seed: SIMPLE_PAYMENT_REQUEST / SIMPLE_LEAVE_REQUEST 示例表单
-- Run: psql $DATABASE_URL -f migrations/20260526_phase_h_form_runtime.sql
-- =============================================================================

-- ── 1. wf_form_definition 补充字段 ────────────────────────────────────────────
ALTER TABLE wf_form_definition
  ADD COLUMN IF NOT EXISTS biz_type    VARCHAR(80),
  ADD COLUMN IF NOT EXISTS module_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS remark      TEXT;

-- ── 2. wf_form_version 补充字段 ───────────────────────────────────────────────
ALTER TABLE wf_form_version
  ADD COLUMN IF NOT EXISTS ui_schema_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

-- ── 3. wf_definition 补充 form_code ──────────────────────────────────────────
ALTER TABLE wf_definition
  ADD COLUMN IF NOT EXISTS form_code VARCHAR(80);

-- ── 4. wf_form_submission（表单提交快照）─────────────────────────────────────
CREATE TABLE IF NOT EXISTS wf_form_submission (
  id                   BIGSERIAL    PRIMARY KEY,
  submission_no        VARCHAR(64)  UNIQUE NOT NULL,
  form_code            VARCHAR(80)  NOT NULL,
  form_version_id      INT          NOT NULL REFERENCES wf_form_version(id),
  workflow_instance_id INT          NULL,
  biz_type             VARCHAR(80),
  biz_id               VARCHAR(80),
  biz_no               VARCHAR(80),
  submitted_by         INT,
  submitted_by_name    VARCHAR(200),
  company_code         VARCHAR(80),
  company_name         VARCHAR(200),
  project_code         VARCHAR(80),
  project_name         VARCHAR(200),
  data_json            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  status               VARCHAR(20)  NOT NULL DEFAULT 'SUBMITTED',
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- status: DRAFT | SUBMITTED | APPROVED | REJECTED | CANCELLED

CREATE INDEX IF NOT EXISTS idx_wf_form_submission_form_code
  ON wf_form_submission(form_code);
CREATE INDEX IF NOT EXISTS idx_wf_form_submission_submitted_by
  ON wf_form_submission(submitted_by);
CREATE INDEX IF NOT EXISTS idx_wf_form_submission_status
  ON wf_form_submission(status);
CREATE INDEX IF NOT EXISTS idx_wf_form_submission_created_at
  ON wf_form_submission(created_at DESC);

-- ── 5. Seed: SIMPLE_PAYMENT_REQUEST ──────────────────────────────────────────
INSERT INTO wf_form_definition
  (code, name, biz_type, module_code, status, created_at, updated_at)
VALUES
  ('SIMPLE_PAYMENT_REQUEST', '费用付款申请', 'PAYMENT_REQUEST', 'MENU_WORKFLOW', 'ACTIVE', NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Payment request form version v1
WITH fd AS (SELECT id FROM wf_form_definition WHERE code = 'SIMPLE_PAYMENT_REQUEST')
INSERT INTO wf_form_version
  (form_id, version_no, status, schema_json, ui_schema_json, validation_json, published_at, created_at, updated_at)
SELECT
  fd.id, 1, 'PUBLISHED',
  '{
    "type": "object",
    "required": ["subject", "amount"],
    "properties": {
      "subject": {
        "type": "string",
        "title": "申请主题",
        "maxLength": 100
      },
      "amount": {
        "type": "number",
        "title": "申请金额",
        "minimum": 0
      },
      "currencyCode": {
        "type": "string",
        "title": "币种",
        "enum": ["CNY", "USD", "EUR", "HKD"],
        "default": "CNY"
      },
      "reason": {
        "type": "string",
        "title": "申请原因"
      }
    }
  }'::jsonb,
  '{
    "subject":      { "widget": "input",    "placeholder": "请输入申请主题" },
    "amount":       { "widget": "number",   "prefix": "¥" },
    "currencyCode": { "widget": "select" },
    "reason":       { "widget": "textarea", "rows": 4 }
  }'::jsonb,
  '{}'::jsonb,
  NOW(), NOW(), NOW()
FROM fd
ON CONFLICT (form_id, version_no) DO NOTHING;

-- 更新 current_version_id（仅当尚未设置时）
UPDATE wf_form_definition fd
   SET current_version_id = (
     SELECT id FROM wf_form_version
      WHERE form_id = fd.id AND version_no = 1
      ORDER BY id LIMIT 1
   )
 WHERE code = 'SIMPLE_PAYMENT_REQUEST'
   AND current_version_id IS NULL;

-- ── 6. Seed: SIMPLE_LEAVE_REQUEST ────────────────────────────────────────────
INSERT INTO wf_form_definition
  (code, name, biz_type, module_code, status, created_at, updated_at)
VALUES
  ('SIMPLE_LEAVE_REQUEST', '请假申请', 'LEAVE_REQUEST', 'MENU_WORKFLOW', 'ACTIVE', NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Leave request form version v1
WITH fd AS (SELECT id FROM wf_form_definition WHERE code = 'SIMPLE_LEAVE_REQUEST')
INSERT INTO wf_form_version
  (form_id, version_no, status, schema_json, ui_schema_json, validation_json, published_at, created_at, updated_at)
SELECT
  fd.id, 1, 'PUBLISHED',
  '{
    "type": "object",
    "required": ["subject", "startDate", "endDate"],
    "properties": {
      "subject": {
        "type": "string",
        "title": "申请主题",
        "maxLength": 100
      },
      "startDate": {
        "type": "string",
        "title": "开始日期",
        "format": "date"
      },
      "endDate": {
        "type": "string",
        "title": "结束日期",
        "format": "date"
      },
      "reason": {
        "type": "string",
        "title": "请假原因"
      }
    }
  }'::jsonb,
  '{
    "subject":   { "widget": "input",    "placeholder": "例：2026年5月年假" },
    "startDate": { "widget": "date" },
    "endDate":   { "widget": "date" },
    "reason":    { "widget": "textarea", "rows": 4 }
  }'::jsonb,
  '{}'::jsonb,
  NOW(), NOW(), NOW()
FROM fd
ON CONFLICT (form_id, version_no) DO NOTHING;

UPDATE wf_form_definition fd
   SET current_version_id = (
     SELECT id FROM wf_form_version
      WHERE form_id = fd.id AND version_no = 1
      ORDER BY id LIMIT 1
   )
 WHERE code = 'SIMPLE_LEAVE_REQUEST'
   AND current_version_id IS NULL;
