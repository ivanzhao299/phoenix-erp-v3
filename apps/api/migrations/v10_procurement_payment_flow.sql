-- v10: 采购付款流程打通 — 合同字段 / 付款凭证字段 / 索引
-- 执行日期：2026-05-23
-- 涉及变更：
--   1. prc_purchase_orders 追加：合同编号、合同摘要、付款截止日
--   2. fin_transactions     追加：银行流水号、付款备注、关联PO单号
--   3. 新增 idx_fin_txn_po_no 索引，加速待付款查询

-- ── 1. 采购订单：补充合同与付款信息字段 ─────────────────────────────────────────

ALTER TABLE prc_purchase_orders
  ADD COLUMN IF NOT EXISTS contract_no   VARCHAR(128),   -- 合同编号（对应纸质/电子合同）
  ADD COLUMN IF NOT EXISTS contract_note TEXT,           -- 合同关键条款摘要
  ADD COLUMN IF NOT EXISTS pay_deadline  DATE;           -- 付款截止日

-- ── 2. 财务流水：补充付款凭证字段 ────────────────────────────────────────────────

ALTER TABLE fin_transactions
  ADD COLUMN IF NOT EXISTS payment_ref   VARCHAR(128),   -- 银行流水号 / 支付宝单号 / 凭证号
  ADD COLUMN IF NOT EXISTS payment_proof TEXT,           -- 付款备注（替代截图）
  ADD COLUMN IF NOT EXISTS po_no         VARCHAR(64);    -- 关联采购单号（非空表示由PO批准触发）

-- ── 3. 索引 ───────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fin_txn_po_no ON fin_transactions(po_no);
