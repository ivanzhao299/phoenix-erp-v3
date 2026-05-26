-- Workflow 2.0 Phase F — SLA & Escalation Schema
-- 为审批规则步骤新增 SLA 配置字段
-- 为审批实例步骤新增 SLA 追踪字段

-- ── wf_approval_rule_steps: SLA 配置 ──────────────────────────────────────────
ALTER TABLE wf_approval_rule_steps
  ADD COLUMN IF NOT EXISTS sla_hours                INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS reminder_interval_hours  INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS max_reminders            INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS escalation_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS escalation_after_hours   INTEGER,
  ADD COLUMN IF NOT EXISTS escalation_role          VARCHAR(128);

-- ── wf_approval_instance_steps: SLA 追踪 ──────────────────────────────────────
ALTER TABLE wf_approval_instance_steps
  ADD COLUMN IF NOT EXISTS due_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_overdue        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminded_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_level  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_task_id    BIGINT;

-- 超期检测索引
CREATE INDEX IF NOT EXISTS idx_wf_step_overdue
  ON wf_approval_instance_steps (due_at, status, is_overdue)
  WHERE status = 'PENDING';
