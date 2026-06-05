-- ═════════════════════════════════════════════════════════════════════════════
-- GLP-1A-2 主数据 seed — 老挝凤凰农业 · 孟赛蛋鸡场
-- ═════════════════════════════════════════════════════════════════════════════
-- 来源：data/生产报表.xlsx（2026-06-01 ~ 06-04）
-- 审计：docs/glp1a1-production-data-mapping-audit.md（§6.3）
-- 阶段：导入前主数据建档（GLP-1A-2）
--
-- 全程幂等（NOT EXISTS guard）；可重复执行不会复制行。
-- 不修改既有数据；只补入审计列出的缺口。
--
-- 注 1：company_code 默认占位 'LPH'（Lao Phoenix Holdings），若实际组织代码
--      不同，需在执行前 sed 替换。Excel 中 AR 截图显示 'PHX001' 是测试数据，
--      不在本 seed 范围内。
-- 注 2：placement_date / 初始数量按 Excel 6.1 当日反推；批次起始信息以 Excel
--      首日数据为依据，若真实建群日期不同，业务方应通过主数据中心修订。
-- 注 3：fin_cash_accounts.opening_balance 一律置 0，期初余额留由现金结转单录入。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. brd_farms（养殖场） ──────────────────────────────────────────────────
INSERT INTO brd_farms (farm_code, farm_name, location, status, houses, capacity, updated_at, store_code)
SELECT 'LPH_MENGSAI', '孟赛蛋鸡场', '老挝 · 北部 · 孟赛', 'ACTIVE', 6, 250000, CURRENT_TIMESTAMP, 'LPH'
WHERE NOT EXISTS (SELECT 1 FROM brd_farms WHERE farm_code='LPH_MENGSAI');

-- ── 2. brd_houses（鸡舍 1-6 号） ───────────────────────────────────────────
INSERT INTO brd_houses (house_code, house_name, farm_code, farm_name, house_type, capacity, current_birds, status, updated_at)
SELECT 'LPH_MS_H1','1号鸡舍','LPH_MENGSAI','孟赛蛋鸡场','LAYING',45000,0,'ACTIVE',CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM brd_houses WHERE house_code='LPH_MS_H1');

INSERT INTO brd_houses (house_code, house_name, farm_code, farm_name, house_type, capacity, current_birds, status, updated_at)
SELECT 'LPH_MS_H2','2号鸡舍','LPH_MENGSAI','孟赛蛋鸡场','LAYING',46000,45551,'ACTIVE',CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM brd_houses WHERE house_code='LPH_MS_H2');

INSERT INTO brd_houses (house_code, house_name, farm_code, farm_name, house_type, capacity, current_birds, status, updated_at)
SELECT 'LPH_MS_H3','3号鸡舍','LPH_MENGSAI','孟赛蛋鸡场','LAYING',40000,37336,'ACTIVE',CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM brd_houses WHERE house_code='LPH_MS_H3');

INSERT INTO brd_houses (house_code, house_name, farm_code, farm_name, house_type, capacity, current_birds, status, updated_at)
SELECT 'LPH_MS_H4','4号鸡舍','LPH_MENGSAI','孟赛蛋鸡场','LAYING',45000,43816,'ACTIVE',CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM brd_houses WHERE house_code='LPH_MS_H4');

INSERT INTO brd_houses (house_code, house_name, farm_code, farm_name, house_type, capacity, current_birds, status, updated_at)
SELECT 'LPH_MS_H5','5号鸡舍','LPH_MENGSAI','孟赛蛋鸡场','LAYING',44000,42368,'ACTIVE',CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM brd_houses WHERE house_code='LPH_MS_H5');

INSERT INTO brd_houses (house_code, house_name, farm_code, farm_name, house_type, capacity, current_birds, status, updated_at)
SELECT 'LPH_MS_H6','6号鸡舍','LPH_MENGSAI','孟赛蛋鸡场','LAYING',43000,41500,'ACTIVE',CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM brd_houses WHERE house_code='LPH_MS_H6');

-- ── 3. brd_flocks（鸡群 — 5 群，2-6 号舍各 1） ───────────────────────────
-- placement_date 反推自 Excel 2026-06-01 当日"日龄"列
INSERT INTO brd_flocks (flock_no, house_code, farm_code, farm_name, strain, placement_date, placement_age, initial_qty, current_qty, status, start_date, target_weeks)
SELECT 'LPH_MS_F02','LPH_MS_H2','LPH_MENGSAI','孟赛蛋鸡场','海兰褐','2025-10-06',1,45600,45551,'ACTIVE','2025-10-06',80
WHERE NOT EXISTS (SELECT 1 FROM brd_flocks WHERE flock_no='LPH_MS_F02');

INSERT INTO brd_flocks (flock_no, house_code, farm_code, farm_name, strain, placement_date, placement_age, initial_qty, current_qty, status, start_date, target_weeks)
SELECT 'LPH_MS_F03','LPH_MS_H3','LPH_MENGSAI','孟赛蛋鸡场','海兰褐','2025-07-06',1,37500,37336,'ACTIVE','2025-07-06',80
WHERE NOT EXISTS (SELECT 1 FROM brd_flocks WHERE flock_no='LPH_MS_F03');

INSERT INTO brd_flocks (flock_no, house_code, farm_code, farm_name, strain, placement_date, placement_age, initial_qty, current_qty, status, start_date, target_weeks)
SELECT 'LPH_MS_F04','LPH_MS_H4','LPH_MENGSAI','孟赛蛋鸡场','海兰褐','2025-07-06',1,44000,43816,'ACTIVE','2025-07-06',80
WHERE NOT EXISTS (SELECT 1 FROM brd_flocks WHERE flock_no='LPH_MS_F04');

INSERT INTO brd_flocks (flock_no, house_code, farm_code, farm_name, strain, placement_date, placement_age, initial_qty, current_qty, status, start_date, target_weeks)
SELECT 'LPH_MS_F05','LPH_MS_H5','LPH_MENGSAI','孟赛蛋鸡场','海兰褐','2025-12-24',1,42500,42368,'ACTIVE','2025-12-24',80
WHERE NOT EXISTS (SELECT 1 FROM brd_flocks WHERE flock_no='LPH_MS_F05');

INSERT INTO brd_flocks (flock_no, house_code, farm_code, farm_name, strain, placement_date, placement_age, initial_qty, current_qty, status, start_date, target_weeks)
SELECT 'LPH_MS_F06','LPH_MS_H6','LPH_MENGSAI','孟赛蛋鸡场','海兰褐','2025-12-24',1,41700,41500,'ACTIVE','2025-12-24',80
WHERE NOT EXISTS (SELECT 1 FROM brd_flocks WHERE flock_no='LPH_MS_F06');

-- ── 4. mst_products（饲料 7 + 蛋托 1 + 柴油 1） ──────────────────────────
INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, status, has_grade, has_spec)
SELECT 'FEED_CORN','Corn','玉米','公斤','FEED','ACTIVE',false,false
WHERE NOT EXISTS (SELECT 1 FROM mst_products WHERE product_code='FEED_CORN');

INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, status, has_grade, has_spec)
SELECT 'FEED_SOY_MEAL','Soybean Meal','豆粕','公斤','FEED','ACTIVE',false,false
WHERE NOT EXISTS (SELECT 1 FROM mst_products WHERE product_code='FEED_SOY_MEAL');

INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, status, has_grade, has_spec)
SELECT 'FEED_PREMIX','Premix','预混料','公斤','FEED','ACTIVE',false,false
WHERE NOT EXISTS (SELECT 1 FROM mst_products WHERE product_code='FEED_PREMIX');

INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, status, has_grade, has_spec)
SELECT 'FEED_PREMIX_YOUNG','Young Premix','青年预混料','公斤','FEED','ACTIVE',false,false
WHERE NOT EXISTS (SELECT 1 FROM mst_products WHERE product_code='FEED_PREMIX_YOUNG');

INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, status, has_grade, has_spec)
SELECT 'FEED_SOY_OIL','Soybean Oil','豆油','公斤','FEED','ACTIVE',false,false
WHERE NOT EXISTS (SELECT 1 FROM mst_products WHERE product_code='FEED_SOY_OIL');

INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, status, has_grade, has_spec)
SELECT 'FEED_LIMESTONE','Limestone Powder','石粉','公斤','FEED','ACTIVE',false,false
WHERE NOT EXISTS (SELECT 1 FROM mst_products WHERE product_code='FEED_LIMESTONE');

INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, status, has_grade, has_spec)
SELECT 'FEED_RICE_BRAN','Rice Bran','米糠','公斤','FEED','ACTIVE',false,false
WHERE NOT EXISTS (SELECT 1 FROM mst_products WHERE product_code='FEED_RICE_BRAN');

INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, status, has_grade, has_spec)
SELECT 'PKG_EGG_TRAY','Egg Tray','蛋托','个','PACKAGING','ACTIVE',false,false
WHERE NOT EXISTS (SELECT 1 FROM mst_products WHERE product_code='PKG_EGG_TRAY');

INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, status, has_grade, has_spec)
SELECT 'FUEL_DIESEL','Diesel','柴油','升','FUEL','ACTIVE',false,false
WHERE NOT EXISTS (SELECT 1 FROM mst_products WHERE product_code='FUEL_DIESEL');

-- 鸡蛋产品（共享 product_code = EGG，靠 grade_code 区分 XL/L/M/S/XS/DIRTY/BROKEN）
INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, status, has_grade, has_spec)
SELECT 'EGG','Chicken Egg','鸡蛋','枚','FINISHED_GOODS','ACTIVE',true,false
WHERE NOT EXISTS (SELECT 1 FROM mst_products WHERE product_code='EGG');

-- ── 5. prc2_suppliers（供应商 3） ─────────────────────────────────────────
INSERT INTO prc2_suppliers (supplier_code, supplier_name, country_code, supplier_type, default_currency, status, is_active, shared_scope, credit_days)
SELECT 'SUP_ZHONGLIANG','中粮鞠德清','CN','RAW_MATERIAL','CNY','ACTIVE',true,'GROUP',30
WHERE NOT EXISTS (SELECT 1 FROM prc2_suppliers WHERE supplier_code='SUP_ZHONGLIANG');

INSERT INTO prc2_suppliers (supplier_code, supplier_name, country_code, supplier_type, default_currency, status, is_active, shared_scope, credit_days)
SELECT 'SUP_XU','胥总','LA','RAW_MATERIAL','LAK','ACTIVE',true,'GROUP',30
WHERE NOT EXISTS (SELECT 1 FROM prc2_suppliers WHERE supplier_code='SUP_XU');

INSERT INTO prc2_suppliers (supplier_code, supplier_name, country_code, supplier_type, default_currency, status, is_active, shared_scope, credit_days)
SELECT 'SUP_VTE_TRAY','万象蛋托厂','LA','PACKAGING','LAK','ACTIVE',true,'GROUP',30
WHERE NOT EXISTS (SELECT 1 FROM prc2_suppliers WHERE supplier_code='SUP_VTE_TRAY');

-- ── 6. sal_customers（客户 11） ────────────────────────────────────────────
-- company_code 默认 'LPH'，业务实际可能不同，需替换
INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
SELECT 'CUS_MH_AF','蒙混阿峰','WHOLESALE','LPH','老挝凤凰农业','ACTIVE','NORMAL'
WHERE NOT EXISTS (SELECT 1 FROM sal_customers WHERE customer_no='CUS_MH_AF');

INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
SELECT 'CUS_MH_PP','蒙混胖胖','WHOLESALE','LPH','老挝凤凰农业','ACTIVE','NORMAL'
WHERE NOT EXISTS (SELECT 1 FROM sal_customers WHERE customer_no='CUS_MH_PP');

INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
SELECT 'CUS_SY','沙耶武里','WHOLESALE','LPH','老挝凤凰农业','ACTIVE','NORMAL'
WHERE NOT EXISTS (SELECT 1 FROM sal_customers WHERE customer_no='CUS_SY');

INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
SELECT 'CUS_LB_STORE','拉邦直营店','STORE','LPH','老挝凤凰农业','ACTIVE','NORMAL'
WHERE NOT EXISTS (SELECT 1 FROM sal_customers WHERE customer_no='CUS_LB_STORE');

INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
SELECT 'CUS_MS_STORE','孟赛直营店','STORE','LPH','老挝凤凰农业','ACTIVE','NORMAL'
WHERE NOT EXISTS (SELECT 1 FROM sal_customers WHERE customer_no='CUS_MS_STORE');

INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
SELECT 'CUS_VTE_STORE','万象直营店','STORE','LPH','老挝凤凰农业','ACTIVE','NORMAL'
WHERE NOT EXISTS (SELECT 1 FROM sal_customers WHERE customer_no='CUS_VTE_STORE');

INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
SELECT 'CUS_BLK_STORE','波利坎赛合营店','STORE','LPH','老挝凤凰农业','ACTIVE','NORMAL'
WHERE NOT EXISTS (SELECT 1 FROM sal_customers WHERE customer_no='CUS_BLK_STORE');

INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
SELECT 'CUS_DP_HX','东鹏（会晒）','WHOLESALE','LPH','老挝凤凰农业','ACTIVE','NORMAL'
WHERE NOT EXISTS (SELECT 1 FROM sal_customers WHERE customer_no='CUS_DP_HX');

INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
SELECT 'CUS_VTE_LB','万象刘彬','WHOLESALE','LPH','老挝凤凰农业','ACTIVE','NORMAL'
WHERE NOT EXISTS (SELECT 1 FROM sal_customers WHERE customer_no='CUS_VTE_LB');

INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
SELECT 'CUS_FSL','风沙里文代','WHOLESALE','LPH','老挝凤凰农业','ACTIVE','NORMAL'
WHERE NOT EXISTS (SELECT 1 FROM sal_customers WHERE customer_no='CUS_FSL');

INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
SELECT 'CUS_RETAIL','零售','RETAIL','LPH','老挝凤凰农业','ACTIVE','NORMAL'
WHERE NOT EXISTS (SELECT 1 FROM sal_customers WHERE customer_no='CUS_RETAIL');

-- ── 7. fin_cash_accounts（资金账户 4） ────────────────────────────────────
INSERT INTO fin_cash_accounts (account_code, account_name, company_code, company_name, currency_code, account_type, opening_balance, current_balance, status, remark)
SELECT 'CASH_LAK','老挝币现金','LPH','老挝凤凰农业','LAK','CASH',0,0,'ACTIVE','Excel 现金收支表 — 老挝币现金账户'
WHERE NOT EXISTS (SELECT 1 FROM fin_cash_accounts WHERE account_code='CASH_LAK');

INSERT INTO fin_cash_accounts (account_code, account_name, company_code, company_name, currency_code, account_type, opening_balance, current_balance, status, remark)
SELECT 'WECHAT_LAK','老挝币微信','LPH','老挝凤凰农业','LAK','EWALLET',0,0,'ACTIVE','Excel 现金收支表 — 老挝币微信钱包'
WHERE NOT EXISTS (SELECT 1 FROM fin_cash_accounts WHERE account_code='WECHAT_LAK');

INSERT INTO fin_cash_accounts (account_code, account_name, company_code, company_name, currency_code, account_type, opening_balance, current_balance, status, remark)
SELECT 'CASH_CNY','人民币现金','LPH','老挝凤凰农业','CNY','CASH',0,0,'ACTIVE','Excel 现金收支表 — 人民币现金账户'
WHERE NOT EXISTS (SELECT 1 FROM fin_cash_accounts WHERE account_code='CASH_CNY');

INSERT INTO fin_cash_accounts (account_code, account_name, company_code, company_name, currency_code, account_type, opening_balance, current_balance, status, remark)
SELECT 'WECHAT_CNY','人民币微信','LPH','老挝凤凰农业','CNY','EWALLET',0,0,'ACTIVE','Excel 现金收支表 — 人民币微信钱包'
WHERE NOT EXISTS (SELECT 1 FROM fin_cash_accounts WHERE account_code='WECHAT_CNY');

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证 SQL（手工执行确认）：
--   SELECT 'brd_farms' tbl, count(*) c FROM brd_farms WHERE farm_code='LPH_MENGSAI'
--   UNION ALL
--   SELECT 'brd_houses', count(*) FROM brd_houses WHERE farm_code='LPH_MENGSAI'
--   UNION ALL
--   SELECT 'brd_flocks', count(*) FROM brd_flocks WHERE farm_code='LPH_MENGSAI'
--   UNION ALL
--   SELECT 'mst_products', count(*) FROM mst_products WHERE product_code LIKE 'FEED_%' OR product_code IN ('PKG_EGG_TRAY','FUEL_DIESEL','EGG')
--   UNION ALL
--   SELECT 'prc2_suppliers', count(*) FROM prc2_suppliers WHERE supplier_code LIKE 'SUP_%'
--   UNION ALL
--   SELECT 'sal_customers', count(*) FROM sal_customers WHERE customer_no LIKE 'CUS_%'
--   UNION ALL
--   SELECT 'fin_cash_accounts', count(*) FROM fin_cash_accounts WHERE account_code IN ('CASH_LAK','WECHAT_LAK','CASH_CNY','WECHAT_CNY');
--   -- 期望：1 / 6 / 5 / 10 / 3 / 11 / 4
-- ═════════════════════════════════════════════════════════════════════════════
