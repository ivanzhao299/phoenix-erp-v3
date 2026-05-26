-- =============================================================================
-- Phoenix ERP V3 — Workflow 2.0 Phase I: Form + ApprovalEngine Integration
-- Version: 20260526_phase_i
-- Description:
--   1. wf_approval_instances 补充 form_submission_id / form_code / form_version_id
--      以便审批实例与表单提交快照互相关联
--   2. 创建快速查找索引
-- Depends-on: 20260526_phase_h_form_runtime.sql
-- Run: psql $DATABASE_URL -f migrations/20260526_phase_i_form_approval_integration.sql
-- =============================================================================

-- ── 1. wf_approval_instances 关联表单提交 ────────────────────────────────────
ALTER TABLE wf_approval_instances
  ADD COLUMN IF NOT EXISTS form_submission_id BIGINT    NULL,
  ADD COLUMN IF NOT EXISTS form_code          VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS form_version_id    BIGINT    NULL;

-- ── 2. 索引（仅在有值时建立，稀疏索引节省空间）────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wf_approval_instances_form_submission
  ON wf_approval_instances(form_submission_id)
  WHERE form_submission_id IS NOT NULL;
