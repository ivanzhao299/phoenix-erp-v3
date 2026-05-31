-- ============================================================
-- Golden Phoenix · 生产初始化数据包  08 供应商（Suppliers）
-- 目标表：prc2_suppliers（Procurement V2 正式供应商表；禁止写 prc_suppliers 旧表）
-- 数据来源：M5 确认表（已填名单），共 25 家真实供应商。
-- 原则：
--   · 供应商不建系统账号；supplier_code 唯一；幂等 ON CONFLICT (supplier_code) DO NOTHING
--   · 类型 ∈ FEED/VACCINE/VETERINARY/EQUIPMENT/PACKAGING/CHICK/SERVICE/OTHER
--   · shared_scope：共用=GROUP；单公司=COMPANY(owner_company_code 注明星驰/凤凰)
--   · 联系人/电话缺失不阻断，remark 标注 DATA_INCOMPLETE；个人简称待补全称者保留 remark
-- ============================================================
BEGIN;

INSERT INTO prc2_suppliers
  (supplier_code, supplier_name, supplier_type, country_code, default_currency,
   contact_name, shared_scope, owner_company_code, owner_company_name, status, is_active, remark)
VALUES
  ('SUP-HBAGD-001','湖北艾格多饲料有限公司','FEED','CN','CNY',NULL,'GROUP',NULL,NULL,'ACTIVE',TRUE,'预混料；星驰&凤凰共用；DATA_INCOMPLETE: contact,phone'),
  ('SUP-HDYK-001','北京市华都峪口禽业有限责任公司','CHICK','CN','CNY',NULL,'COMPANY','COMP-LAO-XINGCHI','老挝金三角特区星驰养鸡场','ACTIVE',TRUE,'种蛋/种禽；星驰；DATA_INCOMPLETE: contact,phone'),
  ('SUP-HBYK-001','河北峪口禽业有限公司','CHICK','CN','CNY',NULL,'COMPANY','COMP-LAO-XINGCHI','老挝金三角特区星驰养鸡场','ACTIVE',TRUE,'种蛋/种禽；星驰；DATA_INCOMPLETE: contact,phone'),
  ('SUP-GAOY-001','高远','PACKAGING','CN','CNY',NULL,'COMPANY','COMP-LAO-XINGCHI','老挝金三角特区星驰养鸡场','ACTIVE',TRUE,'蛋筐；星驰；⚠个人简称，待补全称/联系方式；DATA_INCOMPLETE'),
  ('SUP-HAIZ-001','海总','FEED','CN','CNY',NULL,'COMPANY','COMP-LAO-XINGCHI','老挝金三角特区星驰养鸡场','ACTIVE',TRUE,'玉米；星驰；⚠个人简称，待补全称/联系方式；DATA_INCOMPLETE'),
  ('SUP-COFCO-001','中粮（鞠德清）','FEED','CN','CNY','鞠德清','GROUP',NULL,NULL,'ACTIVE',TRUE,'豆粕、豆油；星驰&凤凰共用；DATA_INCOMPLETE: phone'),
  ('SUP-LYCZ-001','临沂程泽农牧科技有限公司','VETERINARY','CN','CNY',NULL,'COMPANY','COMP-LAO-XINGCHI','老挝金三角特区星驰养鸡场','ACTIVE',TRUE,'兽药；星驰；DATA_INCOMPLETE: contact,phone'),
  ('SUP-LYZB-001','临沂众邦兽药销售有限公司','VETERINARY','CN','CNY',NULL,'GROUP',NULL,NULL,'ACTIVE',TRUE,'兽药；星驰&凤凰共用；⚠原表误标"饲料"，据名单订正为兽药；DATA_INCOMPLETE'),
  ('SUP-HNATM-001','河南艾特米','VACCINE','CN','CNY',NULL,'GROUP',NULL,NULL,'ACTIVE',TRUE,'兽药/疫苗；星驰&凤凰共用；⚠类型待确认(疫苗/药)；DATA_INCOMPLETE'),
  ('SUP-LIUT-001','刘涛','FEED','CN','CNY',NULL,'GROUP',NULL,NULL,'ACTIVE',TRUE,'玉米；星驰&凤凰共用；⚠个人简称，待补；DATA_INCOMPLETE'),
  ('SUP-LIUZ-001','刘总','FEED','CN','CNY',NULL,'COMPANY','COMP-LAO-XINGCHI','老挝金三角特区星驰养鸡场','ACTIVE',TRUE,'玉米；星驰；⚠个人简称，与"刘涛"是否同一待确认；DATA_INCOMPLETE'),
  ('SUP-MTJH-001','勐泰察姜海','FEED','LA','CNY','姜海','COMPANY','COMP-LAO-XINGCHI','老挝金三角特区星驰养鸡场','ACTIVE',TRUE,'玉米；星驰；⚠疑与"老挝勐泰寮农业公司(姜海)"同一；DATA_INCOMPLETE: phone'),
  ('SUP-SXLKE-001','山西隆克尔生物制药有限公司','VETERINARY','CN','CNY',NULL,'COMPANY','COMP-LAO-XINGCHI','老挝金三角特区星驰养鸡场','ACTIVE',TRUE,'兽药；星驰；DATA_INCOMPLETE: contact,phone'),
  ('SUP-THSBM-001','泰国豆粕','FEED','TH','USD',NULL,'GROUP',NULL,NULL,'ACTIVE',TRUE,'豆粕；星驰&凤凰共用；⚠品类代称，待补供应商主体；DATA_INCOMPLETE'),
  ('SUP-ZENGZ-001','曾总','FEED','CN','CNY',NULL,'GROUP',NULL,NULL,'ACTIVE',TRUE,'玉米；星驰&凤凰共用；⚠个人简称，待补；DATA_INCOMPLETE'),
  ('SUP-ZHUZ-001','祝政','VETERINARY','CN','CNY',NULL,'COMPANY','COMP-LAO-XINGCHI','老挝金三角特区星驰养鸡场','ACTIVE',TRUE,'兽药；星驰；DATA_INCOMPLETE: phone'),
  ('SUP-LYSF-001','临沂圣丰农牧科技有限公司','VETERINARY','CN','CNY',NULL,'COMPANY','COMP-LAO-AGRI','老挝凤凰农业发展有限公司','ACTIVE',TRUE,'兽药；凤凰；DATA_INCOMPLETE: contact,phone'),
  ('SUP-LAOXC-001','老挝东鹏县星驰农业发展有限公司','VETERINARY','LA','CNY',NULL,'COMPANY','COMP-LAO-AGRI','老挝凤凰农业发展有限公司','ACTIVE',TRUE,'兽药；凤凰；⚠疑本集团关联/内部主体(星驰)，待确认是否列为外部供应商(关联交易)；DATA_INCOMPLETE'),
  ('SUP-ZDHF-001','石家庄正大鸿福牧业','VETERINARY','CN','CNY',NULL,'COMPANY','COMP-LAO-AGRI','老挝凤凰农业发展有限公司','ACTIVE',TRUE,'兽药；凤凰；DATA_INCOMPLETE: contact,phone'),
  ('SUP-LAOSM-001','老挝赛敏农业发展有限公司','FEED','LA','CNY',NULL,'COMPANY','COMP-LAO-AGRI','老挝凤凰农业发展有限公司','ACTIVE',TRUE,'玉米；凤凰；DATA_INCOMPLETE: contact,phone'),
  ('SUP-LAOMT-001','老挝勐泰寮农业公司（姜海）','FEED','LA','CNY','姜海','COMPANY','COMP-LAO-AGRI','老挝凤凰农业发展有限公司','ACTIVE',TRUE,'玉米；凤凰；⚠疑与"勐泰察姜海"同一；DATA_INCOMPLETE: phone'),
  ('SUP-MSZHOU-001','孟赛周总','FEED','LA','CNY',NULL,'COMPANY','COMP-LAO-AGRI','老挝凤凰农业发展有限公司','ACTIVE',TRUE,'玉米；凤凰；⚠个人简称，待补；DATA_INCOMPLETE'),
  ('SUP-KUANGZ-001','匡总','FEED','CN','CNY',NULL,'COMPANY','COMP-LAO-AGRI','老挝凤凰农业发展有限公司','ACTIVE',TRUE,'玉米；凤凰；⚠个人简称，待补；DATA_INCOMPLETE'),
  ('SUP-ZHANGXB-001','张学斌','FEED','CN','CNY',NULL,'COMPANY','COMP-LAO-AGRI','老挝凤凰农业发展有限公司','ACTIVE',TRUE,'豆油；凤凰；DATA_INCOMPLETE: phone'),
  ('SUP-VNSBM-001','越南豆粕','FEED','VN','USD',NULL,'COMPANY','COMP-LAO-AGRI','老挝凤凰农业发展有限公司','ACTIVE',TRUE,'豆粕；凤凰；⚠品类代称，待补供应商主体；DATA_INCOMPLETE')
ON CONFLICT (supplier_code) DO NOTHING;

COMMIT;

-- ── 重复供应商名称诊断（疑似重复人工复核）──────────────────────────────
\echo '── 重复供应商名称（应为 0 行；疑似同一主体见各行 remark 标记）──'
SELECT supplier_name, count(*) AS 重复数
FROM prc2_suppliers GROUP BY supplier_name HAVING count(*) > 1;
-- 校验见 90-check-init-data.sql
