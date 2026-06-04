-- ════════════════════════════════════════════════════════════════════════════
-- G4-C · Sales Runtime Refactor — sys_dict 种子
-- ════════════════════════════════════════════════════════════════════════════
-- 为 G4-C 销售单据改造引入的字典补齐 sys_dict 数据。
--
-- 新增 dict_type：
--   SAL_ORDER_TYPE           销售订单类型
--   SAL_CHANNEL              销售渠道（备用：渠道主数据 sal_channels 优先）
--   SAL_FULFILLMENT_TYPE     履约类型（自提/配送/物流/快递）
--   SAL_RETURN_REASON        销售退货原因
--   SAL_PRICE_TYPE           价格类型（标准/会员/促销/特批）
--   SAL_SETTLEMENT_METHOD    结算方式
--   SAL_PAY_METHOD           POS 收款方式
--   SAL_DELIVERY_EXCEPTION   配送异常类型
--
-- 幂等：所有 INSERT 均带 NOT EXISTS 保护，可重复执行。
-- ════════════════════════════════════════════════════════════════════════════

-- ── SAL_ORDER_TYPE ──────────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'NORMAL','SAL_ORDER_TYPE','普通订单','普通订单','Normal Order',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='NORMAL' AND dict_type='SAL_ORDER_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PRESALE','SAL_ORDER_TYPE','预售','预售','Pre-Sale',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PRESALE' AND dict_type='SAL_ORDER_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'CONSIGN','SAL_ORDER_TYPE','寄售','寄售','Consignment',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CONSIGN' AND dict_type='SAL_ORDER_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'EXPORT','SAL_ORDER_TYPE','出口','出口','Export',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='EXPORT' AND dict_type='SAL_ORDER_TYPE');

-- ── SAL_CHANNEL ─────────────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'DIRECT','SAL_CHANNEL','直营','直营','Direct',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='DIRECT' AND dict_type='SAL_CHANNEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'DEALER','SAL_CHANNEL','经销商','经销商','Dealer',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='DEALER' AND dict_type='SAL_CHANNEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'ONLINE','SAL_CHANNEL','电商','电商','Online',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='ONLINE' AND dict_type='SAL_CHANNEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'WHOLESALE','SAL_CHANNEL','批发','批发','Wholesale',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='WHOLESALE' AND dict_type='SAL_CHANNEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'POS','SAL_CHANNEL','门店 POS','门店 POS','POS',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='POS' AND dict_type='SAL_CHANNEL');

-- ── SAL_FULFILLMENT_TYPE ────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'SELF_PICKUP','SAL_FULFILLMENT_TYPE','自提','自提','Self Pickup',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SELF_PICKUP' AND dict_type='SAL_FULFILLMENT_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OWN_DELIVERY','SAL_FULFILLMENT_TYPE','自有配送','自有配送','Own Delivery',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OWN_DELIVERY' AND dict_type='SAL_FULFILLMENT_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'LOGISTICS','SAL_FULFILLMENT_TYPE','物流','物流','Logistics',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LOGISTICS' AND dict_type='SAL_FULFILLMENT_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'COURIER','SAL_FULFILLMENT_TYPE','快递','快递','Courier',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='COURIER' AND dict_type='SAL_FULFILLMENT_TYPE');

-- ── SAL_RETURN_REASON ───────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'QUALITY','SAL_RETURN_REASON','质量问题','质量问题','Quality Issue',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='QUALITY' AND dict_type='SAL_RETURN_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'WRONG_ITEM','SAL_RETURN_REASON','发错货','发错货','Wrong Item',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='WRONG_ITEM' AND dict_type='SAL_RETURN_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'DAMAGED','SAL_RETURN_REASON','运输破损','运输破损','Damaged in Transit',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='DAMAGED' AND dict_type='SAL_RETURN_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'EXPIRED','SAL_RETURN_REASON','临期/过期','临期/过期','Expired',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='EXPIRED' AND dict_type='SAL_RETURN_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OVERSTOCK','SAL_RETURN_REASON','滞销退货','滞销退货','Overstock',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OVERSTOCK' AND dict_type='SAL_RETURN_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'CUSTOMER_CHANGE','SAL_RETURN_REASON','客户改单','客户改单','Customer Change',60,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CUSTOMER_CHANGE' AND dict_type='SAL_RETURN_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OTHER','SAL_RETURN_REASON','其他','其他','Other',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OTHER' AND dict_type='SAL_RETURN_REASON');

-- ── SAL_PRICE_TYPE ──────────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'STANDARD','SAL_PRICE_TYPE','标准价','标准价','Standard Price',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='STANDARD' AND dict_type='SAL_PRICE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'MEMBER','SAL_PRICE_TYPE','会员价','会员价','Member Price',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='MEMBER' AND dict_type='SAL_PRICE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PROMOTION','SAL_PRICE_TYPE','促销价','促销价','Promotion',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PROMOTION' AND dict_type='SAL_PRICE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'NEGOTIATED','SAL_PRICE_TYPE','协议价','协议价','Negotiated',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='NEGOTIATED' AND dict_type='SAL_PRICE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'SPECIAL','SAL_PRICE_TYPE','特批价','特批价','Special Approval',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SPECIAL' AND dict_type='SAL_PRICE_TYPE');

-- ── SAL_SETTLEMENT_METHOD ───────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PREPAID','SAL_SETTLEMENT_METHOD','预付','预付','Prepaid',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PREPAID' AND dict_type='SAL_SETTLEMENT_METHOD');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'CASH_ON_DELIVERY','SAL_SETTLEMENT_METHOD','货到付款','货到付款','COD',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CASH_ON_DELIVERY' AND dict_type='SAL_SETTLEMENT_METHOD');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'MONTHLY','SAL_SETTLEMENT_METHOD','月结','月结','Monthly Net',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='MONTHLY' AND dict_type='SAL_SETTLEMENT_METHOD');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'CREDIT','SAL_SETTLEMENT_METHOD','赊销','赊销','Credit',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CREDIT' AND dict_type='SAL_SETTLEMENT_METHOD');

-- ── SAL_PAY_METHOD（POS 收款方式）─────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'CASH','SAL_PAY_METHOD','现金','现金','Cash',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CASH' AND dict_type='SAL_PAY_METHOD');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'TRANSFER','SAL_PAY_METHOD','转账','转账','Transfer',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='TRANSFER' AND dict_type='SAL_PAY_METHOD');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OTHER','SAL_PAY_METHOD','其他','其他','Other',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OTHER' AND dict_type='SAL_PAY_METHOD');

-- ── SAL_DELIVERY_EXCEPTION（配送异常）────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'SHORTAGE','SAL_DELIVERY_EXCEPTION','缺货','缺货','Shortage',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SHORTAGE' AND dict_type='SAL_DELIVERY_EXCEPTION');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'DAMAGED','SAL_DELIVERY_EXCEPTION','破损','破损','Damaged',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='DAMAGED' AND dict_type='SAL_DELIVERY_EXCEPTION');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'REJECTED','SAL_DELIVERY_EXCEPTION','客户拒收','客户拒收','Rejected',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='REJECTED' AND dict_type='SAL_DELIVERY_EXCEPTION');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'LATE','SAL_DELIVERY_EXCEPTION','超时','超时','Late',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LATE' AND dict_type='SAL_DELIVERY_EXCEPTION');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OTHER','SAL_DELIVERY_EXCEPTION','其他','其他','Other',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OTHER' AND dict_type='SAL_DELIVERY_EXCEPTION');
