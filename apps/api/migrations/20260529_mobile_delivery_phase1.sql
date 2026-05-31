-- Mobile Delivery Runtime Phase 1
-- 2026-05-29

BEGIN;

-- ── 1. ROLE_DRIVER 系统角色种子（幂等）─────────────────────────────────────
INSERT INTO sys_role (role_code, role_name_zh, role_name_lo, role_type, description)
VALUES ('ROLE_DRIVER', '配送司机', 'ຄົນຂັບລົດ', 'OPS', '配送司机：管理自己的配送单，执行装车/发车/到达/签收')
ON CONFLICT (role_code) DO NOTHING;

-- ── 2. sal_delivery_orders 添加 photo_urls 字段（幂等）───────────────────
ALTER TABLE sal_delivery_orders ADD COLUMN IF NOT EXISTS photo_urls TEXT;

-- ── 3. MENU_MOBILE_DELIVERY 菜单种子（幂等）──────────────────────────────
-- 修复（Phase C）：sys_menu 实际列为 menu_name_zh/domain/route（非 menu_name/menu_path/status）
INSERT INTO sys_menu (menu_code, menu_name_zh, domain, route, parent_code, sort_order, icon)
VALUES ('MENU_MOBILE_DELIVERY', '配送任务', 'LOG', '/mobile/delivery', 'MENU_MOBILE', 10, 'Truck')
ON CONFLICT (menu_code) DO NOTHING;

-- ── 4. ROLE_DRIVER 菜单权限种子（幂等）───────────────────────────────────
-- 修复（Phase C）：sys_role_menu_permission 实际列为 role_id/menu_id/perm_codes（逗号字符串）
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, p.perm_codes
FROM (VALUES
  ('ROLE_DRIVER',  'V,C,E'),
  ('ROLE_ADMIN',   'V,C,E,D,A,X'),
  ('ROLE_LOG_MGR', 'V,C,E,D,X')
) AS p(role_code, perm_codes)
JOIN sys_role r ON r.role_code = p.role_code
JOIN sys_menu m ON m.menu_code = 'MENU_MOBILE_DELIVERY'
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ── 5. UAT 验收项（Mobile Delivery — 10 条，幂等）────────────────────────
-- 注意：uat_checklists 表无 checklist_code 字段，使用 WHERE NOT EXISTS 幂等插入
-- 以 (module_code, item_name) 作为幂等键

INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '司机登录配送移动端', '使用 ROLE_DRIVER 账号登录 /mobile/login，进入 /mobile/delivery', 'NOT_STARTED', 1, NOW()
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '司机登录配送移动端');

INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '查看今日配送任务列表', '首页显示今日配送单数、待装车、配送中、待签收等统计卡片', 'NOT_STARTED', 2, NOW()
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '查看今日配送任务列表');

INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '查看配送单详情', '点击配送单进入详情页，显示客户/地址/商品/状态时间轴', 'NOT_STARTED', 3, NOW()
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '查看配送单详情');

INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '执行装车操作', '在详情页点击"开始装车"→"完成装车"，状态更新为 LOADED', 'NOT_STARTED', 4, NOW()
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '执行装车操作');

INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '执行发车操作', '点击"发车"，状态更新为 DEPARTED，接收 Push 通知', 'NOT_STARTED', 5, NOW()
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '执行发车操作');

INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '执行到达操作', '点击"到达"，状态更新为 ARRIVED，接收 Push 通知', 'NOT_STARTED', 6, NOW()
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '执行到达操作');

INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '执行正常签收', '输入签收数量，点击"完成签收"，创建 sal_receipts 记录，状态更新', 'NOT_STARTED', 7, NOW()
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '执行正常签收');

INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '执行异常签收并触发退货', '选择异常原因，提交后自动创建 Return Order（DELIVERY_REJECT），接收异常 Push', 'NOT_STARTED', 8, NOW()
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '执行异常签收并触发退货');

INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '拍照上传签收照片', '在签收/异常页面上传照片（base64），保存到 sal_delivery_orders.photo_urls', 'NOT_STARTED', 9, NOW()
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '拍照上传签收照片');

INSERT INTO uat_checklists (module_code, item_name, item_description, status, sort_order, created_at)
SELECT 'MOBILE_DELIVERY', '接收 Push 通知', '发车/到达/签收/异常时 PushNotificationService 发送通知，前端收到显示', 'NOT_STARTED', 10, NOW()
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'MOBILE_DELIVERY' AND item_name = '接收 Push 通知');

COMMIT;
