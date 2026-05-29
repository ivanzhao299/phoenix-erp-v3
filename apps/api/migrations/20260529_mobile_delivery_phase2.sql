-- Mobile Delivery Runtime Phase 2 DDL
-- 幂等增量迁移

-- ── UAT checklist 补充（Phase 2 新增 11-12 两项） ─────────────────────────
INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '通知跳转配送订单', '点击 Push 通知后跳转至对应配送单详情页', 'NOT_STARTED', 11, NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM uat_checklists
  WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '通知跳转配送订单'
);

INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '司机绩效查看', '司机可在移动端查看今日完成、本周完成、准时率、异常率', 'NOT_STARTED', 12, NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM uat_checklists
  WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '司机绩效查看'
);
