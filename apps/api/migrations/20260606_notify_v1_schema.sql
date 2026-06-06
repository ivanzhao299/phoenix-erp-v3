-- ═════════════════════════════════════════════════════════════════════════════
-- Notification V1 — 通知规则引擎 schema
-- ═════════════════════════════════════════════════════════════════════════════
-- 按"推荐默认"实施：
--   · 接收人策略 3 种：NEXT_APPROVER / ROLE / USER
--   · 语言：仅 zh-CN（多语言模板表结构留位）
--   · 渠道：STATION + PUSH（已有基础设施复用）
--   · 用户偏好：每类通知开/关
--   · 合并去重：5 分钟窗口内同 rule+recipient 合并
--
-- 5 张新表：
--   1. sys_notification_rules        规则配置
--   2. sys_notification_templates    模板（多语言/多渠道）
--   3. sys_notification_channels     渠道全局配置
--   4. sys_notification_log          投递日志 + 重试
--   5. sys_user_notification_prefs   用户订阅开关
--
-- 幂等 CREATE TABLE IF NOT EXISTS。**待业务方授权后再执行**。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 规则 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sys_notification_rules (
  id                   BIGSERIAL PRIMARY KEY,
  rule_code            VARCHAR(64)  NOT NULL UNIQUE,
  rule_name            VARCHAR(200) NOT NULL,
  category             VARCHAR(64)  NOT NULL,
    -- WORKFLOW / BUSINESS_ALERT / DAILY_DIGEST / SCHEDULE / MANUAL / SYSTEM
  event_type           VARCHAR(32)  NOT NULL,
    -- BIZ_EVENT / WORKFLOW / SCHEDULE / THRESHOLD / MANUAL
  trigger_config       jsonb        NOT NULL DEFAULT '{}'::jsonb,
    -- BIZ_EVENT: {biz_type:'PR',action:'SUBMIT'}
    -- SCHEDULE:  {cron:'0 8 * * *'}
    -- THRESHOLD: {metric:'inventory.below',value:100}
  recipient_strategy   VARCHAR(32)  NOT NULL,
    -- NEXT_APPROVER / ROLE / USER
  recipient_config     jsonb        NOT NULL DEFAULT '{}'::jsonb,
    -- NEXT_APPROVER: {} (从 wf_task 自动取)
    -- ROLE: {role_codes:['ROLE_FARM_MGR']}
    -- USER: {user_ids:[148,42]}
  channels             text[]       NOT NULL DEFAULT ARRAY['STATION']::text[],
    -- ['STATION'] / ['STATION','PUSH']
  template_code        VARCHAR(64)  NOT NULL,
  priority             VARCHAR(16)  NOT NULL DEFAULT 'NORMAL',
    -- LOW / NORMAL / HIGH / URGENT
  dedupe_window_sec    INT          NOT NULL DEFAULT 300,
    -- 5 分钟内同 rule+recipient 合并去重
  status               VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
  remark               TEXT,
  created_by           VARCHAR(80),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_rules_status ON sys_notification_rules (status);
CREATE INDEX IF NOT EXISTS idx_notif_rules_event  ON sys_notification_rules (event_type);
CREATE INDEX IF NOT EXISTS idx_notif_rules_category ON sys_notification_rules (category);
COMMENT ON TABLE sys_notification_rules IS '通知规则配置 — 业务事件/工作流/定时/阈值 → 接收人 + 渠道 + 模板';

-- ── 2. 模板（多语言 + 多渠道） ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sys_notification_templates (
  id                   BIGSERIAL PRIMARY KEY,
  template_code        VARCHAR(64)  NOT NULL,
  locale               VARCHAR(8)   NOT NULL DEFAULT 'zh-CN',
    -- zh-CN / lo-LA / en-US
  channel              VARCHAR(32)  NOT NULL,
    -- STATION / PUSH / EMAIL / SMS / WECHAT / DINGTALK / LARK / WEBHOOK
  title_tmpl           TEXT         NOT NULL,
  content_tmpl         TEXT         NOT NULL,
  variables            jsonb        DEFAULT '{}'::jsonb,
    -- 可用变量声明 {biz_no:{type:'string',desc:'单据号'},...}
  status               VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
  remark               TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_notif_tmpl UNIQUE (template_code, locale, channel)
);
CREATE INDEX IF NOT EXISTS idx_notif_tmpl_code ON sys_notification_templates (template_code);
COMMENT ON TABLE sys_notification_templates IS '通知模板 — 多语言 + 多渠道，Handlebars 语法 {{var}}';

-- ── 3. 渠道全局配置 ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sys_notification_channels (
  channel_code         VARCHAR(32)  PRIMARY KEY,
  channel_name         VARCHAR(64)  NOT NULL,
  enabled              BOOLEAN      NOT NULL DEFAULT false,
  config               jsonb        NOT NULL DEFAULT '{}'::jsonb,
    -- EMAIL: {smtp_host,smtp_port,user,pass_env}
    -- WEBHOOK: {url, headers}
  daily_quota          INT          DEFAULT 10000,
  rate_limit_per_min   INT          DEFAULT 60,
  status               VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
  remark               TEXT,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE sys_notification_channels IS '通知渠道全局开关 + 凭证 + 限额';

-- ── 4. 投递日志 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sys_notification_log (
  id                   BIGSERIAL PRIMARY KEY,
  rule_code            VARCHAR(64),
  template_code        VARCHAR(64),
  recipient_user_id    BIGINT       NOT NULL,
  channel              VARCHAR(32)  NOT NULL,
  trigger_event        jsonb        DEFAULT '{}'::jsonb,
  title                VARCHAR(256),
  content              TEXT,
  status               VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    -- PENDING / SENT / FAILED / SKIPPED / DEDUPED
  attempt_count        INT          NOT NULL DEFAULT 0,
  last_error           TEXT,
  external_message_id  VARCHAR(128),
  dedupe_key           VARCHAR(128),
    -- rule_code + recipient_user_id + content_hash + window
  sent_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_log_user_created ON sys_notification_log (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_status ON sys_notification_log (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_dedupe ON sys_notification_log (dedupe_key, created_at DESC)
  WHERE dedupe_key IS NOT NULL;
COMMENT ON TABLE sys_notification_log IS '通知投递日志 — 每个用户每个渠道一行，可重试';

-- ── 5. 用户订阅偏好（开关） ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sys_user_notification_prefs (
  user_id              BIGINT       NOT NULL,
  category             VARCHAR(64)  NOT NULL,
  channels_opt_in      jsonb        NOT NULL DEFAULT '{"STATION":true,"PUSH":true}'::jsonb,
  enabled              BOOLEAN      NOT NULL DEFAULT true,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);
COMMENT ON TABLE sys_user_notification_prefs IS
  '用户对通知 category 的开关。未配置 = 默认开启所有渠道。';

-- ═══════════════════════════════════════════════════════════════════════════
-- 渠道初始 seed（默认 STATION/PUSH 启用，其它禁用）
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO sys_notification_channels (channel_code, channel_name, enabled, config, remark)
VALUES
  ('STATION',  '站内信',       true,  '{}'::jsonb, '同步写 sys_notifications 表'),
  ('PUSH',     '浏览器/PWA推送', true,  '{}'::jsonb, '复用 sys_push_subscriptions + VAPID'),
  ('EMAIL',    '邮件',         false, '{}'::jsonb, 'P1 阶段实施 — 需配 SMTP'),
  ('SMS',      '短信',         false, '{}'::jsonb, 'P3 阶段 — 需业务方提供网关'),
  ('WECHAT',   '微信公众号',    false, '{}'::jsonb, 'P4 阶段 — 需备案'),
  ('DINGTALK', '钉钉群机器人',  false, '{}'::jsonb, 'P2 阶段 — webhook'),
  ('LARK',     '飞书',         false, '{}'::jsonb, 'P2 阶段'),
  ('WEBHOOK',  '通用 Webhook', false, '{}'::jsonb, 'P5 阶段')
ON CONFLICT (channel_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 示例规则 seed（4 条，覆盖典型场景）
-- ═══════════════════════════════════════════════════════════════════════════

-- R1: 采购申请提交 → 下一步审批人推送
INSERT INTO sys_notification_rules (
  rule_code, rule_name, category, event_type, trigger_config,
  recipient_strategy, recipient_config, channels, template_code, priority, status, remark
) SELECT
  'PR_SUBMITTED_TO_APPROVER', '采购申请提交通知审批人', 'WORKFLOW', 'BIZ_EVENT',
  '{"biz_type":"PR","action":"SUBMIT"}'::jsonb,
  'NEXT_APPROVER', '{}'::jsonb,
  ARRAY['STATION','PUSH']::text[],
  'PR_SUBMITTED', 'NORMAL', 'ACTIVE', '采购申请提交后，自动通知下一步审批人'
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_rules WHERE rule_code='PR_SUBMITTED_TO_APPROVER');

-- R2: 采购订单提交 → 下一步审批人
INSERT INTO sys_notification_rules (
  rule_code, rule_name, category, event_type, trigger_config,
  recipient_strategy, recipient_config, channels, template_code, priority, status, remark
) SELECT
  'PO_SUBMITTED_TO_APPROVER', '采购订单提交通知审批人', 'WORKFLOW', 'BIZ_EVENT',
  '{"biz_type":"PO","action":"SUBMIT"}'::jsonb,
  'NEXT_APPROVER', '{}'::jsonb,
  ARRAY['STATION','PUSH']::text[],
  'PO_SUBMITTED', 'NORMAL', 'ACTIVE', '采购订单提交后通知审批人'
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_rules WHERE rule_code='PO_SUBMITTED_TO_APPROVER');

-- R3: 每日生产日报录入提醒（孟赛生产数据主管）
INSERT INTO sys_notification_rules (
  rule_code, rule_name, category, event_type, trigger_config,
  recipient_strategy, recipient_config, channels, template_code, priority, status, remark
) SELECT
  'DAILY_FARM_REPORT_REMINDER', '每日生产日报录入提醒', 'DAILY_DIGEST', 'SCHEDULE',
  '{"cron":"0 8 * * *"}'::jsonb,
  'ROLE', '{"role_codes":["ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR"]}'::jsonb,
  ARRAY['STATION','PUSH']::text[],
  'DAILY_REPORT_REMINDER', 'NORMAL', 'ACTIVE', '每天上午 8 点提醒孟赛生产数据主管录入昨日生产日报'
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_rules WHERE rule_code='DAILY_FARM_REPORT_REMINDER');

-- R4: 待办任务超时（high priority）
INSERT INTO sys_notification_rules (
  rule_code, rule_name, category, event_type, trigger_config,
  recipient_strategy, recipient_config, channels, template_code, priority, status, remark
) SELECT
  'WF_TASK_OVERDUE_ALERT', '审批任务超时提醒', 'WORKFLOW', 'SCHEDULE',
  '{"cron":"*/30 * * * *","check":"wf_task_overdue"}'::jsonb,
  'NEXT_APPROVER', '{}'::jsonb,
  ARRAY['STATION','PUSH']::text[],
  'WF_OVERDUE', 'HIGH', 'ACTIVE', '每 30 分钟扫一次超时审批任务，提醒当前 assignee'
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_rules WHERE rule_code='WF_TASK_OVERDUE_ALERT');

-- ═══════════════════════════════════════════════════════════════════════════
-- 模板 seed（4 条规则对应 STATION + PUSH 共 8 行；zh-CN）
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO sys_notification_templates (template_code, locale, channel, title_tmpl, content_tmpl, variables, status)
VALUES
  ('PR_SUBMITTED', 'zh-CN', 'STATION',
   '采购申请待审批：{{biz_no}}',
   '提交人 {{submitter_name}} 提交了采购申请 {{biz_no}}（{{subject}}），预计金额 {{amount}} {{currency}}，请审批。',
   '{"biz_no":"申请号","submitter_name":"提交人","subject":"主题","amount":"金额","currency":"币种"}'::jsonb,
   'ACTIVE'),
  ('PR_SUBMITTED', 'zh-CN', 'PUSH',
   '采购申请待审批',
   '{{biz_no}} · {{subject}} · {{amount}} {{currency}}',
   '{"biz_no":"申请号","subject":"主题","amount":"金额","currency":"币种"}'::jsonb,
   'ACTIVE'),
  ('PO_SUBMITTED', 'zh-CN', 'STATION',
   '采购订单待审批：{{biz_no}}',
   '采购员 {{submitter_name}} 提交了采购订单 {{biz_no}}，供应商 {{supplier_name}}，金额 {{amount}} {{currency}}。',
   '{"biz_no":"订单号","submitter_name":"采购员","supplier_name":"供应商","amount":"金额","currency":"币种"}'::jsonb,
   'ACTIVE'),
  ('PO_SUBMITTED', 'zh-CN', 'PUSH',
   '采购订单待审批',
   '{{biz_no}} · {{supplier_name}} · {{amount}} {{currency}}',
   '{"biz_no":"订单号","supplier_name":"供应商","amount":"金额","currency":"币种"}'::jsonb,
   'ACTIVE'),
  ('DAILY_REPORT_REMINDER', 'zh-CN', 'STATION',
   '请录入昨日生产日报',
   '早上好，{{user_name}}。请尽快录入 {{yesterday_date}} 的生产日报（鸡舍存栏 / 死淘 / 产蛋 / 饲料消耗）。',
   '{"user_name":"用户姓名","yesterday_date":"昨日日期"}'::jsonb,
   'ACTIVE'),
  ('DAILY_REPORT_REMINDER', 'zh-CN', 'PUSH',
   '生产日报录入提醒',
   '昨日（{{yesterday_date}}）数据待录入',
   '{"yesterday_date":"昨日日期"}'::jsonb,
   'ACTIVE'),
  ('WF_OVERDUE', 'zh-CN', 'STATION',
   '审批超时：{{biz_no}}',
   '审批任务 {{biz_no}}（{{biz_type}}）已超时 {{overdue_hours}} 小时未处理，请尽快审批。',
   '{"biz_no":"单据号","biz_type":"类型","overdue_hours":"超时小时"}'::jsonb,
   'ACTIVE'),
  ('WF_OVERDUE', 'zh-CN', 'PUSH',
   '审批已超时',
   '{{biz_no}} 超时 {{overdue_hours}}h',
   '{"biz_no":"单据号","overdue_hours":"超时小时"}'::jsonb,
   'ACTIVE')
ON CONFLICT (template_code, locale, channel) DO NOTHING;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 验证 SQL：
--   SELECT count(*) FROM sys_notification_channels;  -- 8
--   SELECT count(*) FROM sys_notification_rules;     -- 4
--   SELECT count(*) FROM sys_notification_templates; -- 8
-- ═══════════════════════════════════════════════════════════════════════════
