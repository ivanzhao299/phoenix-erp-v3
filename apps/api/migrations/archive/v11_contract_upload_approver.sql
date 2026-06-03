-- v11: 合同编号序列 / 合同文件URL / 审批人字段
-- 执行日期：2026-05-23
-- 涉及变更：
--   1. 新建 prc_contract_no_seq — 全局原子递增序列，防并发重号
--   2. prc_purchase_orders 追加：contract_url、approver_id、approver_name

-- ── 1. 合同编号序列（幂等）────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS prc_contract_no_seq START 1;

-- ── 2. 采购订单：合同文件路径 + 审批人字段 ────────────────────────────────────

ALTER TABLE prc_purchase_orders
  ADD COLUMN IF NOT EXISTS contract_url   TEXT,            -- 合同/单据文件路径
  ADD COLUMN IF NOT EXISTS approver_id    INTEGER,         -- 指定审批人 user_id
  ADD COLUMN IF NOT EXISTS approver_name  VARCHAR(64);     -- 审批人姓名快照
