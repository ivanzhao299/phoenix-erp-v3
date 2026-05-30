-- ============================================================
-- Phoenix ERP V3 — Phase R2 Config Governance
-- 补齐业务配置项种子：CREDIT / SLA / INVENTORY / DELIVERY / SALES / ALERT
-- 幂等：INSERT ... ON CONFLICT DO NOTHING（不覆盖用户已修改的值）
-- ============================================================

-- ── CREDIT 信用控制 ─────────────────────────────────────────
INSERT INTO sys_configs
  (config_group, config_key, config_value, value_type, description, is_readonly, created_by)
VALUES
  ('CREDIT', 'credit.warning_ratio',       '0.8',  'FLOAT',   '信用预警比例（已用额度/信用额度 ≥ 此值触发 WARNING 状态，默认 80%）', false, 'SYSTEM'),
  ('CREDIT', 'credit.over_limit_ratio',    '1.0',  'FLOAT',   '信用超额比例（已用额度/信用额度 ≥ 此值触发 OVER_LIMIT 状态，默认 100%）', false, 'SYSTEM'),
  ('CREDIT', 'credit.auto_freeze_days',    '60',   'INT',     '未配置账期客户的自动冻结逾期天数阈值（默认 60 天，有账期时取 账期×freeze_multiplier）', false, 'SYSTEM'),
  ('CREDIT', 'credit.freeze_multiplier',   '2',    'INT',     '有账期客户的冻结倍数（逾期天数 > 账期 × 此值时自动冻结）', false, 'SYSTEM'),
  ('CREDIT', 'credit.ar_aging_buckets',    '[0,30,60,90,180]', 'JSON', '应收账款账龄分桶（天数节点，用于账龄报表分组）', false, 'SYSTEM')
ON CONFLICT (config_key) DO NOTHING;

-- ── SLA 审批时效 ────────────────────────────────────────────
INSERT INTO sys_configs
  (config_group, config_key, config_value, value_type, description, is_readonly, created_by)
VALUES
  ('SLA', 'sla.default_hours',              '48',  'INT',  '审批步骤默认 SLA 时限（小时，规则未配置时使用此全局默认值）', false, 'SYSTEM'),
  ('SLA', 'sla.reminder_interval_minutes',  '720', 'INT',  '审批超时提醒间隔（分钟，默认 720 = 12 小时）', false, 'SYSTEM'),
  ('SLA', 'sla.max_reminder_count',         '3',   'INT',  '审批超时最大提醒次数（达到后停止提醒）', false, 'SYSTEM'),
  ('SLA', 'sla.escalation_enabled',         'false','BOOL','审批逾期升级总开关（true=启用自动升级）', false, 'SYSTEM'),
  ('SLA', 'sla.escalation_after_hours',     '72',  'INT',  '审批逾期多少小时后触发升级（需 escalation_enabled=true）', false, 'SYSTEM')
ON CONFLICT (config_key) DO NOTHING;

-- ── INVENTORY 库存预警 ──────────────────────────────────────
INSERT INTO sys_configs
  (config_group, config_key, config_value, value_type, description, is_readonly, created_by)
VALUES
  ('INVENTORY', 'inventory.expiring_warn_days', '7',    'INT',   '临期库存预警阈值（距过期 ≤ N 天触发 WARNING 通知，默认 7 天）', false, 'SYSTEM'),
  ('INVENTORY', 'inventory.urgent_warn_days',   '3',    'INT',   '临期库存紧急预警阈值（距过期 ≤ N 天触发 URGENT 通知，默认 3 天）', false, 'SYSTEM'),
  ('INVENTORY', 'inventory.loss_warning_ratio', '0.03', 'FLOAT', '库存损耗预警比例（损耗/入库 ≥ 此值触发告警，默认 3%）', false, 'SYSTEM'),
  ('INVENTORY', 'inventory.low_stock_days',     '3',    'INT',   '低库存预警天数（预估销售天数 ≤ N 天触发低库存告警）', false, 'SYSTEM')
ON CONFLICT (config_key) DO NOTHING;

-- ── DELIVERY 配送时效 ────────────────────────────────────────
INSERT INTO sys_configs
  (config_group, config_key, config_value, value_type, description, is_readonly, created_by)
VALUES
  ('DELIVERY', 'delivery.sla_hours',            '24',   'INT',  '配送超时 SLA 阈值（小时，派送后超过此值未完成触发超时告警）', false, 'SYSTEM'),
  ('DELIVERY', 'delivery.timeout_alert_enabled', 'true', 'BOOL', '配送超时告警总开关（true=启用，false=关闭所有配送超时告警）', false, 'SYSTEM')
ON CONFLICT (config_key) DO NOTHING;

-- ── SALES 销售配置 ───────────────────────────────────────────
INSERT INTO sys_configs
  (config_group, config_key, config_value, value_type, description, is_readonly, created_by)
VALUES
  ('SALES', 'sales.below_floor_approval_required', 'true',  'BOOL',  '低于底价是否强制触发审批（true=低于底价必须审批，false=仅记录）', false, 'SYSTEM'),
  ('SALES', 'sales.price_deviation_warn_ratio',    '0.05',  'FLOAT', '价格偏离预警比例（实际价格偏离基准价超过此比例时记录警告，默认 5%）', false, 'SYSTEM'),
  ('SALES', 'sales.max_discount_ratio',            '0.7',   'FLOAT', '最大折扣比例（低于底价 × 此比例需总经理审批，默认 70%）', false, 'SYSTEM')
ON CONFLICT (config_key) DO NOTHING;

-- ── ALERT 系统告警 ───────────────────────────────────────────
INSERT INTO sys_configs
  (config_group, config_key, config_value, value_type, description, is_readonly, created_by)
VALUES
  ('ALERT', 'alert.500_error_threshold_1h', '10',   'INT',  '1小时内 500 错误数超过此阈值触发严重告警（默认 10）', false, 'SYSTEM'),
  ('ALERT', 'alert.critical_enabled',       'true', 'BOOL', '严重级别告警总开关', false, 'SYSTEM'),
  ('ALERT', 'alert.notify_admin_on_freeze', 'true', 'BOOL', '客户自动冻结时是否通知管理员', false, 'SYSTEM')
ON CONFLICT (config_key) DO NOTHING;

-- ── 更新原有 SLA 配置（注释标记，保持原值不变）─────────────────
-- 原有 sla.reminder_interval_hours 已存在，Phase R2 补充了更细粒度的 minutes 版本
-- 原有 credit.freeze_overdue_days 保留（用于历史账龄计算）
-- 两者并存，业务代码优先读新 key

-- ── 验证 ────────────────────────────────────────────────────
DO $$
DECLARE
  cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM sys_configs WHERE config_group IN ('CREDIT','SLA','INVENTORY','DELIVERY','SALES','ALERT');
  RAISE NOTICE '[Phase R2 Config Governance] sys_configs total CREDIT/SLA/INVENTORY/DELIVERY/SALES/ALERT rows: %', cnt;
END $$;
