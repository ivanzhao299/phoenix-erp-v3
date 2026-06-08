-- ═════════════════════════════════════════════════════════════════════════════
-- G34 · 王玮华 fin_cash_transactions 历史流水 ETL（Excel 6.01-6.04）
-- ═════════════════════════════════════════════════════════════════════════════
-- 数据源：
--   /data/王玮华/老挝凤凰农业发展有限公司资金日记账-2026.06.xlsx (sheets 6.01-6.04)
--   /data/王玮华/老挝东鹏县星驰农业资金日记账_2026.06.xlsx (sheets 6.1, 6.2, 6.3-4)
-- 字段映射：
--   amount = inv|outv (本币)         direction = IN|OUT
--   currency_code = 账户币种           txn_date = Excel 日期列
--   balance_after = Excel 本币余额    remark = Excel 摘要 + " [Excel导入]"
--   created_by = 'wangweihua'         account_id = JOIN fin_cash_accounts.id
-- 幂等：txn_no = WWH-<yyyymmdd>-<account_code>-<序号> 全局唯一
-- 总计：93 笔（凤凰 51 + 星驰 42）
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-FH-CASH-CNY-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 252280.00, 262650.00,
       '2026-06-01 00:00:00+07'::timestamptz, '收赵总投资款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-FH-CASH-CNY-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-FH-CASH-CNY-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 252280.00, 10370.00,
       '2026-06-01 00:00:00+07'::timestamptz, '付李涛鞠总2车豆柏款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-FH-CASH-CNY-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-FH-SL-BCEL-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 196977000.00, 778190132.53,
       '2026-06-01 00:00:00+07'::timestamptz, '收款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-FH-SL-BCEL-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-FH-SL-BCEL-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 2000000.00, 776190132.53,
       '2026-06-01 00:00:00+07'::timestamptz, '付厢货车加油 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-FH-SL-BCEL-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-FH-SL-BCEL-LAK-003', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 106400000.00, 669790132.53,
       '2026-06-01 00:00:00+07'::timestamptz, '付140000个托盘款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-FH-SL-BCEL-LAK-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-FH-SL-BCEL-LAK-004', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 6000.00, 669784132.53,
       '2026-06-01 00:00:00+07'::timestamptz, '付转款手续费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-FH-SL-BCEL-LAK-004');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-FH-SL-BCEL-LAK-005', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 317816000.00, 351968132.53,
       '2026-06-01 00:00:00+07'::timestamptz, '付五米款2车53330公斤＋54590公斤 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-FH-SL-BCEL-LAK-005');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-FH-SL-BCEL-LAK-006', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 5290000.00, 346678132.53,
       '2026-06-01 00:00:00+07'::timestamptz, '付5.29万象直营店、万象刘彬鸡蛋物流费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-FH-SL-BCEL-LAK-006');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-FH-SL-BCEL-LAK-007', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 1000.00, 346677132.63,
       '2026-06-01 00:00:00+07'::timestamptz, '付转款手续费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-FH-SL-BCEL-LAK-007');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-FH-SL-LDB-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 610000.00, 478087359.59,
       '2026-06-01 00:00:00+07'::timestamptz, '收款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-FH-SL-LDB-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-FH-SL-LDB-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 470000000.00, 8087359.59,
       '2026-06-01 00:00:00+07'::timestamptz, '付玉米款2车53330公斤＋54590公斤 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-FH-SL-LDB-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-XC-CASH-CNY-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 44529.00, 289403.90,
       '2026-06-01 00:00:00+07'::timestamptz, '收东鹏5.28鸡蛋款、5.29公鸡款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-XC-CASH-CNY-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-XC-LDB-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 1701000.00, 8793389.06,
       '2026-06-01 00:00:00+07'::timestamptz, '付会晒去孟帕送鸡蛋及转款手续费（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-XC-LDB-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-XC-LDB-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 214000000.00, 222793389.06,
       '2026-06-01 00:00:00+07'::timestamptz, '收会晒鸡蛋款（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-XC-LDB-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-XC-LDB-LAK-003', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 36000000.00, 258793389.06,
       '2026-06-01 00:00:00+07'::timestamptz, '收南塔鸡蛋款（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-XC-LDB-LAK-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-XC-LDB-LAK-004', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 11350000.00, 247443389.06,
       '2026-06-01 00:00:00+07'::timestamptz, '付大车维修费用（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-XC-LDB-LAK-004');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-XC-LDB-LAK-005', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 558000.00, 246885389.06,
       '2026-06-01 00:00:00+07'::timestamptz, '付海总4.30日4820玉米款32.04吨（LDB）（实际198648000，前期存在重复支付，此车补差付款） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-XC-LDB-LAK-005');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260601-WWH-XC-LDB-LAK-006', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 198214000.00, 48671389.06,
       '2026-06-01 00:00:00+07'::timestamptz, '付海总5.2日1942车31.97吨玉米款（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260601-WWH-XC-LDB-LAK-006');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-CASH-CNY-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 13922.22, 24292.22,
       '2026-06-02 00:00:00+07'::timestamptz, '收赵总投资款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-CASH-CNY-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-CASH-CNY-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 122.22, 24170.00,
       '2026-06-02 00:00:00+07'::timestamptz, '付钱涛报销购四季开花矮桩组合花种 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-CASH-CNY-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-CASH-CNY-003', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 13800.00, 10370.00,
       '2026-06-02 00:00:00+07'::timestamptz, '付孝荣杰采购三松（山东）新能源空气能1台（付款王翊嘉账户） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-CASH-CNY-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-LDB-CNY-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 167000.00, 170958.79,
       '2026-06-02 00:00:00+07'::timestamptz, '5.21收东鹏种蛋款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-LDB-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-LDB-CNY-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-LDB-CNY-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 50.00, 170908.79,
       '2026-06-02 00:00:00+07'::timestamptz, '5.21付手续费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-LDB-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-LDB-CNY-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-LDB-CNY-003', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 108000.00, 278908.79,
       '2026-06-02 00:00:00+07'::timestamptz, '5.22收东鹏种蛋款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-LDB-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-LDB-CNY-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-LDB-CNY-004', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 10.00, 278898.79,
       '2026-06-02 00:00:00+07'::timestamptz, '5.22付手续费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-LDB-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-LDB-CNY-004');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-LDB-CNY-005', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 221000.00, 57898.79,
       '2026-06-02 00:00:00+07'::timestamptz, '5.22付东鹏种蛋款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-LDB-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-LDB-CNY-005');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-LDB-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', -32000.00, 912000.00,
       '2026-06-02 00:00:00+07'::timestamptz, '调整费用 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-LDB-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-LDB-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 56000.00, 856000.00,
       '2026-06-02 00:00:00+07'::timestamptz, '26年11月-26年5月手续费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-LDB-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-LDB-THB-001', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'THB', 176.00, 1626.00,
       '2026-06-02 00:00:00+07'::timestamptz, '25年11月-26年5月手续费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-LDB-THB'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-LDB-THB-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-LDB-THB-002', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'THB', 1000.00, 2626.00,
       '2026-06-02 00:00:00+07'::timestamptz, '3.2收款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-LDB-THB'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-LDB-THB-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-LDB-USD-001', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'USD', 3.60, 91.00,
       '2026-06-02 00:00:00+07'::timestamptz, '25年11月-26年5月手续费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-LDB-USD'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-LDB-USD-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-FH-SL-BCEL-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 33677000.00, 0,
       '2026-06-02 00:00:00+07'::timestamptz, '收款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-FH-SL-BCEL-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-XC-BCEL-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 500000.00, 1424934.57,
       '2026-06-02 00:00:00+07'::timestamptz, '货车超重罚款（BCEL） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-XC-BCEL-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-XC-BCEL-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 400000.00, 1024934.57,
       '2026-06-02 00:00:00+07'::timestamptz, '南塔司机2人吃饭（BCEL） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-XC-BCEL-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-XC-CASH-CNY-001', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 225470.00, 63933.90,
       '2026-06-02 00:00:00+07'::timestamptz, '付泰国豆粕款1080000泰铢/4.79汇率 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-XC-CASH-CNY-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-XC-CASH-CNY-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 2088.00, 61845.90,
       '2026-06-02 00:00:00+07'::timestamptz, '付沙耶武里营业执照费用10000泰铢/4.79汇率 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-XC-CASH-CNY-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-XC-CASH-CNY-003', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 1369.00, 60476.90,
       '2026-06-02 00:00:00+07'::timestamptz, '付会晒营业执照费用6560泰铢/4.79汇率 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-XC-CASH-CNY-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-XC-LDB-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 2350000.00, 46321389.06,
       '2026-06-02 00:00:00+07'::timestamptz, '付2540皮卡加油（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-XC-LDB-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-XC-LDB-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 9594500.00, 36726889.06,
       '2026-06-02 00:00:00+07'::timestamptz, '红色大货车加油及转款手续费（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-XC-LDB-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260602-WWH-XC-LDB-LAK-003', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 200000.00, 36526889.06,
       '2026-06-02 00:00:00+07'::timestamptz, '南塔工人住宿（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260602-WWH-XC-LDB-LAK-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-CASH-CNY-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 2900.00, 13270.00,
       '2026-06-03 00:00:00+07'::timestamptz, '收赵总投资款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-CASH-CNY-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-CASH-CNY-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 2700.00, 10570.00,
       '2026-06-03 00:00:00+07'::timestamptz, '付岳明琅勃拉邦直营店喷绘材料款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-CASH-CNY-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-CASH-CNY-003', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 100.00, 10470.00,
       '2026-06-03 00:00:00+07'::timestamptz, '付范镇豪报销万象直营店喷绘 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-CASH-CNY-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-CASH-CNY-004', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 100.00, 10370.00,
       '2026-06-03 00:00:00+07'::timestamptz, '付范镇豪报销琅勃拉邦直营店喷绘运费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-CASH-CNY-004');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-CASH-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 447000000.00, 636515000.00,
       '2026-06-03 00:00:00+07'::timestamptz, '5.21-5.31收孟赛直营店现金 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-CASH-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-CASH-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 29500000.00, 666015000.00,
       '2026-06-03 00:00:00+07'::timestamptz, '收孟混阿峰鸡蛋款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-CASH-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-CASH-LAK-003', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 36000000.00, 702015000.00,
       '2026-06-03 00:00:00+07'::timestamptz, '收沙耶武里阿宽鸡蛋款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-CASH-LAK-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-SL-BCEL-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 17125000.00, 397479132.53,
       '2026-06-03 00:00:00+07'::timestamptz, '收款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-SL-BCEL-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-SL-BCEL-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 110000000.00, 507479132.53,
       '2026-06-03 00:00:00+07'::timestamptz, '收万象直营店款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-SL-BCEL-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-SL-BCEL-LAK-003', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 70000000.00, 577479132.53,
       '2026-06-03 00:00:00+07'::timestamptz, '收万象直营店款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-SL-BCEL-LAK-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-SL-BCEL-LAK-004', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 17122000.00, 594601132.53,
       '2026-06-03 00:00:00+07'::timestamptz, '收波利坎赛直营店款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-SL-BCEL-LAK-004');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-SL-BCEL-LAK-005', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 594550000.00, 51132.53,
       '2026-06-03 00:00:00+07'::timestamptz, '付玉米款2车55950公斤+55850公斤 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-SL-BCEL-LAK-005');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-SL-LDB-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 47400000.00, 55487359.59,
       '2026-06-03 00:00:00+07'::timestamptz, '收款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-SL-LDB-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-FH-SL-LDB-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 55400000.00, 87359.59,
       '2026-06-03 00:00:00+07'::timestamptz, '付玉米款2车55950公斤+55850公斤 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-FH-SL-LDB-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-BCEL-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 24000000.00, 25024934.57,
       '2026-06-03 00:00:00+07'::timestamptz, '收南塔客户回款（BCEL） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-BCEL-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-BCEL-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 1401000.00, 23623934.57,
       '2026-06-03 00:00:00+07'::timestamptz, '付转运证两次费用及转款手续费（BCEL） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-BCEL-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-BCEL-LAK-003', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 1000000.00, 22623934.57,
       '2026-06-03 00:00:00+07'::timestamptz, '付2961沙耶武里回会晒费用（BCEL） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-BCEL-LAK-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-BCEL-LAK-004', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 36000000.00, 58623934.57,
       '2026-06-03 00:00:00+07'::timestamptz, '收会晒直营店鸡蛋款（BCEL） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-BCEL-LAK-004');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-BCEL-LAK-005', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 40000000.00, 18623934.57,
       '2026-06-03 00:00:00+07'::timestamptz, '付海总5.2日2391车玉米款32吨（BCEL） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-BCEL-LAK-005');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-BCEL-LAK-006', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 16000000.00, 2623934.57,
       '2026-06-03 00:00:00+07'::timestamptz, '调整 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-BCEL-LAK-006');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-CASH-CNY-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 26450.00, 86926.90,
       '2026-06-03 00:00:00+07'::timestamptz, '收东鹏直营店31号鸡蛋、公鸡款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-CASH-CNY-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-CASH-CNY-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 1320.00, 85606.90,
       '2026-06-03 00:00:00+07'::timestamptz, '付工人加班费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-CASH-CNY-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-CASH-CNY-003', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 1500.00, 84106.90,
       '2026-06-03 00:00:00+07'::timestamptz, '付公安收费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-CASH-CNY-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-CASH-CNY-004', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 10235.00, 73871.90,
       '2026-06-03 00:00:00+07'::timestamptz, '付购废纸壳费用 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-CASH-CNY-004');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-CASH-CNY-005', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 16000.00, 57871.90,
       '2026-06-03 00:00:00+07'::timestamptz, '付朱会然领取25年3-4月份工资 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-CASH-CNY-005');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-CASH-CNY-006', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 1515.00, 59386.90,
       '2026-06-03 00:00:00+07'::timestamptz, '收朱会然销售鸡 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-CASH-CNY-006');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-CASH-CNY-007', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 4830.00, 64216.90,
       '2026-06-03 00:00:00+07'::timestamptz, '收朱会然销售鸡蛋 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-CASH-CNY-007');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-CASH-CNY-008', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 15046.00, 79262.90,
       '2026-06-03 00:00:00+07'::timestamptz, '收东鹏直营店2号鸡蛋款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-CASH-CNY-008');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-LDB-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 2001000.00, 34525889.06,
       '2026-06-03 00:00:00+07'::timestamptz, '付会晒小货车加油费用及转款手续费（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-LDB-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-LDB-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 920000.00, 33605889.06,
       '2026-06-03 00:00:00+07'::timestamptz, '付请农林厅吃饭费用（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-LDB-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-LDB-LAK-003', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 109000000.00, 142605889.06,
       '2026-06-03 00:00:00+07'::timestamptz, '收会晒直营店鸡蛋款（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-LDB-LAK-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-LDB-LAK-004', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 158400000.00, -15794110.94,
       '2026-06-03 00:00:00+07'::timestamptz, '付海总5.2日2391车玉米款32吨（LDB） [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-LDB-LAK-004');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260603-WWH-XC-LDB-LAK-005', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 16000000.00, 205889.06,
       '2026-06-03 00:00:00+07'::timestamptz, '调整 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260603-WWH-XC-LDB-LAK-005');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-CASH-CNY-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 30.00, 10400.00,
       '2026-06-04 00:00:00+07'::timestamptz, '收赵总投资款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-CASH-CNY-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-CASH-CNY-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'CNY', 30.00, 10370.00,
       '2026-06-04 00:00:00+07'::timestamptz, '付李荣杰空气能叉车费用 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-CASH-CNY-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-CASH-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 22700000.00, 679315000.00,
       '2026-06-04 00:00:00+07'::timestamptz, '付三名职工辞职5月份工资 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-CASH-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-CASH-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 9490000.00, 669825000.00,
       '2026-06-04 00:00:00+07'::timestamptz, '付一车玉米运费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-CASH-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-CASH-LAK-003', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 8100000.00, 677925000.00,
       '2026-06-04 00:00:00+07'::timestamptz, '收个人鸡蛋款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-CASH-LAK-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-CASH-LAK-004', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 12000000.00, 689925000.00,
       '2026-06-04 00:00:00+07'::timestamptz, '收个人渣土款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-CASH-LAK-004');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-CASH-LAK-005', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 1020000.00, 690945000.00,
       '2026-06-04 00:00:00+07'::timestamptz, '收职工购鸡蛋款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-CASH-LAK-005');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-CASH-LAK-006', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 680000.00, 691625000.00,
       '2026-06-04 00:00:00+07'::timestamptz, '收职工购鸡蛋款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-CASH-LAK-006');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-CASH-LAK-007', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 257000000.00, 434625000.00,
       '2026-06-04 00:00:00+07'::timestamptz, '存现金 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-CASH-LAK-007');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-CASH-LAK-008', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 120000000.00, 314625000.00,
       '2026-06-04 00:00:00+07'::timestamptz, '6.1存现金 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-CASH-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-CASH-LAK-008');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-SL-BCEL-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 214031000.00, 214082132.53,
       '2026-06-04 00:00:00+07'::timestamptz, '收款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-SL-BCEL-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-SL-BCEL-LAK-002', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 257000000.00, 471082132.53,
       '2026-06-04 00:00:00+07'::timestamptz, '存现金 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-SL-BCEL-LAK-002');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-SL-BCEL-LAK-003', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 21000000.00, 450082132.53,
       '2026-06-04 00:00:00+07'::timestamptz, '付蛋托运费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-SL-BCEL-LAK-003');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-SL-BCEL-LAK-004', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 3000.00, 450079132.53,
       '2026-06-04 00:00:00+07'::timestamptz, '付转款手续费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-SL-BCEL-LAK-004');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-SL-BCEL-LAK-005', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 4040000.00, 446039132.53,
       '2026-06-04 00:00:00+07'::timestamptz, '付高栏车加油 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-SL-BCEL-LAK-005');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-SL-BCEL-LAK-006', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 166190000.00, 279849132.53,
       '2026-06-04 00:00:00+07'::timestamptz, '付玉米款2车尾款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-SL-BCEL-LAK-006');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-SL-BCEL-LAK-007', a.id, a.account_code, a.account_name, a.company_code,
       'OUT', 'LAK', 6000.00, 279843132.53,
       '2026-06-04 00:00:00+07'::timestamptz, '付转款手续费 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-BCEL-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-SL-BCEL-LAK-007');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-FH-SL-LDB-LAK-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'LAK', 157300000.00, 157387359.59,
       '2026-06-04 00:00:00+07'::timestamptz, '收鸡蛋款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-FH-SL-LDB-LAK'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-FH-SL-LDB-LAK-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-XC-CASH-CNY-001', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 100155.50, 179418.40,
       '2026-06-04 00:00:00+07'::timestamptz, '收特区截止6.4公鸡、鸡蛋款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-XC-CASH-CNY-001');
INSERT INTO fin_cash_transactions (txn_no, account_id, account_code, account_name, company_code, direction, currency_code, amount, balance_after, txn_date, remark, created_by, created_at)
SELECT 'WWH-20260604-WWH-XC-CASH-CNY-002', a.id, a.account_code, a.account_name, a.company_code,
       'IN', 'CNY', 33701.00, 213119.40,
       '2026-06-04 00:00:00+07'::timestamptz, '收东鹏直营店6.1号鸡蛋、公鸡款 [Excel导入]', 'wangweihua', now()
  FROM fin_cash_accounts a WHERE a.account_code='WWH-XC-CASH-CNY'
  AND NOT EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.txn_no='WWH-20260604-WWH-XC-CASH-CNY-002');

-- ─── 反推 opening_balance（首笔 balance_after - 首笔金额（IN）或 + 首笔金额（OUT））────────
UPDATE fin_cash_accounts a
   SET opening_balance = CASE WHEN sub.first_dir='IN'
                              THEN sub.first_bal - sub.first_amt
                              ELSE sub.first_bal + sub.first_amt END,
       updated_at=now()
  FROM (
    SELECT DISTINCT ON (account_code)
           account_code, balance_after AS first_bal, amount AS first_amt, direction AS first_dir
      FROM fin_cash_transactions
     WHERE account_code LIKE 'WWH-%' AND created_by='wangweihua'
     ORDER BY account_code, txn_date ASC, id ASC
  ) sub
 WHERE a.account_code = sub.account_code;

-- ─── 更新 current_balance（每账户最后一笔 balance_after）──────────────────
UPDATE fin_cash_accounts a
   SET current_balance = sub.last_bal, updated_at=now()
  FROM (
    SELECT DISTINCT ON (account_code) account_code, balance_after AS last_bal
      FROM fin_cash_transactions
     WHERE account_code LIKE 'WWH-%' AND created_by='wangweihua'
     ORDER BY account_code, txn_date DESC, id DESC
  ) sub
 WHERE a.account_code = sub.account_code;

COMMIT;
