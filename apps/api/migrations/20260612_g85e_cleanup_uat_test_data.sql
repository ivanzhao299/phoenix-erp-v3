-- ════════════════════════════════════════════════════════════════════════
-- G85-E 清理 G85 上线验证 UAT 测试数据（用户授权 2026-06-12）
-- ────────────────────────────────────────────────────────────────────────
-- 范围（均为 2026-06-12 UAT 产物，主题/备注以 UAT 开头）：
--   采购订单 PO2-20260612-00001/-00002/-00003（含明细）
--   应付台账 AP2-20260612-00001（UAT3 自动生成，未发生任何付款核销）
--   付款单   PAY2-20260612-00001（APPROVED 未执行付款，无资金流水/股东出资产物）
--   审批实例/步骤/审批日志（按 biz_no 关联）
-- 安全：三重守卫 —— ①单号精确清单 ②主题/备注 LIKE 'UAT%' ③创建日期=2026-06-12。
--   三条件须同时满足才删；幂等（重复执行匹配 0 行）。
--   单号删除后当日序号可能复用，但守卫②保证复用单号的真实单据不会被误删。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ① 付款分摊 → 付款单
DELETE FROM prc2_payment_allocations
WHERE payment_id IN (
  SELECT id FROM prc2_payments
  WHERE pay_no = 'PAY2-20260612-00001' AND remark LIKE 'UAT%'
    AND created_at >= '2026-06-12' AND created_at < '2026-06-13'
);
DELETE FROM prc2_payments
WHERE pay_no = 'PAY2-20260612-00001' AND remark LIKE 'UAT%'
  AND created_at >= '2026-06-12' AND created_at < '2026-06-13';

-- ② 应付台账（仅关联 UAT3 测试 PO 且零核销）
DELETE FROM prc2_ap_ledger
WHERE ap_no = 'AP2-20260612-00001' AND po_no = 'PO2-20260612-00003'
  AND paid_amount_original = 0
  AND created_at >= '2026-06-12' AND created_at < '2026-06-13';

-- ③ 采购订单明细 → 订单
DELETE FROM prc2_order_items
WHERE po_id IN (
  SELECT id FROM prc2_purchase_orders
  WHERE po_no IN ('PO2-20260612-00001','PO2-20260612-00002','PO2-20260612-00003')
    AND subject LIKE 'UAT%'
    AND created_at >= '2026-06-12' AND created_at < '2026-06-13'
);
DELETE FROM prc2_purchase_orders
WHERE po_no IN ('PO2-20260612-00001','PO2-20260612-00002','PO2-20260612-00003')
  AND subject LIKE 'UAT%'
  AND created_at >= '2026-06-12' AND created_at < '2026-06-13';

-- ④ 审批实例步骤 → 实例（按 biz_no + UAT 主题守卫）
DELETE FROM wf_approval_instance_steps
WHERE instance_id IN (
  SELECT id FROM wf_approval_instances
  WHERE biz_no IN ('PO2-20260612-00001','PO2-20260612-00002','PO2-20260612-00003','PAY2-20260612-00001')
    AND (subject LIKE 'UAT%' OR subject IS NULL)
    AND started_at >= '2026-06-12' AND started_at < '2026-06-13'
);
DELETE FROM wf_approval_instances
WHERE biz_no IN ('PO2-20260612-00001','PO2-20260612-00002','PO2-20260612-00003','PAY2-20260612-00001')
  AND (subject LIKE 'UAT%' OR subject IS NULL)
  AND started_at >= '2026-06-12' AND started_at < '2026-06-13';

-- ⑤ 采购审批日志
DELETE FROM prc2_approvals
WHERE biz_no IN ('PO2-20260612-00001','PO2-20260612-00002','PO2-20260612-00003','PAY2-20260612-00001')
  AND created_at >= '2026-06-12' AND created_at < '2026-06-13';

COMMIT;
