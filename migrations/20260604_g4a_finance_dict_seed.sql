-- ════════════════════════════════════════════════════════════════════════════
-- G4-A · Finance Document Runtime Refactor — sys_dict 种子
-- ════════════════════════════════════════════════════════════════════════════
-- 目标：为 G4-A 改造引入的 5 个金融字典补齐 sys_dict 数据，使前端
--       <DictSelect> 能在新装数据库 / 测试环境直接渲染选项。
--
-- 已存在的 dict_type 不在本迁移内：
--   SYS_CURRENCY               （由 G2 阶段植入）
--   PRC_PAYMENT_METHOD         （由 G2 阶段植入）
--
-- 新增 dict_type：
--   FIN_PAYER_TYPE        付款方类型（COMPANY/SHAREHOLDER/BORROW/INTERNAL）
--   FIN_FUND_NATURE       资金性质（INVESTMENT/LOAN/ADVANCE/NORMAL/EQUITY/DIVIDEND_OFFSET）
--   FIN_EXPENSE_TYPE      费用类型（TRAVEL/MEAL/ENTERTAINMENT/OFFICE/MATERIAL/TRANSPORT/OTHER）
--   FIN_RECEIPT_METHOD    收款方式（BANK/CHECK/CASH/ONLINE/OTHER）
--   FIN_CONTRIBUTION_TYPE 股东出资类型（INVESTMENT/LOAN/ADVANCE/GUARANTEE/PAYMENT_ON_BEHALF）
--
-- 幂等：所有 INSERT 均带 NOT EXISTS 保护，可重复执行。
-- ════════════════════════════════════════════════════════════════════════════

-- ── FIN_PAYER_TYPE ──────────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'COMPANY','FIN_PAYER_TYPE','公司','公司','Company',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='COMPANY' AND dict_type='FIN_PAYER_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'SHAREHOLDER','FIN_PAYER_TYPE','股东','股东','Shareholder',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SHAREHOLDER' AND dict_type='FIN_PAYER_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'BORROW','FIN_PAYER_TYPE','借款','借款','Borrow',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='BORROW' AND dict_type='FIN_PAYER_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'INTERNAL','FIN_PAYER_TYPE','内部','内部','Internal',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='INTERNAL' AND dict_type='FIN_PAYER_TYPE');

-- ── FIN_FUND_NATURE ─────────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'INVESTMENT','FIN_FUND_NATURE','投资款','投资款','Investment',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='INVESTMENT' AND dict_type='FIN_FUND_NATURE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'LOAN','FIN_FUND_NATURE','借款','借款','Loan',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LOAN' AND dict_type='FIN_FUND_NATURE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'ADVANCE','FIN_FUND_NATURE','垫付','垫付','Advance',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='ADVANCE' AND dict_type='FIN_FUND_NATURE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'NORMAL','FIN_FUND_NATURE','普通','普通','Normal',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='NORMAL' AND dict_type='FIN_FUND_NATURE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'EQUITY','FIN_FUND_NATURE','股权出资','股权出资','Equity Contribution',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='EQUITY' AND dict_type='FIN_FUND_NATURE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'DIVIDEND_OFFSET','FIN_FUND_NATURE','分红转投资','分红转投资','Dividend Offset',60,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='DIVIDEND_OFFSET' AND dict_type='FIN_FUND_NATURE');

-- ── FIN_EXPENSE_TYPE ────────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'TRAVEL','FIN_EXPENSE_TYPE','差旅','差旅','Travel',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='TRAVEL' AND dict_type='FIN_EXPENSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'MEAL','FIN_EXPENSE_TYPE','餐饮','餐饮','Meal',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='MEAL' AND dict_type='FIN_EXPENSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'ENTERTAINMENT','FIN_EXPENSE_TYPE','招待','招待','Entertainment',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='ENTERTAINMENT' AND dict_type='FIN_EXPENSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OFFICE','FIN_EXPENSE_TYPE','办公','办公','Office',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OFFICE' AND dict_type='FIN_EXPENSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'MATERIAL','FIN_EXPENSE_TYPE','物料','物料','Material',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='MATERIAL' AND dict_type='FIN_EXPENSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'TRANSPORT','FIN_EXPENSE_TYPE','交通','交通','Transport',60,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='TRANSPORT' AND dict_type='FIN_EXPENSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OTHER','FIN_EXPENSE_TYPE','其他','其他','Other',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OTHER' AND dict_type='FIN_EXPENSE_TYPE');

-- ── FIN_RECEIPT_METHOD ──────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'BANK','FIN_RECEIPT_METHOD','银行转账','银行转账','Bank Transfer',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='BANK' AND dict_type='FIN_RECEIPT_METHOD');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'CHECK','FIN_RECEIPT_METHOD','支票','支票','Check',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CHECK' AND dict_type='FIN_RECEIPT_METHOD');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'CASH','FIN_RECEIPT_METHOD','现金','现金','Cash',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CASH' AND dict_type='FIN_RECEIPT_METHOD');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'ONLINE','FIN_RECEIPT_METHOD','线上支付','线上支付','Online Payment',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='ONLINE' AND dict_type='FIN_RECEIPT_METHOD');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OTHER','FIN_RECEIPT_METHOD','其他','其他','Other',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OTHER' AND dict_type='FIN_RECEIPT_METHOD');

-- ── FIN_CONTRIBUTION_TYPE ───────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'INVESTMENT','FIN_CONTRIBUTION_TYPE','股权投资','股权投资','Equity Investment',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='INVESTMENT' AND dict_type='FIN_CONTRIBUTION_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'LOAN','FIN_CONTRIBUTION_TYPE','借款','借款','Loan',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LOAN' AND dict_type='FIN_CONTRIBUTION_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'ADVANCE','FIN_CONTRIBUTION_TYPE','垫资','垫资','Advance',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='ADVANCE' AND dict_type='FIN_CONTRIBUTION_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'GUARANTEE','FIN_CONTRIBUTION_TYPE','担保金','担保金','Guarantee',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='GUARANTEE' AND dict_type='FIN_CONTRIBUTION_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PAYMENT_ON_BEHALF','FIN_CONTRIBUTION_TYPE','代付','代付','Payment On Behalf',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PAYMENT_ON_BEHALF' AND dict_type='FIN_CONTRIBUTION_TYPE');
