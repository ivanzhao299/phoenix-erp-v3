-- ════════════════════════════════════════════════════════════════════════════
-- G5.5-D · Master Data Governance Finalization — Schema 收口
-- ════════════════════════════════════════════════════════════════════════════
-- 目标：主数据评分 80.5 → 95+
--
-- 本迁移：
--   1. sys_organizations 补 lifecycle 字段（DRAFT/PENDING_APPROVAL/.../effective_date/expire_date）
--      · 公司档案 = sys_organizations.org_type='COMPANY'，共享同一张表
--   2. sys_dict 补 lifecycle 字段
--   3. 编码序列表种子 ORG / COMP / DICT 三个新前缀
--   4. 主数据治理日志表（governance_event_log）
--
-- 全部 IF NOT EXISTS / ON CONFLICT 幂等。
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 1：sys_organizations 补 lifecycle ────────────────────────────────────
-- 已有 status（ACTIVE/INACTIVE）；扩展为 5 态 + effective_date/expire_date
ALTER TABLE sys_organizations
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expire_date    DATE;

-- 旧 INACTIVE → ARCHIVED；ACTIVE 保持
UPDATE sys_organizations SET status = 'ARCHIVED' WHERE status = 'INACTIVE';

COMMENT ON COLUMN sys_organizations.status IS
  'G5.5-D: 5 态生命周期 — DRAFT / PENDING_APPROVAL / ACTIVE / FROZEN / ARCHIVED / REJECTED';

-- ── PART 2：sys_dict 补 lifecycle ─────────────────────────────────────────────
ALTER TABLE sys_dict
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expire_date    DATE,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT now();

UPDATE sys_dict SET status = 'ARCHIVED' WHERE status IN ('INACTIVE', 'DELETED');
UPDATE sys_dict SET status = 'ACTIVE' WHERE status IS NULL;

COMMENT ON COLUMN sys_dict.status IS
  'G5.5-D: 字典 5 态生命周期 — DRAFT / PENDING_APPROVAL / ACTIVE / FROZEN / ARCHIVED';

-- ── PART 3：编码序列种子 ───────────────────────────────────────────────────────
-- FIX UAT-P0-Phase1 2026-06-04: 列名对齐 (current_no/pad_len/remark)
INSERT INTO mst_code_seq (prefix, current_no, pad_len, remark) VALUES
  ('ORG',  0, 4, '组织架构编码 — G5.5-D 新增'),
  ('COMP', 0, 4, '公司档案编码（视图：sys_organizations.org_type=COMPANY）— G5.5-D'),
  ('DICT', 0, 5, '数据字典编码 — G5.5-D 新增（注：dict_code 业务约定，前缀可选用）')
ON CONFLICT (prefix) DO NOTHING;

-- ── PART 4：治理事件日志（用于驾驶舱趋势分析）──────────────────────────────────
CREATE TABLE IF NOT EXISTS md_governance_events (
  id            BIGSERIAL PRIMARY KEY,
  event_type    VARCHAR(64) NOT NULL,
    -- ARCHIVE_BLOCKED / FROZEN_REFERENCED / DICT_COVERAGE_DROP / WORKFLOW_TIMEOUT
  object_type   VARCHAR(64),
  object_code   VARCHAR(128),
  severity      VARCHAR(16) NOT NULL DEFAULT 'MEDIUM', -- LOW / MEDIUM / HIGH
  payload       JSONB,
  message       TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_md_governance_events_type ON md_governance_events(event_type);
CREATE INDEX IF NOT EXISTS idx_md_governance_events_severity ON md_governance_events(severity);
CREATE INDEX IF NOT EXISTS idx_md_governance_events_created_at ON md_governance_events(created_at DESC);

COMMENT ON TABLE md_governance_events IS
  'G5.5-D: 主数据治理事件日志（归档阻断 / 冻结引用 / 字典覆盖率下降 / 工作流超时）';

-- ── PART 5：主数据评分历史快照（用于驾驶舱趋势曲线）────────────────────────────
CREATE TABLE IF NOT EXISTS md_governance_snapshots (
  id                BIGSERIAL PRIMARY KEY,
  overall           INTEGER NOT NULL,
  org_score         INTEGER NOT NULL,
  company_score     INTEGER NOT NULL,
  dict_score        INTEGER NOT NULL,
  user_org_score    INTEGER NOT NULL,
  reference_score   INTEGER NOT NULL,
  workflow_score    INTEGER NOT NULL,
  alert_count       INTEGER NOT NULL DEFAULT 0,
  high_alert_count  INTEGER NOT NULL DEFAULT 0,
  snapshot_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_md_governance_snapshots_at
  ON md_governance_snapshots(snapshot_at DESC);

COMMENT ON TABLE md_governance_snapshots IS
  'G5.5-D: 主数据治理评分历史快照（每日 cron 写入），用于治理驾驶舱趋势图';
