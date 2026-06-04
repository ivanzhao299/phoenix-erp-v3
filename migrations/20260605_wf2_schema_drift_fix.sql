-- ════════════════════════════════════════════════════════════════════════════
-- WF-2 Phase 1 · Schema Drift 修复
-- ════════════════════════════════════════════════════════════════════════════
-- 1. wf_form_definition 补缺列：biz_type / module_code / remark
-- 2. 新建 wf_form_submission 表（service 引用但 20260525 迁移漏建）
-- 全部 IF NOT EXISTS / ADD COLUMN IF NOT EXISTS 幂等
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE wf_form_definition
  ADD COLUMN IF NOT EXISTS biz_type    VARCHAR(64),
  ADD COLUMN IF NOT EXISTS module_code VARCHAR(64),
  ADD COLUMN IF NOT EXISTS remark      TEXT;

CREATE INDEX IF NOT EXISTS idx_wf_form_definition_biz_type
  ON wf_form_definition(biz_type) WHERE biz_type IS NOT NULL;

-- wf_form_submission：service 用到的所有列
CREATE TABLE IF NOT EXISTS wf_form_submission (
  id                      BIGSERIAL PRIMARY KEY,
  submission_no           VARCHAR(64) NOT NULL UNIQUE,
  form_code               VARCHAR(64) NOT NULL,
  form_version_id         BIGINT      NOT NULL,
  biz_type                VARCHAR(64),
  biz_id                  VARCHAR(64),
  biz_no                  VARCHAR(80),
  submitted_by            BIGINT,
  submitted_by_name       VARCHAR(128),
  company_code            VARCHAR(64),
  company_name            VARCHAR(256),
  project_code            VARCHAR(64),
  project_name            VARCHAR(256),
  data_json               JSONB,
  status                  VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
    -- SUBMITTED / PENDING_APPROVAL / APPROVED / REJECTED / CANCELLED
  workflow_instance_id    BIGINT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wf_form_submission_form_code   ON wf_form_submission(form_code);
CREATE INDEX IF NOT EXISTS idx_wf_form_submission_biz_type    ON wf_form_submission(biz_type) WHERE biz_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wf_form_submission_status      ON wf_form_submission(status);
CREATE INDEX IF NOT EXISTS idx_wf_form_submission_submitted_by ON wf_form_submission(submitted_by) WHERE submitted_by IS NOT NULL;

COMMENT ON TABLE wf_form_submission IS
  'WF-2: 工作流表单提交记录（service workflow-form-runtime.service.ts 使用）';
