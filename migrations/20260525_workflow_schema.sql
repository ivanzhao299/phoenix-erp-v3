-- =============================================================================
-- Phoenix ERP V3 — Workflow Engine Schema Migration
-- Version: 20260525
-- Description: WorkflowEngine (wf_*) tables extracted from runtime ensureSchema()
--              Part of Workflow 2.0 Phase A: DDL Governance
-- Run: psql $DATABASE_URL -f migrations/20260525_workflow_schema.sql
-- =============================================================================

-- ── 表单定义 ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wf_form_definition (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(80)  UNIQUE NOT NULL,
  name            VARCHAR(160) NOT NULL,
  description     TEXT,
  category        VARCHAR(80),
  status          VARCHAR(20)  DEFAULT 'DRAFT',
  current_version_id INT,
  created_by      INT,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── 表单版本 ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wf_form_version (
  id           SERIAL PRIMARY KEY,
  form_id      INT NOT NULL REFERENCES wf_form_definition(id) ON DELETE CASCADE,
  version_no   INT NOT NULL,
  status       VARCHAR(20)  DEFAULT 'DRAFT',
  schema_json  JSONB        NOT NULL DEFAULT '{}'::jsonb,
  published_by INT,
  published_at TIMESTAMP,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (form_id, version_no)
);

-- ── 流程定义 ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wf_definition (
  id                 SERIAL PRIMARY KEY,
  code               VARCHAR(80)  UNIQUE NOT NULL,
  name               VARCHAR(160) NOT NULL,
  description        TEXT,
  category           VARCHAR(80),
  status             VARCHAR(20)  DEFAULT 'DRAFT',
  current_version_id INT,
  created_by         INT,
  created_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── 流程版本（冻结 graph_json，实例启动后引用不可变版本）────────────────────────
CREATE TABLE IF NOT EXISTS wf_definition_version (
  id            SERIAL PRIMARY KEY,
  definition_id INT  NOT NULL REFERENCES wf_definition(id) ON DELETE CASCADE,
  version_no    INT  NOT NULL,
  status        VARCHAR(20)  DEFAULT 'DRAFT',
  graph_json    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  form_version_id INT REFERENCES wf_form_version(id),
  published_by  INT,
  published_at  TIMESTAMP,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (definition_id, version_no)
);

-- ── 流程实例 ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wf_instance (
  id                    SERIAL PRIMARY KEY,
  instance_no           VARCHAR(64)  UNIQUE NOT NULL,
  definition_id         INT  NOT NULL REFERENCES wf_definition(id),
  definition_version_id INT  NOT NULL REFERENCES wf_definition_version(id),
  form_version_id       INT  REFERENCES wf_form_version(id),
  title                 VARCHAR(200),
  business_type         VARCHAR(80),
  business_id           VARCHAR(80),
  starter_id            INT,
  starter_name          VARCHAR(120),
  status                VARCHAR(20)  DEFAULT 'RUNNING',
  current_node_id       VARCHAR(120),
  form_data_json        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  variables_json        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  started_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  ended_at              TIMESTAMP,
  created_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── 任务 ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wf_task (
  id                 SERIAL PRIMARY KEY,
  task_no            VARCHAR(64)  UNIQUE NOT NULL,
  instance_id        INT  NOT NULL REFERENCES wf_instance(id) ON DELETE CASCADE,
  node_id            VARCHAR(120) NOT NULL,
  node_name          VARCHAR(160),
  assignee_user_id   INT,
  assignee_role_code VARCHAR(80),
  status             VARCHAR(20)  DEFAULT 'TODO',
  action_result      VARCHAR(40),
  due_at             TIMESTAMP,
  claimed_at         TIMESTAMP,
  completed_at       TIMESTAMP,
  created_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── 任务操作历史（审计链）──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wf_task_action (
  id           SERIAL PRIMARY KEY,
  task_id      INT  REFERENCES wf_task(id) ON DELETE SET NULL,
  instance_id  INT  NOT NULL REFERENCES wf_instance(id) ON DELETE CASCADE,
  action       VARCHAR(40)  NOT NULL,
  actor_id     INT,
  actor_name   VARCHAR(120),
  comment      TEXT,
  from_node_id VARCHAR(120),
  to_node_id   VARCHAR(120),
  payload_json JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── 实例变量 KV 存储 ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wf_instance_variable (
  id          SERIAL PRIMARY KEY,
  instance_id INT  NOT NULL REFERENCES wf_instance(id) ON DELETE CASCADE,
  var_key     VARCHAR(120) NOT NULL,
  var_value   TEXT,
  value_type  VARCHAR(30),
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── 外部数据源配置 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wf_data_source (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(80)  UNIQUE NOT NULL,
  name         VARCHAR(160) NOT NULL,
  source_type  VARCHAR(20)  NOT NULL,
  config_json  JSONB        NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB       NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMP,
  status       VARCHAR(20)  DEFAULT 'ACTIVE',
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── 抄送任务 ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wf_cc_task (
  id                 SERIAL PRIMARY KEY,
  instance_id        INT  NOT NULL REFERENCES wf_instance(id) ON DELETE CASCADE,
  node_id            VARCHAR(120),
  receiver_user_id   INT,
  receiver_role_code VARCHAR(80),
  read_at            TIMESTAMP,
  created_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── 索引 ──────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wf_task_todo_user ON wf_task(status, assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_wf_task_todo_role ON wf_task(status, assignee_role_code);
CREATE INDEX IF NOT EXISTS idx_wf_instance_status ON wf_instance(status);
