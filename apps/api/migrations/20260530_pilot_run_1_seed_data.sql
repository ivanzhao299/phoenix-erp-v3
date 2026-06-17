-- ============================================================
-- Phoenix ERP V3 — Pilot Run 1 Launch Seed Data
-- 20260530_pilot_run_1_seed_data.sql
--
-- 内容：
--   1. ROLE_PILOT_MANAGER — 试运行负责人角色（幂等补充）
--   2. sys_user — 6 名试运行人员（非 ADMIN，真实角色）
--   3. sys_user_role — 角色授权关联
--   4. sal_channels — 孟赛销售渠道（直营 + 经销商）
--   5. sal_customers — 30 名真实客户（直营/经销商/散客）
--   6. sal_price_books + sal_price_items — 孟赛标准价格册（ACTIVE）
--   7. sal_drivers — 1 名试运行司机
--   8. sal_vehicles — 1 辆试运行车辆
--   9. uat_checklists — 生产/门店/系统 验收清单（30 项）
--  10. uat_training_records — 6 场上线前培训记录
--
-- 规则：
--   · 全部幂等（IF NOT EXISTS / ON CONFLICT DO NOTHING）
--   · 不修改 sys_dict 任何已有记录
--   · 不删除现有数据
--   · 初始密码说明：见 §2，由系统管理员分发
--
-- 生效日期：2026-05-30
-- 启动状态：Pilot Run 1 RUNNING（PR-20260530-0001）
-- ============================================================

-- ── 1. 试运行负责人角色 ────────────────────────────────────────────
INSERT INTO sys_role (role_code, role_name_zh, role_name_lo, role_type, approval_level, description)
VALUES (
  'ROLE_PILOT_MANAGER',
  '试运行负责人',
  'ຜູ້ຮັບຜິດຊອບລອງໃຊ້',
  'MANAGEMENT',
  3,
  'Pilot Run 1 专属角色 — 负责试运行全程管理、问题闭环、上线评估'
)
ON CONFLICT (role_code) DO NOTHING;

/* ════════ G193 数据 seed 冻结：试运行用户/客户/渠道/价格/司机/车辆/UAT 均人工维护，迁移不再重跑覆盖 ════════
-- ── 2. 试运行用户（6 名，非 ADMIN）───────────────────────────────────
-- 说明：
--   · 初始密码与系统管理员账号相同，由管理员分发后首次登录须修改
--   · store_code PILOT-MS 代表孟赛试运行区域
--   · 所有账号状态=1（启用）

-- 业务员
INSERT INTO sys_user (username, password_hash, real_name, store_code, locale, status)
VALUES ('pilot_sales',    '$2b$10$iLaTrx39KkGULe9qVZQ9N.fy1w4dSiw/tJ.CYd4GUisjpnEHVausa', '李 梦 (试运行业务员)',   'PILOT-MS', 'zh-CN', 1)
ON CONFLICT (username) DO NOTHING;

-- 收银员（直营店）
INSERT INTO sys_user (username, password_hash, real_name, store_code, locale, status)
VALUES ('pilot_cashier',  '$2b$10$iLaTrx39KkGULe9qVZQ9N.fy1w4dSiw/tJ.CYd4GUisjpnEHVausa', '陈 丽 (试运行收银)',     'STORE-MS-01', 'zh-CN', 1)
ON CONFLICT (username) DO NOTHING;

-- 司机
INSERT INTO sys_user (username, password_hash, real_name, store_code, locale, status)
VALUES ('pilot_driver',   '$2b$10$iLaTrx39KkGULe9qVZQ9N.fy1w4dSiw/tJ.CYd4GUisjpnEHVausa', '王 强 (试运行司机)',     'PILOT-MS', 'zh-CN', 1)
ON CONFLICT (username) DO NOTHING;

-- 仓库员
INSERT INTO sys_user (username, password_hash, real_name, store_code, locale, status)
VALUES ('pilot_wms',      '$2b$10$iLaTrx39KkGULe9qVZQ9N.fy1w4dSiw/tJ.CYd4GUisjpnEHVausa', '赵 刚 (试运行仓库)',     'PILOT-MS', 'zh-CN', 1)
ON CONFLICT (username) DO NOTHING;

-- 财务
INSERT INTO sys_user (username, password_hash, real_name, store_code, locale, status)
VALUES ('pilot_finance',  '$2b$10$iLaTrx39KkGULe9qVZQ9N.fy1w4dSiw/tJ.CYd4GUisjpnEHVausa', '刘 华 (试运行财务)',     'PILOT-MS', 'zh-CN', 1)
ON CONFLICT (username) DO NOTHING;

-- 负责人（Pilot Manager）
INSERT INTO sys_user (username, password_hash, real_name, store_code, locale, status)
VALUES ('pilot_manager',  '$2b$10$iLaTrx39KkGULe9qVZQ9N.fy1w4dSiw/tJ.CYd4GUisjpnEHVausa', '张 建国 (试运行负责人)', 'PILOT-MS', 'zh-CN', 1)
ON CONFLICT (username) DO NOTHING;

-- ── 3. 角色授权 ─────────────────────────────────────────────────────
-- pilot_sales → ROLE_SALES_REP
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, TRUE, NOW()
FROM sys_user u, sys_role r
WHERE u.username = 'pilot_sales' AND r.role_code = 'ROLE_SALES_REP'
  AND NOT EXISTS (SELECT 1 FROM sys_user_role ur WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id);

-- pilot_cashier → ROLE_CASHIER
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, TRUE, NOW()
FROM sys_user u, sys_role r
WHERE u.username = 'pilot_cashier' AND r.role_code = 'ROLE_CASHIER'
  AND NOT EXISTS (SELECT 1 FROM sys_user_role ur WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id);

-- pilot_driver → ROLE_DRIVER
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, TRUE, NOW()
FROM sys_user u, sys_role r
WHERE u.username = 'pilot_driver' AND r.role_code = 'ROLE_DRIVER'
  AND NOT EXISTS (SELECT 1 FROM sys_user_role ur WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id);

-- pilot_wms → ROLE_WMS_MGR
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, TRUE, NOW()
FROM sys_user u, sys_role r
WHERE u.username = 'pilot_wms' AND r.role_code = 'ROLE_WMS_MGR'
  AND NOT EXISTS (SELECT 1 FROM sys_user_role ur WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id);

-- pilot_finance → ROLE_FIN_ACCT
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, TRUE, NOW()
FROM sys_user u, sys_role r
WHERE u.username = 'pilot_finance' AND r.role_code = 'ROLE_FIN_ACCT'
  AND NOT EXISTS (SELECT 1 FROM sys_user_role ur WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id);

-- pilot_manager → ROLE_PILOT_MANAGER
INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
SELECT u.user_id, r.role_id, TRUE, NOW()
FROM sys_user u, sys_role r
WHERE u.username = 'pilot_manager' AND r.role_code = 'ROLE_PILOT_MANAGER'
  AND NOT EXISTS (SELECT 1 FROM sys_user_role ur WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id);

-- ── 4. 销售渠道 ─────────────────────────────────────────────────────
INSERT INTO sal_channels (channel_code, channel_name, channel_type, company_code, status, remark)
VALUES
  ('CH-MS-DIRECT',  '孟赛直营渠道',   'DIRECT',      'MENGSE', 'ACTIVE', '孟赛鸡场直营店销售渠道'),
  ('CH-MS-DIST',    '孟赛经销商渠道', 'DISTRIBUTOR', 'MENGSE', 'ACTIVE', '孟赛区域经销商批发渠道')
ON CONFLICT (channel_code) DO NOTHING;

-- ── 5. 客户主档（30 名）──────────────────────────────────────────────
-- 直营店客户（1 个）
INSERT INTO sal_customers (customer_no, customer_name, customer_type, channel_code, company_code, company_name,
  region_code, credit_limit, payment_terms, risk_level, status, contact_name, contact_phone, delivery_address)
VALUES
  ('CUS-MS-D-001', '孟赛直营店', 'DIRECT_STORE', 'CH-MS-DIRECT', 'MENGSE', '孟赛凤凰直营店',
   'REGION-MS', 50000, 0, 'NORMAL', 'ACTIVE', '陈 丽', '020-55001001', '孟赛市区中央路1号')
ON CONFLICT (customer_no) DO NOTHING;

-- 经销商客户（5 个）
INSERT INTO sal_customers (customer_no, customer_name, customer_type, channel_code, company_code, company_name,
  region_code, credit_limit, payment_terms, risk_level, status, contact_name, contact_phone, delivery_address)
VALUES
  ('CUS-MS-DI-001', '万象发展贸易公司',    'DISTRIBUTOR', 'CH-MS-DIST', 'MENGSE', '万象发展贸易',     'REGION-VTE', 200000, 30, 'NORMAL', 'ACTIVE', '阿明', '020-55101001', '万象市赛色塔区工业区'),
  ('CUS-MS-DI-002', '孟赛农产品批发商',    'DISTRIBUTOR', 'CH-MS-DIST', 'MENGSE', '孟赛农产品批发',   'REGION-MS',  150000, 15, 'NORMAL', 'ACTIVE', '老王', '020-55102001', '孟赛市农贸市场B区'),
  ('CUS-MS-DI-003', '赛公布省代理商',      'DISTRIBUTOR', 'CH-MS-DIST', 'MENGSE', '赛公布代理',       'REGION-XBR', 100000, 30, 'NORMAL', 'ACTIVE', '布先生', '020-55103001', '赛公布省府城'),
  ('CUS-MS-DI-004', '阿速坡地区经销商',    'DISTRIBUTOR', 'CH-MS-DIST', 'MENGSE', '阿速坡经销',       'REGION-AT',  80000,  15, 'NORMAL', 'ACTIVE', '老李', '020-55104001', '阿速坡省中部'),
  ('CUS-MS-DI-005', '川圹省农产品供应商',  'DISTRIBUTOR', 'CH-MS-DIST', 'MENGSE', '川圹供应链',       'REGION-XK',  120000, 30, 'NORMAL', 'ACTIVE', '张先生', '020-55105001', '川圹省丰沙里县')
ON CONFLICT (customer_no) DO NOTHING;

-- 大客户（5 个）
INSERT INTO sal_customers (customer_no, customer_name, customer_type, channel_code, company_code, company_name,
  region_code, credit_limit, payment_terms, risk_level, status, contact_name, contact_phone, delivery_address)
VALUES
  ('CUS-MS-KA-001', '万象 Grand Mall 超市',  'KEY_ACCOUNT', 'CH-MS-DIST', 'MENGSE', 'Grand Mall',      'REGION-VTE', 500000, 30, 'NORMAL', 'ACTIVE', '王采购', '020-55201001', '万象市赛塔尼区'),
  ('CUS-MS-KA-002', '孟赛本地连锁超市',      'KEY_ACCOUNT', 'CH-MS-DIST', 'MENGSE', '孟赛超市连锁',    'REGION-MS',  300000, 15, 'NORMAL', 'ACTIVE', '李店长', '020-55202001', '孟赛市新城区'),
  ('CUS-MS-KA-003', '万象凯旋酒店餐饮部',    'KEY_ACCOUNT', 'CH-MS-DIRECT','MENGSE', '凯旋酒店',        'REGION-VTE', 200000, 30, 'NORMAL', 'ACTIVE', '厨师长', '020-55203001', '万象市法国区'),
  ('CUS-MS-KA-004', '老挝国际学校食堂',      'KEY_ACCOUNT', 'CH-MS-DIRECT','MENGSE', '国际学校',        'REGION-VTE', 150000, 15, 'NORMAL', 'ACTIVE', '采购主任', '020-55204001', '万象市赛塔尼区'),
  ('CUS-MS-KA-005', '孟赛工业园区员工餐厅',  'KEY_ACCOUNT', 'CH-MS-DIRECT','MENGSE', '工业园区餐饮',    'REGION-MS',  100000, 30, 'NORMAL', 'ACTIVE', '行政主管', '020-55205001', '孟赛工业园区')
ON CONFLICT (customer_no) DO NOTHING;

-- 散客零售（19 个）
INSERT INTO sal_customers (customer_no, customer_name, customer_type, channel_code, company_code, company_name,
  region_code, credit_limit, payment_terms, risk_level, status, contact_name, contact_phone, delivery_address)
VALUES
  ('CUS-MS-R-001', '孟赛市集散客1号',   'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '阿一', '020-56001001', '孟赛市中心市场'),
  ('CUS-MS-R-002', '孟赛市集散客2号',   'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '阿二', '020-56002001', '孟赛市中心市场'),
  ('CUS-MS-R-003', '孟赛市集散客3号',   'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '阿三', '020-56003001', '孟赛市东部市场'),
  ('CUS-MS-R-004', '孟赛市集散客4号',   'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '阿四', '020-56004001', '孟赛市南门市场'),
  ('CUS-MS-R-005', '孟赛市集散客5号',   'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '阿五', '020-56005001', '孟赛市北门市场'),
  ('CUS-MS-R-006', '周边村庄收购商1号', 'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS', 10000, 0, 'NORMAL', 'ACTIVE', '村长甲', '020-56006001', '孟赛市郊区村1'),
  ('CUS-MS-R-007', '周边村庄收购商2号', 'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS', 10000, 0, 'NORMAL', 'ACTIVE', '村长乙', '020-56007001', '孟赛市郊区村2'),
  ('CUS-MS-R-008', '周边村庄收购商3号', 'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS', 10000, 0, 'NORMAL', 'ACTIVE', '村长丙', '020-56008001', '孟赛市郊区村3'),
  ('CUS-MS-R-009', '个人客户-李某',     'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '李某', '020-56009001', '孟赛市新区住宅'),
  ('CUS-MS-R-010', '个人客户-张某',     'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '张某', '020-56010001', '孟赛市老区'),
  ('CUS-MS-R-011', '个人客户-王某',     'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '王某', '020-56011001', '孟赛市'),
  ('CUS-MS-R-012', '个人客户-陈某',     'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '陈某', '020-56012001', '孟赛市'),
  ('CUS-MS-R-013', '个人客户-赵某',     'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '赵某', '020-56013001', '孟赛市'),
  ('CUS-MS-R-014', '个人客户-刘某',     'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '刘某', '020-56014001', '孟赛市'),
  ('CUS-MS-R-015', '个人客户-周某',     'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '周某', '020-56015001', '孟赛市'),
  ('CUS-MS-R-016', '个人客户-吴某',     'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '吴某', '020-56016001', '孟赛市'),
  ('CUS-MS-R-017', '个人客户-孙某',     'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '孙某', '020-56017001', '孟赛市'),
  ('CUS-MS-R-018', '个人客户-马某',     'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '马某', '020-56018001', '孟赛市'),
  ('CUS-MS-R-019', '个人客户-胡某',     'RETAIL', NULL, 'MENGSE', '散客', 'REGION-MS',  0, 0, 'NORMAL', 'ACTIVE', '胡某', '020-56019001', '孟赛市')
ON CONFLICT (customer_no) DO NOTHING;

-- ── 6. 价格册 + 价格明细（孟赛标准价格册）────────────────────────────
INSERT INTO sal_price_books (
  price_book_no, price_book_name, channel_code,
  effective_from, effective_to,
  company_code, status, created_by
)
VALUES (
  'PB-MENGSE-2026-STD',
  '孟赛标准价格册（试运行版）',
  NULL,
  '2026-05-30',
  '2026-12-31',
  'MENGSE',
  'ACTIVE',
  'pilot_manager'
)
ON CONFLICT (price_book_no) DO NOTHING;

-- 价格明细（鸡蛋各等级标准出厂价，单位：万吉普/颗）
INSERT INTO sal_price_items (
  price_book_id, product_code, grade_code, packaging_spec,
  unit_price, floor_price, ceiling_price, currency_code
)
SELECT pb.id, 'EGG', grade_code, packaging_spec, unit_price, floor_price, ceiling_price, 'LAK'
FROM sal_price_books pb
CROSS JOIN (VALUES
  ('0', 'LOOSE',          1200, 1000, 1500),
  ('1', 'LOOSE',          1100,  900, 1400),
  ('2', 'LOOSE',          1000,  800, 1300),
  ('3', 'LOOSE',           900,  700, 1200),
  ('4', 'LOOSE',           800,  600, 1100),
  ('5', 'LOOSE',           700,  500, 1000),
  ('0', '30_PCS_TRAY',   35000, 30000, 45000),
  ('1', '30_PCS_TRAY',   32000, 27000, 42000),
  ('2', '30_PCS_TRAY',   29000, 24000, 38000),
  ('3', '30_PCS_TRAY',   26000, 21000, 34000),
  ('0', '360_PCS_CASE', 420000,360000,540000),
  ('1', '360_PCS_CASE', 384000,324000,504000)
) AS t(grade_code, packaging_spec, unit_price, floor_price, ceiling_price)
WHERE pb.price_book_no = 'PB-MENGSE-2026-STD'
  AND NOT EXISTS (
    SELECT 1 FROM sal_price_items pi2
    WHERE pi2.price_book_id = pb.id AND pi2.grade_code = t.grade_code AND pi2.packaging_spec = t.packaging_spec
  );

-- ── 7. 司机档案 ────────────────────────────────────────────────────
INSERT INTO sal_drivers (driver_code, driver_name, phone, license_no, company_code, status, remark)
VALUES (
  'DRV-MS-001',
  '王 强',
  '020-55900001',
  'LA-DRV-2023-001',
  'MENGSE',
  'ACTIVE',
  'Pilot Run 1 试运行司机 — 孟赛本地配送'
)
ON CONFLICT (driver_code) DO NOTHING;

-- ── 8. 车辆档案 ────────────────────────────────────────────────────
INSERT INTO sal_vehicles (vehicle_no, plate_no, vehicle_type, capacity, company_code, status, remark)
VALUES (
  'VEH-MS-001',
  'MS-01-2021',
  '厢式货车',
  2000.00,
  'MENGSE',
  'ACTIVE',
  'Pilot Run 1 试运行车辆 — 2吨厢式货车，适合孟赛区域配送'
)
ON CONFLICT (vehicle_no) DO NOTHING;

-- ── 9. 验收清单 — 生产管理/门店/系统 模块 ──────────────────────────
-- 生产管理 (PRODUCTION)
INSERT INTO uat_checklists (module_code, item_name, item_description, sort_order)
SELECT * FROM (VALUES
  ('PRODUCTION', '鸡舍与鸡群档案维护',   '验证鸡舍新增/编辑，鸡群档案关联鸡舍，存栏数正确', 10),
  ('PRODUCTION', '日生产日报录入',        '验证每日产蛋数、破损数、用料量录入格式与计算', 20),
  ('PRODUCTION', '分级包装作业操作',      '验证终端扫码、自动分级、批次创建完整流程', 30),
  ('PRODUCTION', '集蛋入库流程',          '验证集蛋扫码入库，批次生成，库存自动增加', 40),
  ('PRODUCTION', '包装批次管理与追溯',    '验证批次号生成规则、正向/反向追溯查询', 50),
  ('PRODUCTION', '免疫计划与用药记录',    '验证免疫计划导入、用药记录录入、兽医审批', 60),
  ('PRODUCTION', '环境设备监控预警',      '验证 IoT 数据实时展示，环境异常自动告警', 70),
  ('PRODUCTION', '包装日报汇总报告',      '验证日报数据汇总准确，与班次记录一致', 80),
  ('PRODUCTION', '成品质检与不合格处置',  '验证质检单创建、判定、不合格品隔离流程', 90),
  ('PRODUCTION', 'PDA 终端作业验证',      '验证 PDA 扫码、作业确认、异常上报功能', 100)
) AS t(module_code, item_name, item_description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'PRODUCTION');

-- 门店管理 (STORE)
INSERT INTO uat_checklists (module_code, item_name, item_description, sort_order)
SELECT * FROM (VALUES
  ('STORE', '门店收银销售（POS）',       '验证 POS 商品扫码、数量调整、收款打印小票', 10),
  ('STORE', '门店收货验收',              '验证门店收到配送货后录入验收，库存自动更新', 20),
  ('STORE', '门店库存盘点',              '验证门店盘点操作、差异原因录入、主管审批', 30),
  ('STORE', '门店补货申请',              '验证补货申请提交、审批、触发配送单创建', 40),
  ('STORE', '门店损耗记录',              '验证每日损耗录入、类型分类、主管确认', 50),
  ('STORE', '门店日结与交班',            '验证班次日结金额核对、交接记录完整性', 60),
  ('STORE', '收银款项与 AR 对账',        '验证 POS 收款自动生成 AR Receipt，与财务对账', 70),
  ('STORE', '门店员工权限隔离',          '验证收银员仅见本店数据，不可越权查看其他门店', 80),
  ('STORE', '门店报表（日/周销售）',     '验证门店销售报表数据准确性，支持导出', 90),
  ('STORE', '会员积分与优惠操作',        '验证 POS 会员扫码、积分累积、优惠券核销', 100)
) AS t(module_code, item_name, item_description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'STORE');

-- 系统运维 (SYSTEM)
INSERT INTO uat_checklists (module_code, item_name, item_description, sort_order)
SELECT * FROM (VALUES
  ('SYSTEM', '用户账号创建与权限配置',   '验证新增用户、分配角色、菜单权限生效', 10),
  ('SYSTEM', 'DataScope 数据权限隔离',   '验证不同 company_code 用户无法越权查看数据', 20),
  ('SYSTEM', '系统健康监控页面',         '验证 /system/health 显示 API 延迟/错误率/DB 连接池', 30),
  ('SYSTEM', '告警中心操作',             '验证告警产生、确认、关闭全流程', 40),
  ('SYSTEM', '系统配置治理',             '验证 sys_configs 参数修改后立即生效（SLA/信用冻结天数）', 50),
  ('SYSTEM', '操作审计日志',             '验证关键操作（创建/修改/删除）记录到 sys_operation_logs', 60),
  ('SYSTEM', '通知推送与接收',           '验证审批/临期/信用冻结等通知准时发送并到达', 70),
  ('SYSTEM', '品牌配置生效',             '验证系统名称/Logo/主题色在前端实时显示', 80),
  ('SYSTEM', '多语言切换（中文/老挝）', '验证切换语言后界面标签正确显示老挝语', 90),
  ('SYSTEM', '系统 500 错误率监控',      '验证试运行期间 500 错误率 < 0.5%，出现后立即告警', 100)
) AS t(module_code, item_name, item_description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM uat_checklists WHERE module_code = 'SYSTEM');

-- ── 10. 培训记录（6 场上线前培训）──────────────────────────────────
INSERT INTO uat_training_records (
  training_no, training_type, training_title, trainer_name,
  participant_count, training_date, score, company_code, remark
)
VALUES
  ('TRN-MS-2026-001', 'SALES',     '销售订单与客户管理培训',   '张建国', 3, '2026-05-28', 88.5, 'MENGSE', '业务员、收银员、负责人参与；重点：订单创建、信用控制、低价审批'),
  ('TRN-MS-2026-002', 'DELIVERY',  '配送管理与签收操作培训',   '张建国', 2, '2026-05-28', 92.0, 'MENGSE', '司机、仓库员参与；重点：配送单操作、签收流程、异常处理'),
  ('TRN-MS-2026-003', 'INVENTORY', '库存管理与 FIFO 操作培训', '张建国', 2, '2026-05-29', 85.0, 'MENGSE', '仓库员、财务参与；重点：批次入库、出库 FIFO、临期预警'),
  ('TRN-MS-2026-004', 'FINANCE',   '财务管理与 AR/AP 操作培训', '张建国',2, '2026-05-29', 90.0, 'MENGSE', '财务、负责人参与；重点：AR 发票核销、收款录入、AP 付款'),
  ('TRN-MS-2026-005', 'SALES',     'POS 收银与门店日结培训',   '张建国', 2, '2026-05-29', 95.0, 'MENGSE', '收银员、负责人参与；重点：POS 操作、日结交班、会员积分'),
  ('TRN-MS-2026-006', 'MANAGEMENT','试运行规则与问题反馈培训', '张建国', 6, '2026-05-30', 100.0,'MENGSE', '全员参与；重点：ERP 操作规范、禁止并行系统、问题反馈机制')
ON CONFLICT (training_no) DO NOTHING;

-- ── 确认 ────────────────────────────────────────────────────────────
DO $$
DECLARE
  user_count   INT;
  cust_count   INT;
  price_count  INT;
  checklist_count INT;
  training_count  INT;
BEGIN
  SELECT COUNT(*) INTO user_count   FROM sys_user WHERE username LIKE 'pilot_%';
  SELECT COUNT(*) INTO cust_count   FROM sal_customers WHERE company_code = 'MENGSE';
  SELECT COUNT(*) INTO price_count  FROM sal_price_items pi
    JOIN sal_price_books pb ON pi.price_book_id = pb.id
    WHERE pb.price_book_no = 'PB-MENGSE-2026-STD';
  SELECT COUNT(*) INTO checklist_count FROM uat_checklists;
  SELECT COUNT(*) INTO training_count  FROM uat_training_records WHERE company_code = 'MENGSE';

  RAISE NOTICE '✅ Pilot Run 1 Seed Data 初始化完成:';
  RAISE NOTICE '   · 试运行用户: %', user_count;
  RAISE NOTICE '   · 孟赛客户: %', cust_count;
  RAISE NOTICE '   · 价格明细: %', price_count;
  RAISE NOTICE '   · 验收清单总计: %', checklist_count;
  RAISE NOTICE '   · 培训记录: %', training_count;
END$$;
   ════════ G193 冻结结束（§1 试运行角色 seed 保留跟代码） ════════ */
