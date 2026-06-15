-- ════════════════════════════════════════════════════════════════════════
-- G135 去掉采购订单 contract_no 唯一约束 2026-06-15
-- 问题（真实业务暴露）：万象总部装修一份合同(装饰装修工程合同)由凤凰农业+凤凰食品各承担一半
--   → 拆成两张采购订单、共用同一 contract_no。但 prc2_purchase_orders.contract_no 有 UNIQUE
--   约束 → 第二张 PO 撞 23505 → all-exceptions.filter 报"数据已存在，请勿重复提交"→ 保存失败。
-- 修复：一份合同本就能对应多张采购订单（分公司承担 / 分期采购 / 框架合同多次下单），
--   contract_no 不应唯一。删除该唯一约束（保留普通列，仍可填合同号便于检索）。
-- 幂等：IF EXISTS。
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE prc2_purchase_orders
  DROP CONSTRAINT IF EXISTS prc2_purchase_orders_contract_no_key;

-- 便于按合同号检索，补一个**非唯一**索引（幂等）。
CREATE INDEX IF NOT EXISTS idx_prc2_po_contract_no
  ON prc2_purchase_orders (contract_no);
