-- ════════════════════════════════════════════════════════════════════════
-- G3-B 主数据审批运行体系 — 审批规则 seed + 审批人角色授予
-- ────────────────────────────────────────────────────────────────────────
-- 为 5 类主数据新增审批配置 Workflow 审批规则（wf_approval_rules + steps）。
-- 审批通过 → ApprovalEngine 自动置 status=ACTIVE；拒绝 → REJECTED。
-- 全部幂等：ON CONFLICT(rule_code) / WHERE NOT EXISTS。
-- ⚠️ 审批规则按 G0 蓝图设计；初始统一由 ROLE_MASTER_DATA_APPROVER 审批，
--    生产可在「审批规则」页配置多级链（采购主管→财务总监→CEO 等）。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ① 审批规则（5 类主数据，无金额条件，统一顺序审批）─────────────────────────
INSERT INTO wf_approval_rules
  (rule_code, module_code, biz_type, min_amount, max_amount, approval_mode, enabled, priority, remark)
VALUES
  ('MD-CUSTOMER-STD',     'MENU_MASTER_DATA',     'MD_CUSTOMER_CREATE',     0, NULL, 'SEQUENTIAL', true, 5, '客户新增审批：主数据审批人'),
  ('MD-SUPPLIER-STD',     'MENU_MASTER_DATA',     'MD_SUPPLIER_CREATE',     0, NULL, 'SEQUENTIAL', true, 5, '供应商新增审批：主数据审批人'),
  ('MD-PROJECT-STD',      'MENU_MASTER_DATA',     'MD_PROJECT_CREATE',      0, NULL, 'SEQUENTIAL', true, 5, '项目公司新增审批：主数据审批人'),
  ('MD-CASH-ACCOUNT-STD', 'MENU_MD_BANK_ACCOUNT', 'MD_CASH_ACCOUNT_CREATE', 0, NULL, 'SEQUENTIAL', true, 5, '资金账户新增审批：主数据审批人'),
  ('MD-BANK-ACCOUNT-STD', 'MENU_MD_BANK_ACCOUNT', 'MD_BANK_ACCOUNT_CREATE', 0, NULL, 'SEQUENTIAL', true, 5, '银行账户新增审批：主数据审批人')
ON CONFLICT (rule_code) DO NOTHING;

-- ② 审批步骤（1 步：ROLE_MASTER_DATA_APPROVER）─────────────────────────────
INSERT INTO wf_approval_rule_steps
  (rule_id, step_no, approver_type, approver_role, required_approval_count, sla_hours)
SELECT r.id, 1, 'ROLE', 'ROLE_MASTER_DATA_APPROVER', 1, 48
FROM wf_approval_rules r
WHERE r.rule_code IN ('MD-CUSTOMER-STD','MD-SUPPLIER-STD','MD-PROJECT-STD','MD-CASH-ACCOUNT-STD','MD-BANK-ACCOUNT-STD')
  AND NOT EXISTS (SELECT 1 FROM wf_approval_rule_steps s WHERE s.rule_id = r.id AND s.step_no = 1);

-- ③ 授予超级管理员 ROLE_MASTER_DATA_APPROVER（保证初始至少一名审批人）──────
--    生产应将此角色授予真实审批人（财务总监/CEO），admin 仅作兜底。
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, FALSE, NOW()
FROM sys_user u, sys_role r
WHERE u.username = 'admin' AND r.role_code = 'ROLE_MASTER_DATA_APPROVER'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ④ 主数据待审批菜单 ───────────────────────────────────────────────────────
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, parent_code, sort_order, icon, route) VALUES
  ('MENU_MD_PENDING', '主数据待审批', 'MASTER', 'MENU_MASTER_DATA', 740, 'clock', '/master-data/pending')
ON CONFLICT (menu_code) DO NOTHING;

COMMIT;
