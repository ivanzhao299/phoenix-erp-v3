-- ── sys_notifications 站内通知表 ──────────────────────────────────────────────
-- Workflow 2.0 Phase B: 统一通知中心

CREATE TABLE IF NOT EXISTS sys_notifications (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           BIGINT       NOT NULL,                  -- 接收人 user_id
  notification_type VARCHAR(32)  NOT NULL DEFAULT 'WORKFLOW_TASK',
                                                            -- WORKFLOW_TASK / APPROVAL_RESULT / SYSTEM
  title             VARCHAR(256) NOT NULL,                  -- 标题
  content           TEXT         NOT NULL,                  -- 正文（不含敏感信息）
  link_type         VARCHAR(32),                            -- APPROVAL_INSTANCE / WORKFLOW_INSTANCE / NONE
  link_id           VARCHAR(64),                            -- 跳转目标 ID
  biz_type          VARCHAR(32),                            -- PR / PO / PAYMENT / FUND …
  biz_id            VARCHAR(64),
  biz_no            VARCHAR(80),
  status            VARCHAR(16)  NOT NULL DEFAULT 'UNREAD', -- UNREAD / READ / ARCHIVED
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sn_user_status   ON sys_notifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sn_user_created  ON sys_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sn_biz           ON sys_notifications(biz_type, biz_id) WHERE biz_type IS NOT NULL;
