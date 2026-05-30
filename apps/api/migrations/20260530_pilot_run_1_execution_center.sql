-- ============================================================
-- Phoenix ERP V3 — Pilot Run 1 Execution Center
-- 20260530_pilot_run_1_execution_center.sql
--
-- 内容：
--   1. pilot_daily_reports      — 试运行每日自动日报
--   2. 种子数据：PR-20260530-0001（孟赛鸡场试运行，RUNNING，14天）
--   3. uat_feedbacks 新增 pilot_run_id 关联字段
--
-- 原则：
--   · 全部幂等（IF NOT EXISTS / ON CONFLICT DO NOTHING）
--   · 不修改 sys_dict 任何已有记录
--   · 不删除现有字段
--
-- 生效日期：2026-05-30
-- ============================================================

-- ── 1. 试运行每日日报表 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pilot_daily_reports (
  id                   BIGSERIAL    PRIMARY KEY,
  pilot_run_id         BIGINT       NOT NULL REFERENCES uat_pilot_runs(id),
  report_date          DATE         NOT NULL,

  -- 业务指标
  order_count          INT          NOT NULL DEFAULT 0,
  sales_amount         NUMERIC(18,2) NOT NULL DEFAULT 0,
  delivery_count       INT          NOT NULL DEFAULT 0,
  receipt_count        INT          NOT NULL DEFAULT 0,
  return_count         INT          NOT NULL DEFAULT 0,
  collection_count     INT          NOT NULL DEFAULT 0,

  -- 异常指标
  issue_count          INT          NOT NULL DEFAULT 0,
  critical_issue_count INT          NOT NULL DEFAULT 0,
  new_feedback_count   INT          NOT NULL DEFAULT 0,

  -- 评分（0–100）
  score                NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_status         VARCHAR(16)  NOT NULL DEFAULT 'GREEN',  -- GREEN / YELLOW / RED

  -- 6 维子评分（各 0–100，加权得总分）
  score_sales          NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_inventory      NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_delivery       NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_finance        NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_approval       NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_stability      NUMERIC(5,2) NOT NULL DEFAULT 0,

  remark               TEXT,
  generated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_pilot_daily_report UNIQUE (pilot_run_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_pdr_pilot_run_id ON pilot_daily_reports (pilot_run_id);
CREATE INDEX IF NOT EXISTS idx_pdr_report_date  ON pilot_daily_reports (report_date DESC);
CREATE INDEX IF NOT EXISTS idx_pdr_score_status ON pilot_daily_reports (score_status);

COMMENT ON TABLE  pilot_daily_reports IS 'Pilot Run 每日自动日报，每天由 Scheduler 生成，也可手动触发';
COMMENT ON COLUMN pilot_daily_reports.score_status IS 'GREEN≥80 / YELLOW≥60 / RED<60';

-- ── 2. uat_feedbacks 关联 pilot_run_id ─────────────────────────────
ALTER TABLE uat_feedbacks
  ADD COLUMN IF NOT EXISTS pilot_run_id BIGINT REFERENCES uat_pilot_runs(id);

CREATE INDEX IF NOT EXISTS idx_uat_fb_pilot_run ON uat_feedbacks (pilot_run_id)
  WHERE pilot_run_id IS NOT NULL;

COMMENT ON COLUMN uat_feedbacks.pilot_run_id
  IS 'Pilot Run 1+: 关联试运行项目，问题闭环跟踪';

-- ── 3. uat_pilot_runs 补充字段（Pilot Run 1 执行中心需要） ──────────
ALTER TABLE uat_pilot_runs
  ADD COLUMN IF NOT EXISTS project_no       VARCHAR(64),   -- 项目编号 PR-20260530-0001
  ADD COLUMN IF NOT EXISTS scope_desc       TEXT,          -- 试运行范围描述
  ADD COLUMN IF NOT EXISTS team_size        INT DEFAULT 0, -- 参与人数
  ADD COLUMN IF NOT EXISTS go_live_score    NUMERIC(5,2),  -- 最终上线评分
  ADD COLUMN IF NOT EXISTS go_live_ready    BOOLEAN DEFAULT FALSE, -- 是否达到上线条件
  ADD COLUMN IF NOT EXISTS sales_amount     NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collection_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS critical_issue_count INT DEFAULT 0;

-- ── 4. 种子数据：Pilot Run 1 — 孟赛鸡场 + 直营店 + 经销商 ──────────
INSERT INTO uat_pilot_runs (
  run_no, project_no, site_name, company_code,
  run_start_date, run_end_date,
  status, team_size, scope_desc, remark
)
SELECT
  'PR-20260530-0001',
  'PR-20260530-0001',
  '孟赛鸡场 + 直营店 + 经销商',
  'MENGSE',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '14 days',
  'RUNNING',
  6,
  '生产端：孟赛鸡场 | 销售端：1家直营店 | 渠道端：1家经销商 | 配送端：1名司机 | 财务端：1名财务 | 管理端：1名负责人',
  'Phoenix ERP V3 Pilot Run 1 — 正式进入14天试运行阶段'
WHERE NOT EXISTS (
  SELECT 1 FROM uat_pilot_runs WHERE run_no = 'PR-20260530-0001'
);

-- ── 5. 自动生成今日日报（首日） ─────────────────────────────────────
INSERT INTO pilot_daily_reports (
  pilot_run_id, report_date,
  order_count, sales_amount, delivery_count, receipt_count,
  return_count, collection_count, issue_count, critical_issue_count,
  new_feedback_count, score, score_status,
  score_sales, score_inventory, score_delivery,
  score_finance, score_approval, score_stability,
  remark
)
SELECT
  pr.id,
  CURRENT_DATE,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  100, 'GREEN',
  100, 100, 100, 100, 100, 100,
  'Pilot Run 1 启动日报 — 初始评分 100 分，业务数据将在次日起自动累计'
FROM uat_pilot_runs pr
WHERE pr.run_no = 'PR-20260530-0001'
ON CONFLICT (pilot_run_id, report_date) DO NOTHING;

-- ── 6. 确认 ─────────────────────────────────────────────────────────
DO $$
DECLARE
  pr_id   BIGINT;
  rpt_cnt INT;
BEGIN
  SELECT id INTO pr_id FROM uat_pilot_runs WHERE run_no = 'PR-20260530-0001';
  SELECT COUNT(*) INTO rpt_cnt FROM pilot_daily_reports WHERE pilot_run_id = pr_id;
  RAISE NOTICE '✅ Pilot Run 1 Execution Center 已初始化：pilot_run_id=% daily_reports=%', pr_id, rpt_cnt;
END$$;
