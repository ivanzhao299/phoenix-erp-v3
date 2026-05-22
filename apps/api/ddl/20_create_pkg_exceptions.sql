-- ═══════════════════════════════════════════════════════════════════════════
-- 20_create_pkg_exceptions.sql  —  异常品处理表（幂等）
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pkg_exceptions (
  id              SERIAL PRIMARY KEY,
  nc_no           VARCHAR(80),
  issue_type      VARCHAR(50),
  exception_type  VARCHAR(50),
  severity        VARCHAR(20) DEFAULT 'MEDIUM',
  batch_no        VARCHAR(80),
  related_batch_id VARCHAR(80),
  store_code      VARCHAR(50),
  description     TEXT,
  action_taken    VARCHAR(50),
  reported_by     VARCHAR(100),
  quantity        INTEGER DEFAULT 0,
  status          VARCHAR(30) DEFAULT 'OPEN',
  created_at      TIMESTAMP DEFAULT NOW()
);

ALTER TABLE pkg_exceptions ADD COLUMN IF NOT EXISTS exception_type  VARCHAR(50);
ALTER TABLE pkg_exceptions ADD COLUMN IF NOT EXISTS related_batch_id VARCHAR(80);
ALTER TABLE pkg_exceptions ADD COLUMN IF NOT EXISTS reported_by     VARCHAR(100);
ALTER TABLE pkg_exceptions ADD COLUMN IF NOT EXISTS quantity        INTEGER DEFAULT 0;
