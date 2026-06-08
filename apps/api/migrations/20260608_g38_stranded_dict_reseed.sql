-- ════════════════════════════════════════════════════════════════════════════
-- G38 · 顶级 stranded 字典全量补种（F5 系统性收口，承接 G37）
-- ════════════════════════════════════════════════════════════════════════════
-- 背景：G37 修了 FIN_CONTRIBUTION_TYPE / FIN_RECEIPT_METHOD 两类后，做了
--       「前端 DictSelect 引用的 dict_type」×「apps/api/migrations 实际种过的」全量比对。
--       发现 8 类「前端在用、但生产从未种」的字典——根因同 G34/F5：
--       种子只存在于顶级 migrations/（g4a/g4b/g4c），生产 Deploy 只跑 apps/api/migrations。
--
-- 本迁移补齐（沿用 G2 列范式 + 幂等 NOT EXISTS，绝不 DELETE/UPDATE 已有记录）：
--   有权威值（从顶级 g4* 原样搬运）：
--     FIN_PAYER_TYPE       付款单·付款方类型   （付款单下拉）
--     PRC_URGENCY          采购·紧急程度
--     PRC_QUALITY_STATUS   采购·收货质检状态
--     SAL_RETURN_REASON    销售·退货原因
--     SAL_PAY_METHOD       POS·收款方式
--     SAL_DELIVERY_EXCEPTION 配送·异常类型
--   无既有权威值，用蛋鸡行业标准默认（可在「字典管理」页增改，请兽医/业务确认扩充）：
--     BRD_VACCINE_TYPE     疫苗种类             （免疫页下拉）
--     BRD_VACCINATE_METHOD 接种方式             （免疫页下拉）
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_en, dict_value, sort_no, status)
SELECT v.dict_type, v.dict_code, v.dict_label_zh, v.dict_label_en, v.dict_code, v.sort_no, 'ACTIVE'
FROM (VALUES
  -- ── FIN_PAYER_TYPE（付款方类型；注意与生产已有 PRC_PAYER_TYPE 命名并存）──────
  ('FIN_PAYER_TYPE','COMPANY','公司','Company',10),
  ('FIN_PAYER_TYPE','SHAREHOLDER','股东','Shareholder',20),
  ('FIN_PAYER_TYPE','BORROW','借款','Borrow',30),
  ('FIN_PAYER_TYPE','INTERNAL','内部','Internal',40),
  -- ── PRC_URGENCY（紧急程度）──────────────────────────────────────────────────
  ('PRC_URGENCY','LOW','低','Low',10),
  ('PRC_URGENCY','NORMAL','普通','Normal',20),
  ('PRC_URGENCY','HIGH','高','High',30),
  ('PRC_URGENCY','URGENT','紧急','Urgent',40),
  -- ── PRC_QUALITY_STATUS（收货质检状态）──────────────────────────────────────
  ('PRC_QUALITY_STATUS','PASS','合格','Pass',10),
  ('PRC_QUALITY_STATUS','PARTIAL','部分合格','Partial',20),
  ('PRC_QUALITY_STATUS','REJECT','不合格','Reject',30),
  -- ── SAL_RETURN_REASON（销售退货原因）───────────────────────────────────────
  ('SAL_RETURN_REASON','QUALITY','质量问题','Quality Issue',10),
  ('SAL_RETURN_REASON','WRONG_ITEM','发错货','Wrong Item',20),
  ('SAL_RETURN_REASON','DAMAGED','运输破损','Damaged in Transit',30),
  ('SAL_RETURN_REASON','EXPIRED','临期/过期','Expired',40),
  ('SAL_RETURN_REASON','OVERSTOCK','滞销退货','Overstock',50),
  ('SAL_RETURN_REASON','CUSTOMER_CHANGE','客户改单','Customer Change',60),
  ('SAL_RETURN_REASON','OTHER','其他','Other',99),
  -- ── SAL_PAY_METHOD（POS 收款方式）──────────────────────────────────────────
  ('SAL_PAY_METHOD','CASH','现金','Cash',10),
  ('SAL_PAY_METHOD','TRANSFER','转账','Transfer',20),
  ('SAL_PAY_METHOD','OTHER','其他','Other',99),
  -- ── SAL_DELIVERY_EXCEPTION（配送异常）──────────────────────────────────────
  ('SAL_DELIVERY_EXCEPTION','SHORTAGE','缺货','Shortage',10),
  ('SAL_DELIVERY_EXCEPTION','DAMAGED','破损','Damaged',20),
  ('SAL_DELIVERY_EXCEPTION','REJECTED','客户拒收','Rejected',30),
  ('SAL_DELIVERY_EXCEPTION','LATE','超时','Late',40),
  ('SAL_DELIVERY_EXCEPTION','OTHER','其他','Other',99),
  -- ── BRD_VACCINE_TYPE（疫苗种类·蛋鸡行业默认，可在字典管理页扩充）────────────
  ('BRD_VACCINE_TYPE','ND','新城疫','Newcastle Disease',10),
  ('BRD_VACCINE_TYPE','AI','禽流感','Avian Influenza',20),
  ('BRD_VACCINE_TYPE','IB','传染性支气管炎','Infectious Bronchitis',30),
  ('BRD_VACCINE_TYPE','IBD','传染性法氏囊','Infectious Bursal Disease',40),
  ('BRD_VACCINE_TYPE','FOWL_POX','鸡痘','Fowl Pox',50),
  ('BRD_VACCINE_TYPE','MAREK','马立克','Marek Disease',60),
  ('BRD_VACCINE_TYPE','EDS','减蛋综合征','Egg Drop Syndrome',70),
  ('BRD_VACCINE_TYPE','ILT','传染性喉气管炎','Infectious Laryngotracheitis',80),
  ('BRD_VACCINE_TYPE','OTHER','其他','Other',99),
  -- ── BRD_VACCINATE_METHOD（接种方式·蛋鸡行业默认，可扩充）────────────────────
  ('BRD_VACCINATE_METHOD','DRINK','饮水','Drinking Water',10),
  ('BRD_VACCINATE_METHOD','EYE_NOSE','滴鼻点眼','Eye/Nose Drop',20),
  ('BRD_VACCINATE_METHOD','INJECT_SC','皮下注射','Subcutaneous Injection',30),
  ('BRD_VACCINATE_METHOD','INJECT_IM','肌肉注射','Intramuscular Injection',40),
  ('BRD_VACCINATE_METHOD','SPRAY','喷雾/气雾','Spray',50),
  ('BRD_VACCINATE_METHOD','WING','翅膀刺种','Wing Web',60),
  ('BRD_VACCINATE_METHOD','OTHER','其他','Other',99)
) AS v(dict_type, dict_code, dict_label_zh, dict_label_en, sort_no)
WHERE NOT EXISTS (
  SELECT 1 FROM sys_dict d WHERE d.dict_type = v.dict_type AND d.dict_code = v.dict_code
);
