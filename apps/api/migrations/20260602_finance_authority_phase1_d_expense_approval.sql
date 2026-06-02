-- ════════════════════════════════════════════════════════════════════════
-- Finance Authority Reconstruction Phase 1 — D. 费用报销审批流重构（审核/付款分离）
-- ────────────────────────────────────────────────────────────────────────
-- 目标审批链（EXPENSE_REQUEST）：
--   申请人 → 业务负责人(ORG_MANAGER) → 财务审核经理(ROLE_FINANCE_REVIEW_MANAGER)
--          → 资金经理(ROLE_TREASURY_MANAGER) → 完成
--   职责彻底分离：刘杰负责审核(A)，王玮华/朱召安负责付款(E)，审核人 ≠ 付款人。
--
-- 重构策略：新增规则 EXP-RECON-STD（全额 0~∞，priority=5 最高优先），覆盖旧规则；
--   旧 EXPENSE_REQUEST 规则保留兼容（priority 较大，不再优先命中）。
--
-- 幂等：规则 ON CONFLICT(rule_code) DO NOTHING；步骤 WHERE NOT EXISTS。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 审批规则（最高优先，覆盖全额）─────────────────────────────────────
INSERT INTO wf_approval_rules
  (rule_code, module_code, biz_type, min_amount, max_amount, approval_mode, enabled, priority, remark)
VALUES
  ('EXP-RECON-STD', 'MENU_FIN2_EXPENSE', 'EXPENSE_REQUEST', 0, NULL, 'SEQUENTIAL', true, 5,
   '费用报销标准流(岗位驱动)：业务负责人→财务审核经理→资金经理；审核付款分离')
ON CONFLICT (rule_code) DO NOTHING;

-- ── 2. 审批步骤：业务负责人 → 财务审核经理 → 资金经理 ─────────────────────
INSERT INTO wf_approval_rule_steps
  (rule_id, step_no, approver_type, approver_role, required_approval_count, sla_hours)
SELECT r.id, v.step_no, v.approver_type, v.approver_role, 1, 48
FROM (VALUES
  (1, 'ORG_MANAGER', NULL),                            -- 业务负责人（申请人所属组织负责人，动态解析）
  (2, 'ROLE',        'ROLE_FINANCE_REVIEW_MANAGER'),   -- 财务审核经理（刘杰）— 审核人
  (3, 'ROLE',        'ROLE_TREASURY_MANAGER')          -- 资金经理（王玮华/朱召安）— 付款人
) AS v(step_no, approver_type, approver_role)
JOIN wf_approval_rules r ON r.rule_code = 'EXP-RECON-STD'
WHERE NOT EXISTS (
  SELECT 1 FROM wf_approval_rule_steps s WHERE s.rule_id = r.id AND s.step_no = v.step_no
);

COMMIT;
