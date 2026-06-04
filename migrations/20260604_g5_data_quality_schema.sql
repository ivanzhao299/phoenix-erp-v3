-- ════════════════════════════════════════════════════════════════════════════
-- G5 · Data Quality Center — Schema
-- ════════════════════════════════════════════════════════════════════════════
-- 持久化告警记录（用于通知中心订阅、邮件订阅、历史回溯）
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS data_quality_alerts (
  id              BIGSERIAL PRIMARY KEY,
  source          VARCHAR(32)  NOT NULL,   -- master-data / dict / datascope / traceability / inventory / workflow / code
  alert_type      VARCHAR(64)  NOT NULL,   -- DUPLICATE_CODE / MISSING_DICT_TYPE / NEGATIVE_QTY / ...
  severity        VARCHAR(16)  NOT NULL,   -- LOW / MEDIUM / HIGH
  affected_count  INTEGER      NOT NULL DEFAULT 0,
  message         TEXT         NOT NULL,
  recommendation  TEXT,
  payload         JSONB,                   -- 详细数据（如 batch_no 列表）
  status          VARCHAR(16)  NOT NULL DEFAULT 'OPEN', -- OPEN / ACKED / RESOLVED / IGNORED
  acked_by        VARCHAR(64),
  acked_at        TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_quality_alerts_source       ON data_quality_alerts(source);
CREATE INDEX IF NOT EXISTS idx_data_quality_alerts_severity     ON data_quality_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_data_quality_alerts_status       ON data_quality_alerts(status);
CREATE INDEX IF NOT EXISTS idx_data_quality_alerts_created_at   ON data_quality_alerts(created_at);

COMMENT ON TABLE data_quality_alerts IS
  'G5: 数据质量告警持久化记录。每日由调度任务调用 DataQualityAggregatorService 写入；
   也可由 alerts 端点实时计算生成（不持久化）。';

-- 历史评分快照（用于趋势曲线）
CREATE TABLE IF NOT EXISTS data_quality_score_snapshots (
  id               BIGSERIAL PRIMARY KEY,
  overall          INTEGER NOT NULL,
  master_data      INTEGER NOT NULL,
  dict             INTEGER NOT NULL,
  datascope        INTEGER NOT NULL,
  traceability     INTEGER NOT NULL,
  inventory        INTEGER NOT NULL,
  workflow         INTEGER NOT NULL,
  code             INTEGER NOT NULL,
  alert_count      INTEGER NOT NULL DEFAULT 0,
  high_alert_count INTEGER NOT NULL DEFAULT 0,
  snapshot_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_quality_score_snapshots_at
  ON data_quality_score_snapshots(snapshot_at DESC);

COMMENT ON TABLE data_quality_score_snapshots IS
  'G5: 数据质量评分历史快照（每日 / 每小时由调度任务写入），用于驾驶舱趋势图';
