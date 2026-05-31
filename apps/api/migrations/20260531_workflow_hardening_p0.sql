-- ============================================================
-- Workflow Hardening P0 — 审批 fail-safe 危险开关配置种子
-- 幂等：ON CONFLICT (config_key) DO NOTHING，不覆盖已有值
--
-- workflow.fail_open_enabled：是否允许「无审批规则时自动通过」(fail-open)
--   · 默认 'false' = fail-safe：无规则/无步骤时禁止自动批准、禁止提交
--   · ⚠ 危险开关：仅 ADMIN/SYSOPS 可显式置 'true' 临时放行，生产环境严禁开启
--   · 引擎代码默认即 fail-safe，本行仅为让该开关在配置中心可见可管
-- ============================================================
INSERT INTO sys_configs
  (config_group, config_key, config_value, value_type, description, is_encrypted, is_readonly, created_by)
VALUES
  ('workflow', 'workflow.fail_open_enabled', 'false', 'boolean',
   '⚠危险开关：是否允许无审批规则时自动通过(fail-open)。默认false=fail-safe，无规则则禁止提交并提示配置规则。生产环境严禁开启。',
   false, false, 'system')
ON CONFLICT (config_key) DO NOTHING;
