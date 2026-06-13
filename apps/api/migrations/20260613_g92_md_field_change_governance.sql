-- ════════════════════════════════════════════════════════════════════════
-- G92 主数据治理分层 — 字段级变更审批（2026-06-13，用户拍板：类型级+字段级本轮都做）
-- ────────────────────────────────────────────────────────────────────────
-- 背景：原 update() 所有字段编辑都直接落库、毫无审批。G92 引入「关键字段编辑走审批、
--   扩展字段编辑免审批」。关键字段变更不直接改主表，而是落入本表 md_change_requests，
--   启动 MD_FIELD_CHANGE 审批；通过后由 WorkflowBizRegistry.onApproved 把暂存的 JSON 变更
--   应用回主表——原记录在通过前保持 ACTIVE 可被引用（不像「主表 status 转 PENDING」会临时下线）。
--
-- 引擎契约：审批末步 → updateBizStatus(`UPDATE md_change_requests SET status, updated_at WHERE id`)
--   + onApproved(bizId=md_change_requests.id)。故本表必须含 id/status/updated_at。
-- 全部幂等：CREATE TABLE IF NOT EXISTS / ON CONFLICT / WHERE NOT EXISTS。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ① 变更请求台账 ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS md_change_requests (
  id              BIGSERIAL    PRIMARY KEY,
  md_type         VARCHAR(40)  NOT NULL,           -- runtime type（customer/supplier/...）
  object_type     VARCHAR(40)  NOT NULL,           -- 审计 object_type（CUSTOMER/...）
  object_code     VARCHAR(80)  NOT NULL,           -- 主数据编码
  target_table    VARCHAR(80)  NOT NULL,           -- 应用变更的目标表（服务端 TYPES 白名单）
  code_col        VARCHAR(80)  NOT NULL,           -- 目标表编码列
  changes         JSONB        NOT NULL,           -- 待生效的关键字段变更 {col: newVal}
  before_snapshot JSONB,                           -- 变更前关键字段原值（留痕/可回看）
  status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',  -- PENDING→APPROVED/REJECTED（引擎回写）
  applied_at      TIMESTAMPTZ,                     -- onApproved 应用变更的时刻（幂等护栏）
  requested_by    VARCHAR(80),                     -- 提交人
  reason          TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_md_change_req_object   ON md_change_requests (object_type, object_code);
CREATE INDEX IF NOT EXISTS idx_md_change_req_status   ON md_change_requests (status);

-- ② 审批规则（统一一条链；按 biz_type 选链，所有类型关键字段变更共用）─────────────
INSERT INTO wf_approval_rules
  (rule_code, module_code, biz_type, min_amount, max_amount, approval_mode, enabled, priority, remark)
VALUES
  ('MD-FIELD-CHANGE-STD', 'MENU_MASTER_DATA', 'MD_FIELD_CHANGE', 0, NULL, 'SEQUENTIAL', true, 5,
   '主数据关键字段变更审批：主数据审批人（生产可按公司/类型拆分多链）')
ON CONFLICT (rule_code) DO NOTHING;

-- ③ 审批步骤（1 步：ROLE_MASTER_DATA_APPROVER，与新增审批同审批人）───────────────
INSERT INTO wf_approval_rule_steps
  (rule_id, step_no, approver_type, approver_role, required_approval_count, sla_hours)
SELECT r.id, 1, 'ROLE', 'ROLE_MASTER_DATA_APPROVER', 1, 48
FROM wf_approval_rules r
WHERE r.rule_code = 'MD-FIELD-CHANGE-STD'
  AND NOT EXISTS (SELECT 1 FROM wf_approval_rule_steps s WHERE s.rule_id = r.id AND s.step_no = 1);

COMMIT;
