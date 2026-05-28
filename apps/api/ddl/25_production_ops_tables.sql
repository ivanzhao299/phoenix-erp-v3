-- ═══════════════════════════════════════════════════════════════
-- Phoenix ERP V3 — DDL 25: Production Ops Runtime 建表
-- 幂等：所有 CREATE TABLE / INDEX 均使用 IF NOT EXISTS
-- 可重复执行，不会破坏已有数据或结构
-- 覆盖表（3 张，sys_operation_logs 已在 DDL 17 建立）：
--   sys_error_logs   — 生产错误追踪（全局异常过滤器写入）
--   sys_alerts       — 异常告警记录（append-only，只允许 resolved=true）
--   sys_configs      — 生产配置治理（禁止硬编码，修改必须审计）
-- ═══════════════════════════════════════════════════════════════

-- ── 1. 错误日志 sys_error_logs ────────────────────────────────────
--  AllExceptionsFilter 捕获 500/PG 错误时写入。
--  生产不暴露 stack_trace 给前端，但存储到此表供排查。
CREATE TABLE IF NOT EXISTS sys_error_logs (
  id              BIGSERIAL     PRIMARY KEY,
  -- 错误分类
  error_type      VARCHAR(64)   NOT NULL DEFAULT 'UNKNOWN',
  -- HTTP 状态码（500 / 400 / PG错误等）
  http_status     INT,
  -- 错误消息（不含堆栈，可安全展示）
  error_message   TEXT          NOT NULL,
  -- 完整堆栈（仅存储，不返回前端）
  stack_trace     TEXT,
  -- PostgreSQL 错误码（如 23505 / 23503）
  pg_error_code   VARCHAR(16),
  -- 请求上下文
  request_method  VARCHAR(10),
  request_path    TEXT,
  request_body    JSONB,
  -- 操作用户（可能为空，如未登录请求）
  user_id         BIGINT,
  username        VARCHAR(64),
  -- 客户端信息
  ip_address      VARCHAR(64),
  user_agent      TEXT,
  -- 时间戳（幂等检查用）
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sys_error_type      ON sys_error_logs (error_type);
CREATE INDEX IF NOT EXISTS idx_sys_error_status    ON sys_error_logs (http_status);
CREATE INDEX IF NOT EXISTS idx_sys_error_created   ON sys_error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_error_user      ON sys_error_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sys_error_path      ON sys_error_logs (request_path);

-- ── 2. 异常告警 sys_alerts ────────────────────────────────────────
--  系统检测到异常时（慢接口/高错误率/内存预警/磁盘告警）写入。
--  安全约束：不允许 DELETE，只允许将 resolved 设为 true。
CREATE TABLE IF NOT EXISTS sys_alerts (
  id              BIGSERIAL     PRIMARY KEY,
  -- 告警类型（SLOW_API / HIGH_ERROR_RATE / MEMORY / DISK / DB_CONN / CUSTOM）
  alert_type      VARCHAR(64)   NOT NULL,
  -- 告警级别（INFO / WARNING / CRITICAL）
  severity        VARCHAR(16)   NOT NULL DEFAULT 'WARNING',
  -- 告警标题（人类可读）
  title           VARCHAR(256)  NOT NULL,
  -- 告警详情（JSON，包含指标数值/阈值/触发条件）
  detail          JSONB,
  -- 关联接口/模块
  related_path    TEXT,
  -- 是否已处理
  resolved        BOOLEAN       NOT NULL DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  resolved_by     VARCHAR(64),
  resolved_remark TEXT,
  -- 告警时间
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sys_alert_type      ON sys_alerts (alert_type);
CREATE INDEX IF NOT EXISTS idx_sys_alert_severity  ON sys_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_sys_alert_resolved  ON sys_alerts (resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_sys_alert_created   ON sys_alerts (created_at DESC);

-- ── 3. 生产配置 sys_configs ───────────────────────────────────────
--  禁止硬编码业务参数到代码中；所有可配置参数写入此表。
--  修改前读旧值写 old_value，所有修改操作必须携带 updated_by。
CREATE TABLE IF NOT EXISTS sys_configs (
  id              BIGSERIAL     PRIMARY KEY,
  -- 配置分组（CREDIT / SLA / ALERT / SYSTEM / CUSTOM 等）
  config_group    VARCHAR(64)   NOT NULL,
  -- 配置键（全局唯一）
  config_key      VARCHAR(128)  NOT NULL UNIQUE,
  -- 配置值（字符串，由 Service 层负责类型转换）
  config_value    TEXT          NOT NULL,
  -- 值类型标注（STRING / INT / DECIMAL / BOOLEAN / JSON）
  value_type      VARCHAR(16)   NOT NULL DEFAULT 'STRING',
  -- 描述（中文，供管理员理解用途）
  description     TEXT,
  -- 是否加密存储（密码/密钥类配置）
  is_encrypted    BOOLEAN       NOT NULL DEFAULT FALSE,
  -- 是否只读（系统级不允许界面修改）
  is_readonly     BOOLEAN       NOT NULL DEFAULT FALSE,
  -- 审计字段
  created_by      VARCHAR(64),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by      VARCHAR(64),
  updated_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sys_cfg_group  ON sys_configs (config_group);
CREATE INDEX IF NOT EXISTS idx_sys_cfg_key    ON sys_configs (config_key);

-- ── 默认配置种子（幂等 INSERT，不覆盖已有值） ────────────────────
INSERT INTO sys_configs (config_group, config_key, config_value, value_type, description, is_readonly)
VALUES
  -- 信用控制
  ('CREDIT', 'credit.freeze_overdue_days',  '30',     'INT',     '逾期超过多少天自动冻结客户信用', false),
  ('CREDIT', 'credit.high_risk_score',      '40',     'INT',     '信用评分低于此值标记高风险', false),
  ('CREDIT', 'credit.refresh_cron',         '0 2 * * *','STRING','信用刷新 Cron 表达式（UTC）', false),
  -- SLA 告警
  ('SLA',    'sla.default_hours',           '48',     'INT',     '审批步骤默认 SLA（小时）', false),
  ('SLA',    'sla.reminder_interval_hours', '12',     'INT',     'SLA 提醒间隔（小时）', false),
  ('SLA',    'sla.max_reminders',           '3',      'INT',     '最大提醒次数', false),
  -- 系统监控
  ('ALERT',  'alert.slow_api_ms',           '3000',   'INT',     '慢接口告警阈值（毫秒）', false),
  ('ALERT',  'alert.error_rate_threshold',  '5',      'INT',     '5分钟内 500 错误超过此数触发告警', false),
  ('ALERT',  'alert.memory_warning_pct',    '85',     'INT',     '内存使用率超过此百分比触发告警', false),
  -- 系统信息
  ('SYSTEM', 'system.version',              'V3.0',   'STRING',  'ERP 版本号', true),
  ('SYSTEM', 'system.env',                  'production','STRING','运行环境', true)
ON CONFLICT (config_key) DO NOTHING;

-- ── 确认 ──────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ DDL 25 Production Ops tables applied (3 tables + 11 seed configs, idempotent)';
END$$;
