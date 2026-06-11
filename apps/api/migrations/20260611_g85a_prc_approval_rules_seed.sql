-- ════════════════════════════════════════════════════════════════════════
-- G85-A 采购审批规则种子 — 解除「提交审批即报错（未配置审批规则）」P0 阻断
-- ────────────────────────────────────────────────────────────────────────
-- 背景：新审批引擎按 wf_approval_rules.biz_type 选链；采购提交时传 PR/PO/PAYMENT，
--      但此前无对应规则 + fail_open=false → startApproval 抛错，单据卡在提交。
-- 链路依据：业务已记录的采购订单审批链（ddl/02_init_data.sql 旧矩阵）：
--      ≤5万 采购员→区域督导；>5万 再加总裁（CEO）。付款链为财务默认。
-- ⚠️ 这是**默认链**，上线后可在「审批规则」页按实际制度调整（阈值/审批角色）。
-- 幂等：规则 ON CONFLICT(rule_code) DO NOTHING；步骤 WHERE NOT EXISTS。
-- ════════════════════════════════════════════════════════════════════════

-- ① 规则头 ────────────────────────────────────────────────────────────────
INSERT INTO wf_approval_rules
  (rule_code, module_code, biz_type, min_amount, max_amount, approval_mode, enabled, priority, remark)
VALUES
  ('PRC2_PR_STD',       'MENU_PRC2_ORDER',   'PR',      0,        NULL,     'SEQUENTIAL', TRUE, 100, '采购申请-标准链'),
  ('PRC2_PO_LE50K',     'MENU_PRC2_ORDER',   'PO',      0,        50000,    'SEQUENTIAL', TRUE, 10,  '采购订单 ≤5万'),
  ('PRC2_PO_GT50K',     'MENU_PRC2_ORDER',   'PO',      50000.01, NULL,     'SEQUENTIAL', TRUE, 10,  '采购订单 >5万'),
  ('PRC2_PAY_LE50K',    'MENU_PRC2_PAYMENT', 'PAYMENT', 0,        50000,    'SEQUENTIAL', TRUE, 10,  '付款 ≤5万'),
  ('PRC2_PAY_GT50K',    'MENU_PRC2_PAYMENT', 'PAYMENT', 50000.01, NULL,     'SEQUENTIAL', TRUE, 10,  '付款 >5万')
ON CONFLICT (rule_code) DO NOTHING;

-- ② 规则步骤（按 rule_code 关联 rule_id，幂等 NOT EXISTS）────────────────────
INSERT INTO wf_approval_rule_steps
  (rule_id, step_no, approver_type, approver_role, required_approval_count, sla_hours)
SELECT r.id, v.step_no, 'ROLE', v.approver_role, 1, 48
FROM (VALUES
  -- 采购申请
  ('PRC2_PR_STD',    1, 'ROLE_PRC_BUYER'),
  ('PRC2_PR_STD',    2, 'ROLE_REGION_MGR'),
  -- 采购订单 ≤5万
  ('PRC2_PO_LE50K',  1, 'ROLE_PRC_BUYER'),
  ('PRC2_PO_LE50K',  2, 'ROLE_REGION_MGR'),
  -- 采购订单 >5万
  ('PRC2_PO_GT50K',  1, 'ROLE_PRC_BUYER'),
  ('PRC2_PO_GT50K',  2, 'ROLE_REGION_MGR'),
  ('PRC2_PO_GT50K',  3, 'ROLE_CEO'),
  -- 付款 ≤5万
  ('PRC2_PAY_LE50K', 1, 'ROLE_FIN_ACCT'),
  -- 付款 >5万
  ('PRC2_PAY_GT50K', 1, 'ROLE_FIN_ACCT'),
  ('PRC2_PAY_GT50K', 2, 'ROLE_FIN_CFO')
) AS v(rule_code, step_no, approver_role)
JOIN wf_approval_rules r ON r.rule_code = v.rule_code
WHERE NOT EXISTS (
  SELECT 1 FROM wf_approval_rule_steps s WHERE s.rule_id = r.id AND s.step_no = v.step_no
);
