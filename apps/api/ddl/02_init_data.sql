-- ============== Step 1: 初始化 sys_store 机构字典 ==============
INSERT INTO sys_store (store_code, store_name_zh, store_name_lo, store_type, parent_code) VALUES
('ALL',          '集团总部',                'ສຳນັກງານໃຫຍ່',                    'HQ',         NULL),
('CO-FHA',       '凤凰农业发展有限公司',     'ບໍລິສັດ ພະລັງ-ໂຟນິກ ກະສິກໍາ',     'COMPANY',    'ALL'),
('CO-FHF',       '凤凰食品有限公司',         'ບໍລິສັດ ພະລັງ-ໂຟນິກ ອາຫານ',       'COMPANY',    'ALL'),
('FARM-MS',      '孟赛养鸡场',              'ຟາມໄກ່ ເມືອງໄຊ',                  'FARM',       'CO-FHA'),
('FARM-DP',      '东鹏养鸡场',              'ຟາມໄກ່ ຕົງເພັງ',                  'FARM',       'CO-FHA'),
('STORE-VTE-01', '万象 Eggs Lao 直营店 1 号', 'ຮ້ານ Eggs Lao ວຽງຈັນ 01',          'STORE',      'CO-FHA'),
('AREA-VTE',     '万象片区',                'ເຂດວຽງຈັນ',                       'AREA',       'CO-FHA'),
('AREA-ZHU',     '朱会然片区',              'ເຂດ Zhu',                          'AREA',       'CO-FHA'),
('AREA-YUE',     '岳片区',                  'ເຂດ Yue',                          'AREA',       'CO-FHA'),
('WH-VTE-01',    '万象成品蛋仓 1 号',         'ສາງໄຂ່ ວຽງຈັນ 01',                'WAREHOUSE',  'CO-FHA'),
('PKG-MS-01',    '孟赛包装车间 1 号',         'ໂຮງງານຫຸ້ມຫໍ່ ເມືອງໄຊ 01',         'PACKAGING',  'FARM-MS');

-- ============== Step 2: 初始化 sys_role 角色 ==============
INSERT INTO sys_role (role_code, role_name_zh, role_name_lo, role_type, approval_level) VALUES
('ROLE_ADMIN',         '集团超级管理员',  'ຜູ້ຈັດການລະບົບສູງສຸດ',     'SYSTEM',      99),
('ROLE_CEO',           '集团总裁',        'ປະທານກຸ່ມ',                'DECISION',    4),
('ROLE_HQ_FINANCE',    '总部财务审计',    'ການເງິນສໍານັກງານໃຫຍ່',     'FINANCE',     3),
('ROLE_FIN_CFO',       '财务总监',        'ຜູ້ອຳນວຍການການເງິນ',       'FINANCE',     3),
('ROLE_FIN_ACCT',      '财务会计',        'ນັກບັນຊີ',                 'FINANCE',     2),
('ROLE_FIN_AR',        '应收专员',        'ພະນັກງານລູກໜີ້',          'FINANCE',     2),
('ROLE_FIN_COST',      '成本会计',        'ນັກບັນຊີຕົ້ນທຶນ',         'FINANCE',     2),
('ROLE_REGION_MGR',    '区域督导',        'ຜູ້ກວດກາພາກພື້ນ',         'MANAGEMENT',  3),
('ROLE_FARM_MGR',      '养殖场长',        'ຫົວໜ້າຟາມ',               'PRODUCTION',  2),
('ROLE_VET',           '驻场兽医',        'ສັດຕະວະແພດ',              'PRODUCTION',  2),
('ROLE_FARMER',        '饲养员',          'ຄົນລ້ຽງສັດ',              'PRODUCTION',  1),
('ROLE_QA_MGR',        '品控总监',        'ຜູ້ອຳນວຍການຄຸນນະພາບ',     'QUALITY',     2),
('ROLE_QA_STAFF',      '质检专员',        'ພະນັກງານກວດຄຸນນະພາບ',     'QUALITY',     1),
('ROLE_PKG_MGR',       '车间主任',        'ຫົວໜ້າໂຮງງານ',            'PACKAGING',   2),
('ROLE_PKG_OP',        '包装工人',        'ພະນັກງານຫຸ້ມຫໍ່',         'PACKAGING',   1),
('ROLE_WMS_MGR',       '仓储经理',        'ຜູ້ຈັດການສາງ',            'WAREHOUSE',   2),
('ROLE_WMS_OP',        '仓管理货员',      'ພະນັກງານສາງ',             'WAREHOUSE',   1),
('ROLE_LOG_MGR',       '物流调度',        'ຜູ້ຈັດການຂົນສົ່ງ',        'LOGISTICS',   2),
('ROLE_DRIVER',        '司机',            'ຄົນຂັບລົດ',               'LOGISTICS',   1),
('ROLE_PDA_OP',        'PDA 作业员',      'ພະນັກງານ PDA',             'COMMON',      1),
('ROLE_PRC_BUYER',     '采购专员',        'ພະນັກງານຈັດຊື້',          'PROCUREMENT', 1),
('ROLE_STORE_MGR',     '直营店店长',      'ຜູ້ຈັດການຮ້ານ',           'STORE',       2),
('ROLE_CASHIER',       '前台收银员',      'ພະນັກງານຮັບເງິນ',         'STORE',       1),
('ROLE_B2B_MGR',       '大客总监',        'ຜູ້ອຳນວຍການ B2B',          'SALES',       2),
('ROLE_SALES_REP',     '业务员',          'ພະນັກງານຂາຍ',             'SALES',       1),
('ROLE_CUSTOMER_B2B',  '自助订货用户',    'ລູກຄ້າ B2B',               'EXTERNAL',    0);

-- ============== Step 3: 初始化 sys_menu 菜单 ==============
INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, sort_order, icon, route) VALUES
('MENU_DASHBOARD',     '大盘看板',     'ກະດານສະຖິຕິ',                 'COMMON',  1, 'dashboard',  '/dashboard'),
('MENU_APPROVAL',      '审批中心',     'ສູນຍ໌ອະນຸມັດ',                'COMMON',  2, 'approval',   '/approval'),
('MENU_FIN_AUDIT',     '财务审计',     'ການກວດສອບການເງິນ',           'FINANCE', 3, 'audit',      '/fin/audit'),
('MENU_FIN_REPORT',    '财务报表',     'ບົດລາຍງານການເງິນ',           'FINANCE', 4, 'report',     '/fin/report'),
('MENU_FIN_CLOSE',     '财务结算',     'ການປິດບັນຊີການເງິນ',         'FINANCE', 5, 'close',      '/fin/close'),
('MENU_ORDER_MGR',     '订单管理',     'ການຄຸ້ມຄອງຄຳສັ່ງຊື້',         'ORDER',   6, 'order',      '/order'),
('MENU_STORE_MGR',     '门店管理',     'ການຄຸ້ມຄອງຮ້ານ',             'STORE',   7, 'store',      '/store'),
('MENU_POS_STORE',     'POS 店务',     'ກິດຈະການ POS',                'STORE',   8, 'pos',        '/pos/store'),
('MENU_POS_CASH',      'POS 收银',     'POS ຮັບເງິນ',                 'STORE',   9, 'cash',       '/pos/cash'),
('MENU_FARM_DATA',     '养殖数据',     'ຂໍ້ມູນການລ້ຽງສັດ',           'FARM',   10, 'data',       '/farm/data'),
('MENU_FARM_OVERVIEW', '养殖看板',     'ກະດານຟາມ',                    'FARM',   11, 'overview',   '/farm/overview'),
('MENU_FARM_DAILY',    '鸡舍日报',     'ບົດລາຍງານປະຈໍາວັນ',           'FARM',   12, 'daily',      '/farm/daily'),
('MENU_FARM_QA',       '养殖品控',     'ຄຸນນະພາບຟາມ',                 'FARM',   13, 'qa',         '/farm/qa'),
('MENU_FARM_VET',      '兽医防疫',     'ສັດຕະວະແພດ',                  'FARM',   14, 'vet',        '/farm/vet'),
('MENU_QA_OP',         '质检作业',     'ການກວດຄຸນນະພາບ',             'QA',     15, 'check',      '/qa/op'),
('MENU_QA_MGR',        '质检管理',     'ການຈັດການຄຸນນະພາບ',          'QA',     16, 'qa-mgr',     '/qa/mgr'),
('MENU_QA_PRODUCT',    '产品质检',     'ກວດຄຸນນະພາບສິນຄ້າ',           'QA',     17, 'product',    '/qa/product'),
('MENU_PKG_OP',        '包装作业',     'ວຽກຫຸ້ມຫໍ່',                  'PKG',    18, 'pkg',        '/pkg/op'),
('MENU_PKG_MGR',       '包装管理',     'ການຈັດການຫຸ້ມຫໍ່',           'PKG',    19, 'pkg-mgr',    '/pkg/mgr'),
('MENU_PACKAGE_RUN',   '包装运行',     'ການເຮັດວຽກຫຸ້ມຫໍ່',           'PKG',    20, 'run',        '/pkg/run'),
('MENU_WMS_VIEW',      '仓储查看',     'ເບິ່ງຄັງສິນຄ້າ',              'WMS',    21, 'wms-view',   '/wms/view'),
('MENU_WMS_INOUT',     '出入库作业',   'ນຳເຂົ້າ-ອອກສາງ',              'WMS',    22, 'inout',      '/wms/inout'),
('MENU_WMS_OP',        '仓储管理',     'ການຈັດການສາງ',                'WMS',    23, 'wms-mgr',    '/wms/op'),
('MENU_LOGISTICS',     '物流配送',     'ການຂົນສົ່ງ',                  'LOG',    24, 'truck',      '/logistics'),
('MENU_LOG_DISPATCH',  '物流调度',     'ການຈັດສົ່ງ',                  'LOG',    25, 'dispatch',   '/log/dispatch'),
('MENU_LOG_REVIEW',    '物流复核',     'ການກວດຄືນຂົນສົ່ງ',           'LOG',    26, 'review',     '/log/review'),
('MENU_PRC_MGR',       '采购管理',     'ການຈັດຊື້',                   'PRC',    27, 'buy',        '/prc'),
('MENU_B2B_SALE',      'B2B 销售',     'ຂາຍ B2B',                      'SALES',  28, 'b2b',        '/b2b');

-- ============== Step 4: 初始化 sys_role_menu_permission（核心权限矩阵） ==============
-- AI INSTRUCTION: 把 §5.1 JSON 转为以下批量 INSERT
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, perm.perm_codes
FROM (VALUES
    -- ROLE_ADMIN：通配（实际实现为后端硬编码 if (role === 'ROLE_ADMIN') return true;）
    ('ROLE_CEO',           'MENU_DASHBOARD',     'V'),
    ('ROLE_CEO',           'MENU_APPROVAL',      'V,A'),
    ('ROLE_CEO',           'MENU_FIN_AUDIT',     'V'),
    ('ROLE_CEO',           'MENU_FIN_REPORT',    'V,X'),
    ('ROLE_CEO',           'MENU_FIN_CLOSE',     'V'),
    ('ROLE_CEO',           'MENU_ORDER_MGR',     'V'),
    ('ROLE_CEO',           'MENU_STORE_MGR',     'V'),
    ('ROLE_CEO',           'MENU_POS_STORE',     'V'),
    ('ROLE_CEO',           'MENU_POS_CASH',      'V'),
    ('ROLE_CEO',           'MENU_FARM_DATA',     'V'),
    ('ROLE_CEO',           'MENU_FARM_OVERVIEW', 'V'),
    ('ROLE_CEO',           'MENU_FARM_DAILY',    'V'),
    ('ROLE_CEO',           'MENU_FARM_QA',       'V'),
    ('ROLE_CEO',           'MENU_FARM_VET',      'V'),
    ('ROLE_CEO',           'MENU_QA_OP',         'V'),
    ('ROLE_CEO',           'MENU_QA_MGR',        'V'),
    ('ROLE_CEO',           'MENU_QA_PRODUCT',    'V'),
    ('ROLE_CEO',           'MENU_PKG_OP',        'V'),
    ('ROLE_CEO',           'MENU_PKG_MGR',       'V'),
    ('ROLE_CEO',           'MENU_PACKAGE_RUN',   'V'),
    ('ROLE_CEO',           'MENU_WMS_VIEW',      'V'),
    ('ROLE_CEO',           'MENU_WMS_INOUT',     'V'),
    ('ROLE_CEO',           'MENU_WMS_OP',        'V'),
    ('ROLE_CEO',           'MENU_LOGISTICS',     'V'),
    ('ROLE_CEO',           'MENU_LOG_DISPATCH',  'V'),
    ('ROLE_CEO',           'MENU_LOG_REVIEW',    'V'),
    ('ROLE_CEO',           'MENU_PRC_MGR',       'V,A'),
    ('ROLE_CEO',           'MENU_B2B_SALE',      'V'),

    ('ROLE_HQ_FINANCE',    'MENU_DASHBOARD',     'V'),
    ('ROLE_HQ_FINANCE',    'MENU_APPROVAL',      'V'),
    ('ROLE_HQ_FINANCE',    'MENU_FIN_AUDIT',     'V,X'),
    ('ROLE_HQ_FINANCE',    'MENU_FIN_REPORT',    'V,X'),

    ('ROLE_FIN_CFO',       'MENU_DASHBOARD',     'V'),
    ('ROLE_FIN_CFO',       'MENU_APPROVAL',      'V,A'),
    ('ROLE_FIN_CFO',       'MENU_FIN_AUDIT',     'V,X'),
    ('ROLE_FIN_CFO',       'MENU_FIN_REPORT',    'V,X'),
    ('ROLE_FIN_CFO',       'MENU_FIN_CLOSE',     'V,A'),

    ('ROLE_FIN_ACCT',      'MENU_FIN_AUDIT',     'V,C,E'),
    ('ROLE_FIN_ACCT',      'MENU_FIN_CLOSE',     'V,C,E,A'),
    ('ROLE_FIN_ACCT',      'MENU_ORDER_MGR',     'V,E'),
    ('ROLE_FIN_ACCT',      'MENU_APPROVAL',      'V,A'),

    ('ROLE_FIN_AR',        'MENU_ORDER_MGR',     'V,E'),
    ('ROLE_FIN_AR',        'MENU_FIN_AUDIT',     'V'),
    ('ROLE_FIN_AR',        'MENU_APPROVAL',      'V,A'),

    ('ROLE_FIN_COST',      'MENU_FIN_AUDIT',     'V'),
    ('ROLE_FIN_COST',      'MENU_FIN_REPORT',    'V,X'),

    ('ROLE_REGION_MGR',    'MENU_DASHBOARD',     'V'),
    ('ROLE_REGION_MGR',    'MENU_STORE_MGR',     'V,E'),
    ('ROLE_REGION_MGR',    'MENU_POS_STORE',     'V'),
    ('ROLE_REGION_MGR',    'MENU_FIN_REPORT',    'V,X'),
    ('ROLE_REGION_MGR',    'MENU_APPROVAL',      'V,A'),
    ('ROLE_REGION_MGR',    'MENU_ORDER_MGR',     'V,E'),
    ('ROLE_REGION_MGR',    'MENU_B2B_SALE',      'V,E'),

    ('ROLE_FARM_MGR',      'MENU_FARM_DATA',     'V,C,E'),
    ('ROLE_FARM_MGR',      'MENU_FARM_OVERVIEW', 'V'),
    ('ROLE_FARM_MGR',      'MENU_FARM_DAILY',    'V,E'),
    ('ROLE_FARM_MGR',      'MENU_FARM_QA',       'V,E'),
    ('ROLE_FARM_MGR',      'MENU_APPROVAL',      'V,A'),

    ('ROLE_VET',           'MENU_FARM_VET',      'V,C,E'),
    ('ROLE_VET',           'MENU_FARM_QA',       'V,E'),
    ('ROLE_VET',           'MENU_QA_OP',         'V'),

    ('ROLE_FARMER',        'MENU_FARM_DATA',     'V'),
    ('ROLE_FARMER',        'MENU_FARM_DAILY',    'V,C,E'),
    ('ROLE_FARMER',        'MENU_FARM_OVERVIEW', 'V'),

    ('ROLE_QA_MGR',        'MENU_QA_OP',         'V'),
    ('ROLE_QA_MGR',        'MENU_QA_MGR',        'V,C,E,A'),
    ('ROLE_QA_MGR',        'MENU_QA_PRODUCT',    'V,E'),
    ('ROLE_QA_MGR',        'MENU_APPROVAL',      'V,A'),

    ('ROLE_QA_STAFF',      'MENU_QA_OP',         'V,C,E'),
    ('ROLE_QA_STAFF',      'MENU_QA_PRODUCT',    'V'),

    ('ROLE_PKG_MGR',       'MENU_PKG_OP',        'V'),
    ('ROLE_PKG_MGR',       'MENU_PKG_MGR',       'V,C,E'),
    ('ROLE_PKG_MGR',       'MENU_QA_OP',         'V'),
    ('ROLE_PKG_MGR',       'MENU_PACKAGE_RUN',   'V,E'),
    ('ROLE_PKG_MGR',       'MENU_APPROVAL',      'V,A'),

    ('ROLE_PKG_OP',        'MENU_PKG_OP',        'V,C'),
    ('ROLE_PKG_OP',        'MENU_PACKAGE_RUN',   'V'),

    ('ROLE_WMS_MGR',       'MENU_WMS_VIEW',      'V'),
    ('ROLE_WMS_MGR',       'MENU_WMS_INOUT',     'V,E'),
    ('ROLE_WMS_MGR',       'MENU_WMS_OP',        'V,C,E'),
    ('ROLE_WMS_MGR',       'MENU_LOGISTICS',     'V'),
    ('ROLE_WMS_MGR',       'MENU_APPROVAL',      'V,A'),

    ('ROLE_WMS_OP',        'MENU_WMS_INOUT',     'V,C'),
    ('ROLE_WMS_OP',        'MENU_WMS_OP',        'V'),

    ('ROLE_LOG_MGR',       'MENU_LOGISTICS',     'V,E'),
    ('ROLE_LOG_MGR',       'MENU_LOG_DISPATCH',  'V,C,E'),
    ('ROLE_LOG_MGR',       'MENU_LOG_REVIEW',    'V,E,A'),
    ('ROLE_LOG_MGR',       'MENU_APPROVAL',      'V,A'),

    ('ROLE_DRIVER',        'MENU_LOGISTICS',     'V,E'),

    ('ROLE_PDA_OP',        'MENU_WMS_INOUT',     'V,C'),
    ('ROLE_PDA_OP',        'MENU_QA_OP',         'V,C'),
    ('ROLE_PDA_OP',        'MENU_LOGISTICS',     'V,E'),

    ('ROLE_PRC_BUYER',     'MENU_PRC_MGR',       'V,C,E'),
    ('ROLE_PRC_BUYER',     'MENU_WMS_VIEW',      'V'),
    ('ROLE_PRC_BUYER',     'MENU_APPROVAL',      'V'),

    ('ROLE_STORE_MGR',     'MENU_STORE_MGR',     'V,E'),
    ('ROLE_STORE_MGR',     'MENU_POS_CASH',      'V,E,A'),
    ('ROLE_STORE_MGR',     'MENU_POS_STORE',     'V,E'),
    ('ROLE_STORE_MGR',     'MENU_FIN_CLOSE',     'V,E'),
    ('ROLE_STORE_MGR',     'MENU_APPROVAL',      'V,A'),

    ('ROLE_CASHIER',       'MENU_POS_CASH',      'V,C'),
    ('ROLE_CASHIER',       'MENU_POS_STORE',     'V'),

    ('ROLE_B2B_MGR',       'MENU_B2B_SALE',      'V,C,E,A'),
    ('ROLE_B2B_MGR',       'MENU_ORDER_MGR',     'V,E'),
    ('ROLE_B2B_MGR',       'MENU_APPROVAL',      'V,A'),

    ('ROLE_SALES_REP',     'MENU_ORDER_MGR',     'V,C,E'),
    ('ROLE_SALES_REP',     'MENU_B2B_SALE',      'V,C,E'),

    ('ROLE_CUSTOMER_B2B',  'MENU_ORDER_MGR',     'V,C')
) AS perm(role_code, menu_code, perm_codes)
JOIN sys_role r ON r.role_code = perm.role_code
JOIN sys_menu m ON m.menu_code = perm.menu_code;

-- ============== Step 5: 初始化 sys_approval_rule 审批规则 ==============
INSERT INTO sys_approval_rule (doc_type, amount_min, amount_max, currency_code, approver_chain) VALUES
('EXPENSE',     0,        500,      'CNY', '[{"level":1,"role":"ROLE_FARM_MGR"}]'::jsonb),
('EXPENSE',     500.01,   5000,     'CNY', '[{"level":1,"role":"ROLE_FARM_MGR"},{"level":2,"role":"ROLE_REGION_MGR"}]'::jsonb),
('EXPENSE',     5000.01,  50000,    'CNY', '[{"level":1,"role":"ROLE_FARM_MGR"},{"level":2,"role":"ROLE_REGION_MGR"},{"level":3,"role":"ROLE_FIN_ACCT"}]'::jsonb),
('EXPENSE',     50000.01, NULL,     'CNY', '[{"level":1,"role":"ROLE_FARM_MGR"},{"level":2,"role":"ROLE_REGION_MGR"},{"level":3,"role":"ROLE_CEO"}]'::jsonb),
('PRC_ORDER',   0,        50000,    'CNY', '[{"level":1,"role":"ROLE_PRC_BUYER"},{"level":2,"role":"ROLE_REGION_MGR"}]'::jsonb),
('PRC_ORDER',   50000.01, NULL,     'CNY', '[{"level":1,"role":"ROLE_PRC_BUYER"},{"level":2,"role":"ROLE_REGION_MGR"},{"level":3,"role":"ROLE_CEO"}]'::jsonb),
('PRICING_NEW', 0,        NULL,     'CNY', '[{"level":1,"role":"ROLE_FIN_COST"},{"level":2,"role":"ROLE_REGION_MGR"},{"level":3,"role":"ROLE_CEO"}]'::jsonb);

-- ============== Step 6: 初始化 sys_doc_state_lock 状态机锁 ==============
INSERT INTO sys_doc_state_lock (doc_type, locked_state, locked_fields, unlock_role) VALUES
('SALES_ORDER',        'SHIPPED',   '["product_id","quantity","unit_price","customer_id"]'::jsonb,            'ROLE_ADMIN'),
('SALES_ORDER',        'DELIVERED', '["product_id","quantity","unit_price","customer_id"]'::jsonb,            'ROLE_ADMIN'),
('CASH_FLOW',          'APPROVED',  '["amount","currency_code","payer","payee"]'::jsonb,                       'ROLE_ADMIN'),
('PRC_ORDER',          'RECEIVED',  '["supplier_id","spec","quantity","inbound_price"]'::jsonb,                'ROLE_ADMIN'),
('QA_INSPECTION',      'RELEASED',  '["conclusion","test_items","verdict_value"]'::jsonb,                      'ROLE_QA_MGR'),
('QA_INSPECTION',      'REJECTED',  '["conclusion","test_items","verdict_value"]'::jsonb,                      'ROLE_QA_MGR'),
('STORE_DAILY_CLOSE',  'CLOSED',    '["total_amount","total_count","deposited_amount"]'::jsonb,                'ROLE_ADMIN'),
('DELIVERY_RECEIPT',   'SIGNED',    '["signer","sign_time","receipt_photo"]'::jsonb,                           'ROLE_ADMIN');

-- ============== Step 7: 初始化 sys_user 凤凰农业人员 ==============
-- 注: password 在迁移文件 20260531_fix_user_passwords.sql 中使用 pgcrypto 设置为有效值
-- ON CONFLICT DO NOTHING 保证每次部署幂等，不会因重复 INSERT 报错
INSERT INTO sys_user (username, password_hash, real_name, store_code, locale) VALUES
('zhuzhaocun',  '$2b$10$placeholder', '朱兆存',  'ALL',           'zh-CN'),
('fuqiang',     '$2b$10$placeholder', '伏强',    'AREA-VTE',      'zh-CN'),
('wangweihua',  '$2b$10$placeholder', '王玮华',   'ALL',           'zh-CN'),
('liuhantao',   '$2b$10$placeholder', '刘汉涛',   'ALL',           'zh-CN'),
('zhuzhao_an',  '$2b$10$placeholder', '朱召安',   'ALL',           'zh-CN'),
('liushanjun',  '$2b$10$placeholder', '刘善军',   'FARM-MS',       'zh-CN'),
('linhong',     '$2b$10$placeholder', '林宏',    'FARM-MS',       'zh-CN'),
('amei',        '$2b$10$placeholder', '阿美',    'STORE-VTE-001', 'lo-LA'),
('zhuhuiran',   '$2b$10$placeholder', '朱会然',   'AREA-ZHU',      'zh-CN'),
('yue',         '$2b$10$placeholder', '岳',      'AREA-YUE',      'zh-CN'),
('wanglejin',   '$2b$10$placeholder', '王乐金',   'ALL',           'zh-CN'),
('ajian',       '$2b$10$placeholder', '阿坚',    'ALL',           'lo-LA')
ON CONFLICT (username) DO NOTHING;

-- ============== Step 8: 初始化 sys_user_role 用户角色关联 ==============
-- ON CONFLICT DO NOTHING 同样保证幂等
INSERT INTO sys_user_role (user_id, role_id, is_primary)
SELECT u.user_id, r.role_id, ur.is_primary
FROM (VALUES
    ('zhuzhaocun', 'ROLE_CEO',         TRUE),
    ('fuqiang',    'ROLE_REGION_MGR',  TRUE),
    ('wangweihua', 'ROLE_FIN_ACCT',    TRUE),
    ('liuhantao',  'ROLE_FIN_COST',    TRUE),
    ('zhuzhao_an', 'ROLE_FIN_ACCT',    TRUE),
    ('liushanjun', 'ROLE_WMS_MGR',     TRUE),
    ('liushanjun', 'ROLE_FARMER',      FALSE),
    ('linhong',    'ROLE_FARM_MGR',    TRUE),
    ('amei',       'ROLE_STORE_MGR',   TRUE),
    ('amei',       'ROLE_CASHIER',     FALSE),
    ('zhuhuiran',  'ROLE_REGION_MGR',  TRUE),
    ('yue',        'ROLE_REGION_MGR',  TRUE),
    ('wanglejin',  'ROLE_PRC_BUYER',   TRUE),
    ('ajian',      'ROLE_DRIVER',      TRUE)
) AS ur(username, role_code, is_primary)
JOIN sys_user u ON u.username = ur.username
JOIN sys_role r ON r.role_code = ur.role_code
ON CONFLICT (user_id, role_id) DO NOTHING;
