-- ════════════════════════════════════════════════════════════════════════════
-- UAT-P0 Phase 1 · wf_approval_rules 种子（11 个新 MD_*_CREATE）
-- ════════════════════════════════════════════════════════════════════════════
-- 目标：补齐 G5.5-C / G5.5-D 引入但未配审批规则的 11 类主数据 bizType。
-- 模板与已有 5 个 MD_*_CREATE 一致：单步 / ROLE_MASTER_DATA_APPROVER / 48h SLA。
-- 幂等：ON CONFLICT DO NOTHING（rule_code 是唯一键候选；用 NOT EXISTS 防重复）。
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_rule_id BIGINT;
  v_biz TEXT;
  v_module TEXT;
  v_code   TEXT;
  bizs TEXT[] := ARRAY[
    'MD_PRODUCT_CREATE','MD_STORE_CREATE','MD_SKU_CREATE','MD_WAREHOUSE_CREATE',
    'MD_GRADE_CREATE','MD_SPEC_CREATE','MD_DRIVER_CREATE','MD_VEHICLE_CREATE',
    'MD_ORGANIZATION_CREATE','MD_COMPANY_CREATE','MD_DICT_CREATE'
  ];
  codes TEXT[] := ARRAY[
    'MD-PRODUCT-STD','MD-STORE-STD','MD-SKU-STD','MD-WAREHOUSE-STD',
    'MD-GRADE-STD','MD-SPEC-STD','MD-DRIVER-STD','MD-VEHICLE-STD',
    'MD-ORG-STD','MD-COMPANY-STD','MD-DICT-STD'
  ];
BEGIN
  FOR i IN 1..array_length(bizs,1) LOOP
    v_biz := bizs[i];
    v_code := codes[i];
    v_module := 'MENU_MASTER_DATA';

    -- 1) 写规则（幂等）
    IF NOT EXISTS (SELECT 1 FROM wf_approval_rules WHERE biz_type=v_biz AND rule_code=v_code) THEN
      INSERT INTO wf_approval_rules
        (rule_code, module_code, biz_type, approval_mode, enabled, priority, remark, created_at)
      VALUES
        (v_code, v_module, v_biz, 'SEQUENTIAL', TRUE, 100,
         'UAT-P0 Phase1 自动生成 — 单步审批，48h SLA，ROLE_MASTER_DATA_APPROVER',
         NOW())
      RETURNING id INTO v_rule_id;

      -- 2) 写步骤（单步）
      INSERT INTO wf_approval_rule_steps
        (rule_id, step_no, approver_type, approver_role, required_approval_count,
         allow_admin_override, sla_hours, reminder_interval_hours, max_reminders,
         escalation_enabled, created_at)
      VALUES
        (v_rule_id, 1, 'ROLE', 'ROLE_MASTER_DATA_APPROVER', 1,
         TRUE, 48, 12, 3,
         FALSE, NOW());
    END IF;
  END LOOP;
END $$;

-- 摘要
SELECT biz_type, rule_code, enabled FROM wf_approval_rules WHERE biz_type LIKE 'MD_%' ORDER BY biz_type;
