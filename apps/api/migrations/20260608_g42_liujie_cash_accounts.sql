-- ════════════════════════════════════════════════════════════════════════════
-- G42 · 刘杰资金账户导入（凤凰27 + 东鹏10）→ fin_cash_accounts
-- ════════════════════════════════════════════════════════════════════════════
-- 来源：data/刘杰/账号（凤凰鸡场）.xlsx + 账号（东鹏鸡场）.xlsx（精确 Excel）。
-- 编码加 FH-/DP- 前缀，避免与 G34（王玮华 WWH-* 17 账户）撞码；持卡人/使用部门/原编码入 remark。
-- 凤凰=集团伞，company 统一 COMP-LAO-AGRI（凤凰农业）；东鹏=COMP-LAO-XINGCHI（星驰）。
-- 余额 Excel 无 → 0；币种按名称推断（人民币CNY/泰铢THB/美元USD/其余老挝LAK）。
-- 幂等：WHERE NOT EXISTS (account_code)。created_by='liujie_import'。
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO fin_cash_accounts
  (account_code, account_name, company_code, company_name, account_type, bank_name, bank_account_no,
   currency_code, opening_balance, current_balance, status, remark, created_by, created_at, updated_at)
SELECT v.* FROM (VALUES
-- ── 凤凰鸡场（COMP-LAO-AGRI / 凤凰农业）──────────────────────────────────────
('FH-09',    '波利坎赛备用金',          'COMP-LAO-AGRI','凤凰农业','CASH',NULL,NULL,                       'LAK',0.00,0.00,'ACTIVE','凤凰·波利坎赛 备用金｜原编码09','liujie_import',now(),now()),
('FH-101',   '总部现金人民币',          'COMP-LAO-AGRI','凤凰农业','CASH',NULL,NULL,                       'CNY',0.00,0.00,'ACTIVE','凤凰·总部｜原编码101','liujie_import',now(),now()),
('FH-102',   '总部现金老挝币',          'COMP-LAO-AGRI','凤凰农业','CASH',NULL,NULL,                       'LAK',0.00,0.00,'ACTIVE','凤凰·总部｜原编码102','liujie_import',now(),now()),
('FH-10201', '平安银行88888卡',         'COMP-LAO-AGRI','凤凰农业','BANK','平安银行','6230 5837 0846 8888 888','CNY',0.00,0.00,'ACTIVE','凤凰·持卡人 宋雷｜原编码10201','liujie_import',now(),now()),
('FH-10202', 'BCEL老挝公户-老挝币',     'COMP-LAO-AGRI','凤凰农业','BANK','BCEL','0631100470484',          'LAK',0.00,0.00,'ACTIVE','凤凰鸡场公户｜原编码10202','liujie_import',now(),now()),
('FH-10203', 'BCEL老挝公户-人民币户',   'COMP-LAO-AGRI','凤凰农业','BANK','BCEL',NULL,                     'CNY',0.00,0.00,'ACTIVE','凤凰鸡场公户｜原编码10203','liujie_import',now(),now()),
('FH-10204', 'BCEL老挝公户-泰铢',       'COMP-LAO-AGRI','凤凰农业','BANK','BCEL',NULL,                     'THB',0.00,0.00,'ACTIVE','凤凰鸡场公户｜原编码10204','liujie_import',now(),now()),
('FH-10205', 'BCEL老挝公户-美元',       'COMP-LAO-AGRI','凤凰农业','BANK','BCEL',NULL,                     'USD',0.00,0.00,'ACTIVE','凤凰鸡场公户｜原编码10205','liujie_import',now(),now()),
('FH-10206', '宋总个人LDB（老挝卡）5611','COMP-LAO-AGRI','凤凰农业','BANK','LDB','0300 5004 1001 5611',     'LAK',0.00,0.00,'ACTIVE','凤凰·持卡人 宋雷（个人代收代付）｜原编码10206','liujie_import',now(),now()),
('FH-10207', '宋总个人BCEL老挝币781',   'COMP-LAO-AGRI','凤凰农业','BANK','BCEL','0601241552781',          'LAK',0.00,0.00,'ACTIVE','凤凰·持卡人 宋雷（个人）｜原编码10207','liujie_import',now(),now()),
('FH-10208', '宋总个人BCEL人民币卡996', 'COMP-LAO-AGRI','凤凰农业','BANK','BCEL','0601241552996',          'CNY',0.00,0.00,'ACTIVE','凤凰·持卡人 宋雷（个人）｜原编码10208','liujie_import',now(),now()),
('FH-10209', 'LDB老挝公司户老挝币卡',   'COMP-LAO-AGRI','凤凰农业','BANK','LDB','03005000 1000 1416',       'LAK',0.00,0.00,'ACTIVE','凤凰鸡场公户｜原编码10209','liujie_import',now(),now()),
('FH-10210', 'LDB老挝公司户-美元户',    'COMP-LAO-AGRI','凤凰农业','BANK','LDB','0300 5010 1000 0144',      'USD',0.00,0.00,'ACTIVE','凤凰鸡场公户｜原编码10210','liujie_import',now(),now()),
('FH-10211', 'LDB老挝公司户-泰铢',      'COMP-LAO-AGRI','凤凰农业','BANK','LDB','0300 5020 1000 0115',      'THB',0.00,0.00,'ACTIVE','凤凰鸡场公户｜原编码10211','liujie_import',now(),now()),
('FH-10212', 'LDB老挝公司户-人民币',    'COMP-LAO-AGRI','凤凰农业','BANK','LDB','0300 5100 1000 0107',      'CNY',0.00,0.00,'ACTIVE','凤凰鸡场公户｜原编码10212','liujie_import',now(),now()),
('FH-103',   '孟赛现金',                'COMP-LAO-AGRI','凤凰农业','CASH',NULL,NULL,                       'LAK',0.00,0.00,'ACTIVE','凤凰·孟赛｜原编码103','liujie_import',now(),now()),
('FH-104',   '万象仓库现金',            'COMP-LAO-AGRI','凤凰农业','CASH',NULL,NULL,                       'LAK',0.00,0.00,'ACTIVE','凤凰·万象仓库｜原编码104','liujie_import',now(),now()),
('FH-105',   '波利坎赛现金',            'COMP-LAO-AGRI','凤凰农业','CASH',NULL,NULL,                       'LAK',0.00,0.00,'ACTIVE','凤凰·波利坎赛｜原编码105','liujie_import',now(),now()),
('FH-106',   '琅勃拉邦现金',            'COMP-LAO-AGRI','凤凰农业','CASH',NULL,NULL,                       'LAK',0.00,0.00,'ACTIVE','凤凰·琅勃拉邦｜原编码106','liujie_import',now(),now()),
('FH-203',   '孟赛银行LDB',             'COMP-LAO-AGRI','凤凰农业','BANK','LDB','0300 5004 1001 5611',      'LAK',0.00,0.00,'ACTIVE','凤凰·孟赛 持卡人 宋雷｜原编码203','liujie_import',now(),now()),
('FH-204',   '孟赛银行BCEL',            'COMP-LAO-AGRI','凤凰农业','BANK','BCEL',NULL,                     'LAK',0.00,0.00,'ACTIVE','凤凰·孟赛 持卡人 宋明光｜原编码204','liujie_import',now(),now()),
('FH-205',   '万象仓库银行LDB',         'COMP-LAO-AGRI','凤凰农业','BANK','LDB','0300 5004 1001 7785',      'LAK',0.00,0.00,'ACTIVE','凤凰·万象仓库 持卡人 黄国磊｜原编码205','liujie_import',now(),now()),
('FH-206',   '万象仓库银行BCEL',        'COMP-LAO-AGRI','凤凰农业','BANK','BCEL','62913500 2088 8164',      'LAK',0.00,0.00,'ACTIVE','凤凰·万象仓库 持卡人 黄国磊｜原编码206','liujie_import',now(),now()),
('FH-207',   '波利坎赛银行LDB',         'COMP-LAO-AGRI','凤凰农业','BANK','LDB','0300500410017784',         'LAK',0.00,0.00,'ACTIVE','凤凰·波利坎赛 持卡人 薛峰｜原编码207','liujie_import',now(),now()),
('FH-208',   '波利坎赛银行BCEL',        'COMP-LAO-AGRI','凤凰农业','BANK','BCEL','6291350020736140',        'LAK',0.00,0.00,'ACTIVE','凤凰·波利坎赛 持卡人 薛峰｜原编码208','liujie_import',now(),now()),
('FH-209',   '琅勃拉邦银行LDB',         'COMP-LAO-AGRI','凤凰农业','BANK','LDB',NULL,                      'LAK',0.00,0.00,'ACTIVE','凤凰·琅勃拉邦｜原编码209','liujie_import',now(),now()),
('FH-210',   '琅勃拉邦银行BCEL',        'COMP-LAO-AGRI','凤凰农业','BANK','BCEL',NULL,                     'LAK',0.00,0.00,'ACTIVE','凤凰·琅勃拉邦 持卡人 宋明光｜原编码210','liujie_import',now(),now()),
-- ── 东鹏鸡场（COMP-LAO-XINGCHI / 东鹏星驰）──────────────────────────────────
('DP-01',    '总部现金（人民币）',      'COMP-LAO-XINGCHI','东鹏星驰','CASH',NULL,NULL,                    'CNY',0.00,0.00,'ACTIVE','东鹏·公司总部｜原编码01','liujie_import',now(),now()),
('DP-04',    '会晒现金（基普）',        'COMP-LAO-XINGCHI','东鹏星驰','CASH',NULL,NULL,                    'LAK',0.00,0.00,'ACTIVE','东鹏·会晒直营店｜原编码04','liujie_import',now(),now()),
('DP-05',    '总部现金（基普）',        'COMP-LAO-XINGCHI','东鹏星驰','CASH',NULL,NULL,                    'LAK',0.00,0.00,'ACTIVE','东鹏·公司总部｜原编码05','liujie_import',now(),now()),
('DP-06',    '会晒LDB银行（2001）',     'COMP-LAO-XINGCHI','东鹏星驰','BANK','LDB','0301 9004 1000 2001',  'LAK',0.00,0.00,'ACTIVE','东鹏·会晒 持卡人 伏强（伏强卡）｜原编码06','liujie_import',now(),now()),
('DP-07',    '会晒BCEL银行（16）',      'COMP-LAO-XINGCHI','东鹏星驰','BANK','BCEL','16',                  'LAK',0.00,0.00,'ACTIVE','东鹏·会晒 持卡人 伏强（伏强卡）｜原编码07','liujie_import',now(),now()),
('DP-08c',   '沙耶武里现金（基普）',    'COMP-LAO-XINGCHI','东鹏星驰','CASH',NULL,NULL,                    'LAK',0.00,0.00,'ACTIVE','东鹏·沙耶武里直营店｜原编码08','liujie_import',now(),now()),
('DP-09',    '沙耶武里LDB',             'COMP-LAO-XINGCHI','东鹏星驰','BANK','LDB','111',                 'LAK',0.00,0.00,'ACTIVE','东鹏·沙耶武里直营店｜原编码09','liujie_import',now(),now()),
('DP-10',    '总部LDB卡',               'COMP-LAO-XINGCHI','东鹏星驰','BANK','LDB','0330 4004 1000 5155',  'LAK',0.00,0.00,'ACTIVE','东鹏·总部 持卡人 朱召安（朱召安卡）｜原编码10','liujie_import',now(),now()),
('DP-11',    '总部BCEL卡',              'COMP-LAO-XINGCHI','东鹏星驰','BANK','BCEL','1131232388839',       'LAK',0.00,0.00,'ACTIVE','东鹏·总部 持卡人 朱召安（朱召安卡）｜原编码11','liujie_import',now(),now()),
('DP-08b',   '沙耶武里BCEL',            'COMP-LAO-XINGCHI','东鹏星驰','BANK','BCEL','111',                 'LAK',0.00,0.00,'ACTIVE','东鹏·沙耶武里直营店｜原编码8','liujie_import',now(),now())
) AS v(account_code, account_name, company_code, company_name, account_type, bank_name, bank_account_no,
       currency_code, opening_balance, current_balance, status, remark, created_by, created_at, updated_at)
WHERE NOT EXISTS (SELECT 1 FROM fin_cash_accounts a WHERE a.account_code = v.account_code);
