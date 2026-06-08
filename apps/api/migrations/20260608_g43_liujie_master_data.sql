-- ════════════════════════════════════════════════════════════════════════════
-- G43 · 刘杰名单导入：司机 / 客户 / 供应商 → sal_drivers / sal_customers / prc2_suppliers
-- ════════════════════════════════════════════════════════════════════════════
-- 来源：data/刘杰/名单.xlsx。星驰鸡场=COMP-LAO-XINGCHI（东鹏星驰）；凤凰鸡场=COMP-LAO-AGRI（凤凰农业）。
-- 供应商在两场有重叠 → 按名称去重（22 家）。客户/司机按 名称+公司 幂等防重。
-- 物料/上级直营店/收款信息入 remark。LJ-* 前缀编码，避免与既有主数据撞码。
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 大车司机 → sal_drivers ────────────────────────────────────────────────
INSERT INTO sal_drivers (driver_code, driver_name, phone, company_code, status, remark)
SELECT v.* FROM (VALUES
  ('LJ-DRV-001','阿喷','92627461','COMP-LAO-XINGCHI','ACTIVE','星驰鸡场 大车司机'),
  ('LJ-DRV-002','阿哨','77374960','COMP-LAO-XINGCHI','ACTIVE','星驰鸡场 大车司机'),
  ('LJ-DRV-003','阿通',NULL,'COMP-LAO-AGRI','ACTIVE','凤凰鸡场 大车司机'),
  ('LJ-DRV-004','阿给',NULL,'COMP-LAO-AGRI','ACTIVE','凤凰鸡场 大车司机')
) AS v(driver_code, driver_name, phone, company_code, status, remark)
WHERE NOT EXISTS (SELECT 1 FROM sal_drivers d WHERE d.driver_name=v.driver_name AND d.company_code=v.company_code);

-- ── 2. 客户 → sal_customers ──────────────────────────────────────────────────
INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, remark)
SELECT v.* FROM (VALUES
  -- 星驰鸡场（东鹏星驰）
  ('LJ-C-001','特区直营店','DIRECT_STORE','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·直营店'),
  ('LJ-C-002','十八号仓库','RETAIL','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·特区直营店 下级零售点'),
  ('LJ-C-003','小李杂货铺','RETAIL','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·特区直营店 下级零售点'),
  ('LJ-C-004','李潇蔬菜','RETAIL','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·特区直营店 下级零售点'),
  ('LJ-C-005','吴晓斌蔬菜','RETAIL','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·特区直营店 下级零售点'),
  ('LJ-C-006','东鹏直营店','DIRECT_STORE','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·直营店'),
  ('LJ-C-007','会晒直营店','DIRECT_STORE','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·直营店'),
  ('LJ-C-008','阿香内','RETAIL','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·会晒直营店 下级'),
  ('LJ-C-009','阿慧','RETAIL','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·会晒直营店 下级'),
  ('LJ-C-010','向老头','RETAIL','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·会晒直营店 下级'),
  ('LJ-C-011','孟嗯','RETAIL','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·会晒直营店 下级'),
  ('LJ-C-012','沙耶武里直营店','DIRECT_STORE','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·直营店'),
  ('LJ-C-013','磨丁','RETAIL','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·客户'),
  ('LJ-C-014','南塔','RETAIL','COMP-LAO-XINGCHI','东鹏星驰','ACTIVE','星驰·客户'),
  -- 凤凰鸡场（凤凰农业）
  ('LJ-C-101','孟赛直营店','DIRECT_STORE','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·直营店'),
  ('LJ-C-102','拉邦吴总','DISTRIBUTOR','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·琅勃拉邦 经销'),
  ('LJ-C-103','拉邦张杰','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·琅勃拉邦'),
  ('LJ-C-104','万象吴总','DISTRIBUTOR','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·万象 经销'),
  ('LJ-C-105','khan jun','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户'),
  ('LJ-C-106','丰沙里小青','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·丰沙里'),
  ('LJ-C-107','ເມຍອ້າຍໄຊ','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户（老挝文）'),
  ('LJ-C-108','拉邦卖大蒜','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·琅勃拉邦'),
  ('LJ-C-109','阿布','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户'),
  ('LJ-C-110','那摩福丽','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·那摩'),
  ('LJ-C-111','ແມ່ນສວຍ','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户（老挝文）'),
  ('LJ-C-112','khnjin lpb','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·琅勃拉邦'),
  ('LJ-C-113','金丽客户','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户'),
  ('LJ-C-114','ໜອງແມງດາ','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户（老挝文）'),
  ('LJ-C-115','中铁路','DISTRIBUTOR','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·单位客户'),
  ('LJ-C-116','猛昏小青','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·猛昏'),
  ('LJ-C-117','散户','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·散户'),
  ('LJ-C-118','陈玲','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户'),
  ('LJ-C-119','副丽 那摩','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·那摩'),
  ('LJ-C-120','盛唱','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户'),
  ('LJ-C-121','ຈີນຂາຍຜັກ','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户（老挝文·华人卖菜）'),
  ('LJ-C-122','东鹏(凤凰客户)','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户'),
  ('LJ-C-123','ຈີນຫນ້າຕະລາດບ້ານຖີ່ນ','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户（老挝文）'),
  ('LJ-C-124','ເມືອງຂວາ','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·客户（老挝文）'),
  ('LJ-C-125','物流公司','DISTRIBUTOR','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·单位客户'),
  ('LJ-C-126','风沙里 福丽','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·风沙里'),
  ('LJ-C-127','猛龙客户小青','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·猛龙'),
  ('LJ-C-128','猛昏客户小青','RETAIL','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·猛昏'),
  ('LJ-C-129','万象直营店','DIRECT_STORE','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·直营店'),
  ('LJ-C-130','波利坎赛直营店','DIRECT_STORE','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·直营店'),
  ('LJ-C-131','拉邦直营店','DIRECT_STORE','COMP-LAO-AGRI','凤凰农业','ACTIVE','凤凰·直营店')
) AS v(customer_no, customer_name, customer_type, company_code, company_name, status, remark)
WHERE NOT EXISTS (SELECT 1 FROM sal_customers c WHERE c.customer_name=v.customer_name AND c.company_code=v.company_code);

-- ── 3. 供应商 → prc2_suppliers（按名称去重，22 家）─────────────────────────────
INSERT INTO prc2_suppliers
  (supplier_code, supplier_name, country_code, supplier_type, default_currency,
   contact_name, contact_phone, bank_account_name, bank_account_no,
   status, is_active, shared_scope, remark)
SELECT v.* FROM (VALUES
  ('LJ-S-001','湖北艾格多饲料有限公司','CN','OVERSEAS','CNY','罗勇','13887533883',NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：预混料'),
  ('LJ-S-002','北京市华都峪口禽业有限责任公司','CN','OVERSEAS','CNY',NULL,NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：种蛋'),
  ('LJ-S-003','河北峪口禽业有限公司','CN','OVERSEAS','CNY',NULL,NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：种蛋'),
  ('LJ-S-004','高远','CN','OVERSEAS','CNY',NULL,NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：蛋筐'),
  ('LJ-S-005','海总','LA','LOCAL','LAK',NULL,NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：玉米'),
  ('LJ-S-006','鞠德清（中粮）','CN','OVERSEAS','CNY','鞠德清','13099948833','绿版纳农业','8000004474737012','ACTIVE',TRUE,'GROUP','物料：豆粕、豆油；公司 绿版纳农业'),
  ('LJ-S-007','临沂程泽农牧科技有限公司','CN','OVERSEAS','CNY','司马浩成','13884897111',NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：药'),
  ('LJ-S-008','临沂众邦兽药销售有限公司','CN','OVERSEAS','CNY','亓树帅','13053918810',NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：药（星驰+凤凰共用）'),
  ('LJ-S-009','河南艾特米','CN','OVERSEAS','CNY','胡庆龙','18519192013',NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：药（星驰+凤凰共用）'),
  ('LJ-S-010','刘涛','LA','LOCAL','LAK','刘涛','2091606699',NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：玉米；公司 耀禾农业（星驰+凤凰共用）'),
  ('LJ-S-011','山西隆克尔生物制药有限公司','CN','OVERSEAS','CNY',NULL,NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：药'),
  ('LJ-S-012','泰国豆粕','TH','OVERSEAS','THB',NULL,NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：豆粕（星驰+凤凰共用）'),
  ('LJ-S-013','曾总','LA','LOCAL','LAK',NULL,NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：玉米（星驰+凤凰共用）'),
  ('LJ-S-014','祝政','CN','OVERSEAS','CNY',NULL,'19110824054',NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：药'),
  ('LJ-S-015','临沂圣丰农牧科技有限公司','CN','OVERSEAS','CNY','司马浩成','13884897111',NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：药'),
  ('LJ-S-016','石家庄正大鸿福牧业','CN','OVERSEAS','CNY','段浩亚','13937136010','任亚蕊','6228480630973873916','ACTIVE',TRUE,'GROUP','物料：药'),
  ('LJ-S-017','老挝赛敏农业发展有限公司','LA','LOCAL','LAK','刘仁敏','2096089888',NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：玉米'),
  ('LJ-S-018','老挝勐泰寮农业公司（姜海）','LA','LOCAL','LAK','姜海',NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：玉米'),
  ('LJ-S-019','孟赛周总','LA','LOCAL','LAK','周克勤',NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：玉米'),
  ('LJ-S-020','匡总','LA','LOCAL','LAK',NULL,NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：玉米'),
  ('LJ-S-021','张学斌','CN','OVERSEAS','CNY','张学斌',NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：豆油'),
  ('LJ-S-022','越南豆粕','VN','OVERSEAS','VND',NULL,NULL,NULL,NULL,'ACTIVE',TRUE,'GROUP','物料：豆粕')
) AS v(supplier_code, supplier_name, country_code, supplier_type, default_currency,
       contact_name, contact_phone, bank_account_name, bank_account_no,
       status, is_active, shared_scope, remark)
WHERE NOT EXISTS (SELECT 1 FROM prc2_suppliers s WHERE s.supplier_name=v.supplier_name);
