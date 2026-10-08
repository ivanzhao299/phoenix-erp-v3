-- ISOLATED TEST SCHEMA ONLY. No production execution or business seed.
-- Legacy runtime-only tables have no canonical migration yet (governance backlog).
CREATE TABLE IF NOT EXISTS sys_settings (
  key VARCHAR(64) PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sys_cron_heartbeat (
  job_name VARCHAR(80) PRIMARY KEY, last_run_at TIMESTAMP, last_status VARCHAR(16),
  last_detail TEXT, last_success_at TIMESTAMP, last_failure_at TIMESTAMP,
  success_count BIGINT DEFAULT 0, fail_count BIGINT DEFAULT 0, updated_at TIMESTAMP DEFAULT NOW()
);
