-- ════════════════════════════════════════════════════════════════════════
-- G2 数据字典治理 — 第一批枚举迁入 sys_dict + 主数据生效日期列
-- ────────────────────────────────────────────────────────────────────────
-- 依据：docs/master-data-governance-phase-g0-blueprint.md 第 2 章字典建议
-- ⚠️ 遵守数据保护规则：仅幂等 INSERT 新字典项（WHERE NOT EXISTS），
--    绝不 DELETE / UPDATE sys_dict 已有记录。
-- ════════════════════════════════════════════════════════════════════════

-- ① 第一批 8 个枚举迁入 sys_dict（dict_value = dict_code；中文 dict_label_zh）─
INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_en, dict_value, sort_no, status)
SELECT v.dict_type, v.dict_code, v.dict_label_zh, v.dict_label_en, v.dict_code, v.sort_no, 'ACTIVE'
FROM (VALUES
  -- 货币
  ('SYS_CURRENCY','CNY','人民币','CNY',1),
  ('SYS_CURRENCY','LAK','老挝基普','LAK',2),
  ('SYS_CURRENCY','THB','泰铢','THB',3),
  ('SYS_CURRENCY','USD','美元','USD',4),
  ('SYS_CURRENCY','VND','越南盾','VND',5),
  -- 客户类型
  ('SAL_CUSTOMER_TYPE','DIRECT_STORE','直营门店','Direct Store',1),
  ('SAL_CUSTOMER_TYPE','DISTRIBUTOR','经销商','Distributor',2),
  ('SAL_CUSTOMER_TYPE','AGENT','代理商','Agent',3),
  ('SAL_CUSTOMER_TYPE','KEY_ACCOUNT','大客户','Key Account',4),
  ('SAL_CUSTOMER_TYPE','RETAIL','零售客户','Retail',5),
  -- 费用类型
  ('FIN_EXPENSE_TYPE','TRAVEL','差旅费','Travel',1),
  ('FIN_EXPENSE_TYPE','MEAL','餐饮费','Meal',2),
  ('FIN_EXPENSE_TYPE','ENTERTAINMENT','招待费','Entertainment',3),
  ('FIN_EXPENSE_TYPE','OFFICE','办公费','Office',4),
  ('FIN_EXPENSE_TYPE','MATERIAL','物料费','Material',5),
  ('FIN_EXPENSE_TYPE','TRANSPORT','运输费','Transport',6),
  ('FIN_EXPENSE_TYPE','OTHER','其他','Other',9),
  -- 付款方式
  ('PRC_PAYMENT_METHOD','BANK','银行转账','Bank Transfer',1),
  ('PRC_PAYMENT_METHOD','CASH','现金','Cash',2),
  ('PRC_PAYMENT_METHOD','TRANSFER','转账','Transfer',3),
  ('PRC_PAYMENT_METHOD','ALIPAY','支付宝','Alipay',4),
  ('PRC_PAYMENT_METHOD','WECHAT','微信','WeChat',5),
  -- 资金性质
  ('FIN_FUND_NATURE','INVESTMENT','投资款','Investment',1),
  ('FIN_FUND_NATURE','LOAN','借款','Loan',2),
  ('FIN_FUND_NATURE','ADVANCE','垫资','Advance',3),
  ('FIN_FUND_NATURE','NORMAL','普通','Normal',4),
  -- 付款方类型
  ('PRC_PAYER_TYPE','COMPANY','公司','Company',1),
  ('PRC_PAYER_TYPE','SHAREHOLDER','股东代付','Shareholder',2),
  ('PRC_PAYER_TYPE','BORROW','借款方','Borrower',3),
  ('PRC_PAYER_TYPE','INTERNAL','内部','Internal',4),
  -- 采购类型
  ('PRC_PURCHASE_TYPE','MATERIAL','原料','Material',1),
  ('PRC_PURCHASE_TYPE','EQUIPMENT','设备','Equipment',2),
  ('PRC_PURCHASE_TYPE','SERVICE','服务','Service',3),
  ('PRC_PURCHASE_TYPE','FIXED_ASSET','固定资产','Fixed Asset',4),
  ('PRC_PURCHASE_TYPE','OTHER','其他','Other',9),
  -- 国家
  ('SYS_COUNTRY','LA','老挝','Laos',1),
  ('SYS_COUNTRY','CN','中国','China',2),
  ('SYS_COUNTRY','TH','泰国','Thailand',3),
  ('SYS_COUNTRY','VN','越南','Vietnam',4),
  ('SYS_COUNTRY','US','美国','USA',5),
  ('SYS_COUNTRY','OTHER','其他','Other',9)
) AS v(dict_type, dict_code, dict_label_zh, dict_label_en, sort_no)
WHERE NOT EXISTS (
  SELECT 1 FROM sys_dict d WHERE d.dict_type = v.dict_type AND d.dict_code = v.dict_code
);

-- ② 主数据生效日期治理（effective_date / expire_date，可空，非破坏）──────────
DO $$
DECLARE t text;
  tbls text[] := ARRAY['sal_customers','prc2_suppliers','shr_projects','shr_shareholders','mst_bank_accounts','fin_cash_accounts'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS effective_date DATE', t);
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS expire_date    DATE', t);
    END IF;
  END LOOP;
  RAISE NOTICE 'G2: effective_date/expire_date 已为关键主数据表补齐';
END $$;
