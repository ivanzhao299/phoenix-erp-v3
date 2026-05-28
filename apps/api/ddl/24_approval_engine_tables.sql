-- ═══════════════════════════════════════════════════════════════
-- Phoenix ERP V3 — DDL 24: Approval Engine Runtime 建表
-- 幂等：所有 CREATE TABLE / INDEX 均使用 IF NOT EXISTS
-- 可重复执行，不会破坏已有数据或结构
-- 覆盖表（4 张）：
--   wf_approval_rules          — 审批规则配置
--   wf_approval_rule_steps     — 审批规则步骤（含 SLA/升级字段）
--   wf_approval_instances      — 审批实例（每单业务对应一个实例）
--   wf_approval_instance_steps — 审批实例步骤（每步骤审批人动作记录）
-- 注意：这些表使用 TypeORM Entity + synchronize=false，
--       框架不会自动建表，必须由本 DDL 创建。
-- ═══════════════════════════════════════════════════════════════

-- ── 1. 审批规则配置 wf_approval_rules ────────────────────────────
--  每条规则绑定一个业务类型（biz_type），
--  根据公司/项目/金额区间等条件匹配，优先级由 priority 控制（越小越优先）。
CREATE TABLE IF NOT EXISTS wf_approval_rules (
  id             BIGSERIAL     PRIMARY KEY,
  -- 规则唯一编号（如 PRC2_PO_CROSS_BORDER_GT50K）
  rule_code      VARCHAR(255)  NOT NULL UNIQUE,
  module_code    VARCHAR(255)  NOT NULL,
  biz_type       VARCHAR(255)  NOT NULL,
  -- 条件维度（NULL 表示匹配所有）
  org_type       VARCHAR(255),
  company_code   VARCHAR(255),
  project_code   VARCHAR(255),
  currency_code  VARCHAR(255),
  -- 金额区间（min_amount <= 单据金额 < max_amount）
  min_amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
  max_amount     NUMERIC(18,2),
  -- 附加条件（JSON 格式，如 {"cross_border": true}）
  condition_json JSONB,
  -- SEQUENTIAL=顺序审批 / PARALLEL=并行审批
  approval_mode  VARCHAR(255)  NOT NULL DEFAULT 'SEQUENTIAL',
  enabled        BOOLEAN       NOT NULL DEFAULT TRUE,
  priority       INT           NOT NULL DEFAULT 100,
  remark         TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_rule_module_biz      ON wf_approval_rules (module_code, biz_type);
CREATE INDEX IF NOT EXISTS idx_wf_rule_enabled          ON wf_approval_rules (enabled);
CREATE INDEX IF NOT EXISTS idx_wf_rule_priority         ON wf_approval_rules (priority);
CREATE INDEX IF NOT EXISTS idx_wf_rule_company          ON wf_approval_rules (company_code) WHERE company_code IS NOT NULL;

-- ── 2. 审批规则步骤 wf_approval_rule_steps ───────────────────────
--  每条规则可有多个步骤（step_no 升序），含 SLA 超时 / 提醒 / 升级配置。
CREATE TABLE IF NOT EXISTS wf_approval_rule_steps (
  id                      BIGSERIAL    PRIMARY KEY,
  rule_id                 BIGINT       NOT NULL,
  step_no                 INT          NOT NULL,
  -- 审批人来源：ROLE=角色 / USER=指定用户
  approver_type           VARCHAR(255) NOT NULL DEFAULT 'ROLE',
  approver_role           VARCHAR(255),
  approver_user_id        BIGINT,
  -- 组织范围限定（如 OWN_COMPANY / PARENT_COMPANY）
  org_scope               VARCHAR(255),
  required_approval_count INT          NOT NULL DEFAULT 1,
  allow_admin_override    BOOLEAN      NOT NULL DEFAULT FALSE,
  -- SLA 配置（Phase F）
  sla_hours               INT          NOT NULL DEFAULT 48,
  reminder_interval_hours INT          NOT NULL DEFAULT 12,
  max_reminders           INT          NOT NULL DEFAULT 3,
  escalation_enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
  escalation_after_hours  INT,
  escalation_role         VARCHAR(128),
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_rule_step_rule_id    ON wf_approval_rule_steps (rule_id);
CREATE INDEX IF NOT EXISTS idx_wf_rule_step_no          ON wf_approval_rule_steps (rule_id, step_no);

-- ── 3. 审批实例 wf_approval_instances ────────────────────────────
--  每张单据提交审批时创建一个实例，关联 biz_type + biz_id。
CREATE TABLE IF NOT EXISTS wf_approval_instances (
  id                 BIGSERIAL     PRIMARY KEY,
  -- 实例唯一编号（如 WFA-20260527-000001）
  instance_no        VARCHAR(255)  NOT NULL UNIQUE,
  module_code        VARCHAR(255)  NOT NULL,
  biz_type           VARCHAR(255)  NOT NULL,
  biz_id             BIGINT        NOT NULL,
  biz_no             VARCHAR(255),
  rule_id            BIGINT,
  total_steps        INT           NOT NULL DEFAULT 1,
  current_step_no    INT           NOT NULL DEFAULT 1,
  status             VARCHAR(255)  NOT NULL DEFAULT 'PENDING',
  started_by         BIGINT,
  started_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  finished_at        TIMESTAMPTZ,
  -- 业务摘要快照（Phase B）
  amount             NUMERIC(18,2),
  currency_code      VARCHAR(8),
  company_code       VARCHAR(64),
  company_name       VARCHAR(256),
  project_code       VARCHAR(64),
  project_name       VARCHAR(256),
  subject            VARCHAR(256),
  -- 在线表单关联（Phase I）
  form_submission_id BIGINT,
  form_code          VARCHAR(80),
  form_version_id    BIGINT
);

CREATE INDEX IF NOT EXISTS idx_wf_inst_biz             ON wf_approval_instances (biz_type, biz_id);
CREATE INDEX IF NOT EXISTS idx_wf_inst_status           ON wf_approval_instances (status);
CREATE INDEX IF NOT EXISTS idx_wf_inst_module           ON wf_approval_instances (module_code);
CREATE INDEX IF NOT EXISTS idx_wf_inst_started_by       ON wf_approval_instances (started_by) WHERE started_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wf_inst_rule_id          ON wf_approval_instances (rule_id) WHERE rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wf_inst_company          ON wf_approval_instances (company_code) WHERE company_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wf_inst_form             ON wf_approval_instances (form_submission_id) WHERE form_submission_id IS NOT NULL;

-- ── 4. 审批实例步骤 wf_approval_instance_steps ───────────────────
--  每个实例的每个步骤对应一行，记录审批人动作、SLA 追踪、升级状态。
CREATE TABLE IF NOT EXISTS wf_approval_instance_steps (
  id                   BIGSERIAL    PRIMARY KEY,
  instance_id          BIGINT       NOT NULL,
  step_no              INT          NOT NULL,
  approver_role        VARCHAR(255),
  approver_user_id     BIGINT,
  approver_name        VARCHAR(255),
  status               VARCHAR(255) NOT NULL DEFAULT 'PENDING',
  action               VARCHAR(255),
  comment              TEXT,
  acted_at             TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- 审计字段（Phase B）
  actor_user_id        BIGINT,
  actor_username       VARCHAR(64),
  required_role        VARCHAR(64),
  allow_admin_override BOOLEAN      NOT NULL DEFAULT FALSE,
  approver_type        VARCHAR(32)  NOT NULL DEFAULT 'ROLE',
  -- SLA 追踪（Phase F）
  due_at               TIMESTAMPTZ,
  is_overdue           BOOLEAN      NOT NULL DEFAULT FALSE,
  reminder_count       INT          NOT NULL DEFAULT 0,
  last_reminded_at     TIMESTAMPTZ,
  escalation_level     INT          NOT NULL DEFAULT 0,
  source_task_id       BIGINT
);

CREATE INDEX IF NOT EXISTS idx_wf_istep_instance_id    ON wf_approval_instance_steps (instance_id);
CREATE INDEX IF NOT EXISTS idx_wf_istep_instance_step  ON wf_approval_instance_steps (instance_id, step_no);
CREATE INDEX IF NOT EXISTS idx_wf_istep_status          ON wf_approval_instance_steps (status);
CREATE INDEX IF NOT EXISTS idx_wf_istep_approver_user   ON wf_approval_instance_steps (approver_user_id) WHERE approver_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wf_istep_due_at          ON wf_approval_instance_steps (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wf_istep_overdue         ON wf_approval_instance_steps (is_overdue) WHERE is_overdue = TRUE;
CREATE INDEX IF NOT EXISTS idx_wf_istep_task            ON wf_approval_instance_steps (source_task_id) WHERE source_task_id IS NOT NULL;

-- ── 确认 ──────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ DDL 24 Approval Engine tables applied (4 tables, idempotent)';
END$$;
