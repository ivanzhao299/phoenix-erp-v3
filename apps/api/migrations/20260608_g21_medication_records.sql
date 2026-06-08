-- ═════════════════════════════════════════════════════════════════════════════
-- G21-4 · brd_medication_records — 用药记录业务表（E1 欠债治理）
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：medicine 页面试图存 batch_no/disease/start_date/days_used/withdraw_days
--      /clear_date/dose/executor 等业务字段，但 brd_medications 实表只有 8 列
--      (medication_code/name/dosage) — 是**主档**而非业务记录表。
--
-- 改动：建独立 brd_medication_records；幂等 — 兼容历史已存在的旧版表（缺列）。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS brd_medication_records (
  id SERIAL PRIMARY KEY
);

-- 幂等加列（兼容历史/部分部署的不完整表）
DO $body$
BEGIN
  -- 业务字段
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS batch_no        VARCHAR(64);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS medication_code VARCHAR(64);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS flock_no        VARCHAR(64);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS house_code      VARCHAR(64);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS farm_code       VARCHAR(64);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS site_code       VARCHAR(64);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS company_code    VARCHAR(64);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS disease         VARCHAR(255);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS start_date      DATE;
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS end_date        DATE;
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS days_used       INTEGER DEFAULT 5;
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS withdraw_days   INTEGER DEFAULT 7;
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS clear_date      DATE;
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS dose            VARCHAR(255);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS usage_route     VARCHAR(64);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS executor        VARCHAR(64);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS status          VARCHAR(32) DEFAULT 'using';
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS remark          TEXT;
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS attachment_url  TEXT;
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS store_code      VARCHAR(64);
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  ALTER TABLE brd_medication_records ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

  -- 唯一索引（batch_no 业务唯一）
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_brd_med_rec_batch') THEN
    CREATE UNIQUE INDEX uq_brd_med_rec_batch ON brd_medication_records(batch_no) WHERE batch_no IS NOT NULL;
  END IF;
END $body$;

CREATE INDEX IF NOT EXISTS idx_brd_med_rec_flock ON brd_medication_records(flock_no);
CREATE INDEX IF NOT EXISTS idx_brd_med_rec_site  ON brd_medication_records(site_code);
CREATE INDEX IF NOT EXISTS idx_brd_med_rec_date  ON brd_medication_records(start_date);
CREATE INDEX IF NOT EXISTS idx_brd_med_rec_med   ON brd_medication_records(medication_code);

COMMENT ON TABLE  brd_medication_records IS 'G21-4：用药业务记录表（区别于 brd_medications 主档）';

COMMIT;
