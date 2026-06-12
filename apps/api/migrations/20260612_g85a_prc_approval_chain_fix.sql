-- ════════════════════════════════════════════════════════════════════════
-- G85-A 采购审批链修正 — 按业务确认的实际审批人重设步骤
-- ────────────────────────────────────────────────────────────────────────
-- 背景：20260611 种子按旧文档填了 采购员→区域督导(→CEO)，但 UAT 实证：
--   ① 审核人 songlei 实际持有 ROLE_FACTORY_MGR（无人持有 ROLE_REGION_MGR → step2 必卡死）
--   ② 业务确认不要「采购员自审」一步
-- 新链（业务已确认）：
--   采购申请 PR：审核人(ROLE_FACTORY_MGR)
--   采购订单 PO ≤5万：审核人；>5万：审核人 → 总裁(ROLE_CEO)
--   付款 PAYMENT（全额度）：审核人 → 总裁
-- 幂等：先清这 5 条规则的旧步骤再插入（重复执行终态一致）。
-- 在途实例不受影响（实例步骤为创建时快照）。
-- ════════════════════════════════════════════════════════════════════════

-- ① 清旧步骤（仅限本批 5 条规则）
DELETE FROM wf_approval_rule_steps
WHERE rule_id IN (
  SELECT id FROM wf_approval_rules
  WHERE rule_code IN ('PRC2_PR_STD','PRC2_PO_LE50K','PRC2_PO_GT50K','PRC2_PAY_LE50K','PRC2_PAY_GT50K')
);

-- ② 插入确认后的链
INSERT INTO wf_approval_rule_steps
  (rule_id, step_no, approver_type, approver_role, required_approval_count, sla_hours)
SELECT r.id, v.step_no, 'ROLE', v.approver_role, 1, 48
FROM (VALUES
  ('PRC2_PR_STD',    1, 'ROLE_FACTORY_MGR'),
  ('PRC2_PO_LE50K',  1, 'ROLE_FACTORY_MGR'),
  ('PRC2_PO_GT50K',  1, 'ROLE_FACTORY_MGR'),
  ('PRC2_PO_GT50K',  2, 'ROLE_CEO'),
  ('PRC2_PAY_LE50K', 1, 'ROLE_FACTORY_MGR'),
  ('PRC2_PAY_LE50K', 2, 'ROLE_CEO'),
  ('PRC2_PAY_GT50K', 1, 'ROLE_FACTORY_MGR'),
  ('PRC2_PAY_GT50K', 2, 'ROLE_CEO')
) AS v(rule_code, step_no, approver_role)
JOIN wf_approval_rules r ON r.rule_code = v.rule_code;
