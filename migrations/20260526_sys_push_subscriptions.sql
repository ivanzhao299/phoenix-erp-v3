-- Workflow 2.0 Phase E — Web Push 订阅表
-- 每个用户可在多台设备上订阅，每台设备对应一条记录
-- 唯一约束：(user_id, endpoint) 去重

CREATE TABLE IF NOT EXISTS sys_push_subscriptions (
  id            BIGSERIAL    PRIMARY KEY,
  user_id       BIGINT       NOT NULL,
  endpoint      TEXT         NOT NULL,
  p256dh        TEXT         NOT NULL,
  auth          TEXT         NOT NULL,
  user_agent    TEXT,
  platform      VARCHAR(64),
  enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_push_user_endpoint UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_sps_user_enabled
  ON sys_push_subscriptions (user_id, enabled);
