-- ════════════════════════════════════════════════════════════════════════
-- G137 审批超级兜底：ROLE_ADMIN(老板/超管)可 override 审批任意步骤 2026-06-15
-- 背景（真实业务暴露）：万象装修 PO(≤5万)按规则派给审核人 ROLE_FACTORY_MGR(宋雷等)，
--   赵永伟(ROLE_ADMIN/CEO 老板)的待办为空、批不了，也找不到入口。审批引擎本有 per-step
--   allow_admin_override 开关(validateApprover 认它放行 ADMIN)，但无任何规则步骤启用 → 老板无法兜底。
-- 方案：给**除 MD_FIELD_CHANGE 外**的所有审批步骤开 allow_admin_override。
--   · 保留 G126 SoD：MD_FIELD_CHANGE(财务敏感主数据)仍禁 admin 自批。
--   · 正常审批链不变(宋雷仍审 ≤5万 PO)；ROLE_ADMIN 仅作兜底/越级可批可看。
-- 同时刷新**现存 PENDING 实例步骤**(救活当前卡住的单)。幂等：仅改 false→true。
-- ════════════════════════════════════════════════════════════════════════

-- ① 规则步骤（影响未来新建实例）
UPDATE wf_approval_rule_steps rs
   SET allow_admin_override = true
  FROM wf_approval_rules r
 WHERE r.id = rs.rule_id
   AND r.biz_type <> 'MD_FIELD_CHANGE'
   AND COALESCE(rs.allow_admin_override, false) = false;

-- ② 现存待批实例步骤（解卡已提交但卡住的单，如万象装修 PO）
UPDATE wf_approval_instance_steps s
   SET allow_admin_override = true
  FROM wf_approval_instances i
 WHERE i.id = s.instance_id
   AND i.biz_type <> 'MD_FIELD_CHANGE'
   AND s.status = 'PENDING'
   AND COALESCE(s.allow_admin_override, false) = false;
