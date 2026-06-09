-- ════════════════════════════════════════════════════════════════════════
-- G63：F5 回填 7 个缺失字典（数据质量驾驶舱告警 MISSING_DICT_TYPE）
-- ════════════════════════════════════════════════════════════════════════
-- 根因：SAL_*/INV_STOCK_STATUS/PKG_DEFECT 字典种子仅在【顶级 migrations/】
--   g4c/g4d/g4e，生产 Deploy 只跑 apps/api/migrations/（F5/G36 锁定）→ 生产无 ACTIVE 条目。
-- 核验（G40 教训）：PKG_EGG_GRADE 已被 g5_cleanup 主动标 DEPRECATED（切 product_grades）
--   → 数据质量告警对它是【假阳性】，本迁移【不补种】。其余 7 类真缺、且代码有引用。
-- sys_dict 保护：仅幂等 INSERT（WHERE NOT EXISTS），不 UPDATE/DELETE 已有记录。
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT v.code, v.typ, v.zh, v.zh, v.en, v.so, 'ACTIVE'
FROM (VALUES
  -- SAL_ORDER_TYPE 订单类型
  ('NORMAL','SAL_ORDER_TYPE','普通订单','Normal Order',10),
  ('PRESALE','SAL_ORDER_TYPE','预售','Pre-Sale',20),
  ('CONSIGN','SAL_ORDER_TYPE','寄售','Consignment',30),
  ('EXPORT','SAL_ORDER_TYPE','出口','Export',40),
  -- SAL_CHANNEL 销售渠道
  ('DIRECT','SAL_CHANNEL','直营','Direct',10),
  ('DEALER','SAL_CHANNEL','经销商','Dealer',20),
  ('ONLINE','SAL_CHANNEL','电商','Online',30),
  ('WHOLESALE','SAL_CHANNEL','批发','Wholesale',40),
  ('POS','SAL_CHANNEL','门店 POS','POS',50),
  -- SAL_FULFILLMENT_TYPE 履约方式
  ('SELF_PICKUP','SAL_FULFILLMENT_TYPE','自提','Self Pickup',10),
  ('OWN_DELIVERY','SAL_FULFILLMENT_TYPE','自有配送','Own Delivery',20),
  ('LOGISTICS','SAL_FULFILLMENT_TYPE','物流','Logistics',30),
  ('COURIER','SAL_FULFILLMENT_TYPE','快递','Courier',40),
  -- SAL_PRICE_TYPE 价格类型
  ('STANDARD','SAL_PRICE_TYPE','标准价','Standard Price',10),
  ('MEMBER','SAL_PRICE_TYPE','会员价','Member Price',20),
  ('PROMOTION','SAL_PRICE_TYPE','促销价','Promotion',30),
  ('NEGOTIATED','SAL_PRICE_TYPE','协议价','Negotiated',40),
  ('SPECIAL','SAL_PRICE_TYPE','特批价','Special Approval',50),
  -- SAL_SETTLEMENT_METHOD 结算方式
  ('PREPAID','SAL_SETTLEMENT_METHOD','预付','Prepaid',10),
  ('CASH_ON_DELIVERY','SAL_SETTLEMENT_METHOD','货到付款','COD',20),
  ('MONTHLY','SAL_SETTLEMENT_METHOD','月结','Monthly Net',30),
  ('CREDIT','SAL_SETTLEMENT_METHOD','赊销','Credit',40),
  -- INV_STOCK_STATUS 批次库存状态（5 态 · CLAUDE.md 唯一来源）
  ('AVAILABLE','INV_STOCK_STATUS','可用','Available',10),
  ('RESERVED','INV_STOCK_STATUS','已预留','Reserved',20),
  ('QUARANTINE','INV_STOCK_STATUS','隔离','Quarantine',30),
  ('DAMAGED','INV_STOCK_STATUS','破损','Damaged',40),
  ('FROZEN','INV_STOCK_STATUS','冻结','Frozen',50),
  -- PKG_DEFECT 包装缺陷
  ('PACKAGE_BROKEN','PKG_DEFECT','包装破损','Package Broken',10),
  ('LABEL_MISSING','PKG_DEFECT','标签缺失','Label Missing',20),
  ('WEIGHT_DEVIATION','PKG_DEFECT','重量偏差','Weight Deviation',30),
  ('CONTAMINATION','PKG_DEFECT','污染','Contamination',40),
  ('OTHER','PKG_DEFECT','其他','Other',99)
) AS v(code, typ, zh, en, so)
WHERE NOT EXISTS (SELECT 1 FROM sys_dict d WHERE d.dict_type = v.typ AND d.dict_code = v.code);
