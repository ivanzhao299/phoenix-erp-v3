-- ============================================================
-- Shareholder Runtime Phase 3 — 股东资本流引擎 (Capital Flow Engine)
-- 股东资本变化来自业务流/审批流/资金流，不再人工改余额。
--   · 扩 shr_capital_contributions：状态机 + 资本流编号 + 附件 + Workflow + 确认 + 桥接状态
--   · 仅 CONFIRMED 参与汇总（由 CapitalAggregationService 增量维护）
--   · 历史导入数据(东鹏/孟赛/万象)不重算、不覆盖
--   · 新增角色 ROLE_SHAREHOLDER_FINANCE + 菜单 MENU_SHAREHOLDER_CAPITAL
--   · SHAREHOLDER_CAPITAL 分档审批规则(<10万/10-100万/>100万)
-- 幂等：ADD COLUMN IF NOT EXISTS / ON CONFLICT / WHERE NOT EXISTS
-- ============================================================
BEGIN;

-- 1. 资本流字段扩展（状态机/编号/附件/Workflow/确认/桥接）
ALTER TABLE shr_capital_contributions ADD COLUMN IF NOT EXISTS capital_flow_no       VARCHAR(64);
ALTER TABLE shr_capital_contributions ADD COLUMN IF NOT EXISTS attachment_count      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shr_capital_contributions ADD COLUMN IF NOT EXISTS wf_instance_id        BIGINT;
ALTER TABLE shr_capital_contributions ADD COLUMN IF NOT EXISTS confirmed_by          BIGINT;
ALTER TABLE shr_capital_contributions ADD COLUMN IF NOT EXISTS confirmed_at          TIMESTAMPTZ;
ALTER TABLE shr_capital_contributions ADD COLUMN IF NOT EXISTS finance_bridge_status VARCHAR(32) NOT NULL DEFAULT 'READ_ONLY';
ALTER TABLE shr_capital_contributions ADD COLUMN IF NOT EXISTS reversal_of_id        BIGINT;  -- 冲销指向被冲销记录(审计轨迹)
CREATE UNIQUE INDEX IF NOT EXISTS uq_shr_cap_flow_no ON shr_capital_contributions(capital_flow_no) WHERE capital_flow_no IS NOT NULL;

-- 历史导入记录视为已确认到账（confirmed），并标记其确认时间为导入时间
UPDATE shr_capital_contributions SET confirmed_at = COALESCE(confirmed_at, created_at)
WHERE status = 'CONFIRMED' AND confirmed_at IS NULL;

-- 2. 新增角色 ROLE_SHAREHOLDER_FINANCE（股东资金管理员）
INSERT INTO sys_role (role_code, role_name_zh, role_name_lo, role_type, approval_level)
VALUES ('ROLE_SHAREHOLDER_FINANCE', '股东资金管理员', 'ຜູ້ຈັດການເງິນຫຸ້ນສ່ວນ', 'FINANCE', 1)
ON CONFLICT (role_code) DO NOTHING;

-- 3. 菜单 MENU_SHAREHOLDER_CAPITAL + 授权
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, sort_order, route) VALUES
  ('MENU_SHAREHOLDER_CAPITAL', '资本流管理', 'SHAREHOLDER', 608, '/shareholders/capital')
ON CONFLICT (menu_code) DO NOTHING;

INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, v.perms
FROM (VALUES
  ('ROLE_ADMIN','V,C,E,D,A,X'),
  ('ROLE_SHAREHOLDER_FINANCE','V,C,E,X'),   -- 录入/查看/编辑/导出
  ('ROLE_HQ_FINANCE','V,C,E,A,X'),          -- 财务审核
  ('ROLE_GROUP_FINANCE','V,A,X'),           -- 审核（若该角色存在）
  ('ROLE_CEO','V,A,X'),                     -- 批准
  ('ROLE_AUDITOR','V,X')
) AS v(role_code, perms)
JOIN sys_role r ON r.role_code = v.role_code
JOIN sys_menu m ON m.menu_code = 'MENU_SHAREHOLDER_CAPITAL'
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- 4. SHAREHOLDER_CAPITAL 分档审批规则 + 步骤
--    <10万：财务审核；10-100万：财务审核→项目负责人；>100万：财务审核→项目负责人→CEO
INSERT INTO wf_approval_rules (rule_code, module_code, biz_type, min_amount, max_amount, approval_mode, enabled, priority, remark)
VALUES
  ('SHR-CAP-T1', 'MENU_SHAREHOLDER_CAPITAL', 'SHAREHOLDER_CAPITAL', 0,          100000,   'SEQUENTIAL', true, 10, '股东资本流<10万：财务审核'),
  ('SHR-CAP-T2', 'MENU_SHAREHOLDER_CAPITAL', 'SHAREHOLDER_CAPITAL', 100000.01,  1000000,  'SEQUENTIAL', true, 20, '股东资本流10-100万：财务审核+项目负责人'),
  ('SHR-CAP-T3', 'MENU_SHAREHOLDER_CAPITAL', 'SHAREHOLDER_CAPITAL', 1000000.01, NULL,     'SEQUENTIAL', true, 30, '股东资本流>100万：财务审核+项目负责人+CEO')
ON CONFLICT (rule_code) DO NOTHING;

-- 步骤（approver_type=ROLE）
INSERT INTO wf_approval_rule_steps (rule_id, step_no, approver_type, approver_role, required_approval_count)
SELECT r.id, v.step_no, 'ROLE', v.role, 1
FROM (VALUES
  ('SHR-CAP-T1', 1, 'ROLE_HQ_FINANCE'),
  ('SHR-CAP-T2', 1, 'ROLE_HQ_FINANCE'), ('SHR-CAP-T2', 2, 'ROLE_FARM_MGR'),
  ('SHR-CAP-T3', 1, 'ROLE_HQ_FINANCE'), ('SHR-CAP-T3', 2, 'ROLE_FARM_MGR'), ('SHR-CAP-T3', 3, 'ROLE_CEO')
) AS v(rule_code, step_no, role)
JOIN wf_approval_rules r ON r.rule_code = v.rule_code
WHERE NOT EXISTS (
  SELECT 1 FROM wf_approval_rule_steps s WHERE s.rule_id = r.id AND s.step_no = v.step_no
);

COMMIT;
