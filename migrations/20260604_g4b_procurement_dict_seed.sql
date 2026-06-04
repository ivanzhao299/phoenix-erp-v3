-- ════════════════════════════════════════════════════════════════════════════
-- G4-B · Procurement Document Runtime Refactor — sys_dict 种子
-- ════════════════════════════════════════════════════════════════════════════
-- 为 G4-B 改造引入的采购字典补齐 sys_dict 数据。
--
-- 新增 dict_type：
--   PRC_PURCHASE_TYPE     采购类型（PR/PO/RFQ 共用）
--   PRC_URGENCY           紧急程度
--   PRC_QUALITY_STATUS    收货质检状态
--
-- 已存在的 dict_type 不在本迁移内：
--   SYS_CURRENCY         （由 G2 阶段植入）
--   PRC_PAYMENT_METHOD   （由 G2 阶段植入；G4-A 已使用）
--   FIN_FUND_NATURE      （G4-A 已植入）
--
-- 幂等：所有 INSERT 均带 NOT EXISTS 保护，可重复执行。
-- ════════════════════════════════════════════════════════════════════════════

-- ── PRC_PURCHASE_TYPE ───────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'STANDARD','PRC_PURCHASE_TYPE','标准采购','标准采购','Standard',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='STANDARD' AND dict_type='PRC_PURCHASE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'URGENT','PRC_PURCHASE_TYPE','紧急采购','紧急采购','Urgent',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='URGENT' AND dict_type='PRC_PURCHASE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'STRATEGIC','PRC_PURCHASE_TYPE','战略采购','战略采购','Strategic',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='STRATEGIC' AND dict_type='PRC_PURCHASE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'SERVICE','PRC_PURCHASE_TYPE','服务采购','服务采购','Service',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SERVICE' AND dict_type='PRC_PURCHASE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'CROSS_BORDER','PRC_PURCHASE_TYPE','跨境采购','跨境采购','Cross-Border',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CROSS_BORDER' AND dict_type='PRC_PURCHASE_TYPE');

-- ── PRC_URGENCY ─────────────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'LOW','PRC_URGENCY','低','低','Low',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LOW' AND dict_type='PRC_URGENCY');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'NORMAL','PRC_URGENCY','普通','普通','Normal',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='NORMAL' AND dict_type='PRC_URGENCY');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'HIGH','PRC_URGENCY','高','高','High',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='HIGH' AND dict_type='PRC_URGENCY');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'URGENT','PRC_URGENCY','紧急','紧急','Urgent',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='URGENT' AND dict_type='PRC_URGENCY');

-- ── PRC_QUALITY_STATUS ──────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PASS','PRC_QUALITY_STATUS','合格','合格','Pass',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PASS' AND dict_type='PRC_QUALITY_STATUS');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PARTIAL','PRC_QUALITY_STATUS','部分合格','部分合格','Partial',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PARTIAL' AND dict_type='PRC_QUALITY_STATUS');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'REJECT','PRC_QUALITY_STATUS','不合格','不合格','Reject',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='REJECT' AND dict_type='PRC_QUALITY_STATUS');
