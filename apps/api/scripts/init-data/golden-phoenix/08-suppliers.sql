-- ============================================================
-- Golden Phoenix · 生产初始化数据包  08 供应商（Suppliers）
-- 目标表：prc2_suppliers（Procurement V2 正式供应商表；禁止写 prc_suppliers 旧表）
--   实体来源：apps/api/src/modules/procurement-v2/entities/prc2-supplier.entity.ts
-- 原则：
--   · 供应商不建系统账号
--   · supplier_code 唯一；幂等 ON CONFLICT (supplier_code) DO NOTHING
--   · supplier_type ∈ FEED / VACCINE / VETERINARY / EQUIPMENT / PACKAGING / CHICK / SERVICE / OTHER
--   · shared_scope=GROUP（集团共享）；country_code=CN（均为中国供应商）
--   · 联系人/电话缺失不阻断，remark 标注 DATA_INCOMPLETE
-- ============================================================
BEGIN;

INSERT INTO prc2_suppliers
  (supplier_code, supplier_name, supplier_type, country_code, default_currency,
   shared_scope, status, is_active, remark)
VALUES
  ('SUP-HBAGD-001', '湖北艾格多', 'FEED',       'CN', 'CNY', 'GROUP', 'ACTIVE', TRUE, '饲料/添加剂；DATA_INCOMPLETE: contact,phone'),
  ('SUP-HDYK-001',  '华都峪口',   'CHICK',      'CN', 'CNY', 'GROUP', 'ACTIVE', TRUE, '种鸡/雏鸡；DATA_INCOMPLETE: contact,phone'),
  ('SUP-HBYK-001',  '河北峪口',   'CHICK',      'CN', 'CNY', 'GROUP', 'ACTIVE', TRUE, '种鸡/雏鸡；DATA_INCOMPLETE: contact,phone'),
  ('SUP-COFCO-001', '中粮',       'FEED',       'CN', 'CNY', 'GROUP', 'ACTIVE', TRUE, '饲料原料；DATA_INCOMPLETE: contact,phone'),
  ('SUP-HNATM-001', '河南艾特米', 'VACCINE',    'CN', 'CNY', 'GROUP', 'ACTIVE', TRUE, '兽药/疫苗；DATA_INCOMPLETE: contact,phone'),
  ('SUP-LYZB-001',  '临沂众邦',   'FEED',       'CN', 'CNY', 'GROUP', 'ACTIVE', TRUE, '饲料/物料；DATA_INCOMPLETE: contact,phone')
ON CONFLICT (supplier_code) DO NOTHING;

COMMIT;

-- ── 重复供应商名称诊断（应为 0 行）──────────────────────────────────────
\echo '── 重复供应商名称（应为 0 行）──'
SELECT supplier_name, count(*) AS 重复数
FROM prc2_suppliers GROUP BY supplier_name HAVING count(*) > 1;
-- 校验见 90-check-init-data.sql
