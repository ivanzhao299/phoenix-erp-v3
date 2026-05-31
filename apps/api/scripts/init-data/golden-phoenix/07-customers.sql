-- ============================================================
-- Golden Phoenix · 生产初始化数据包  07 客户（Customers）
-- 目标表：sal_customers（禁止写 ord_customers / b2b_customers）
-- 数据来源：M5 确认表（已填名单），共 35 家真实客户。
-- 原则：
--   · 客户不建系统账号；customer_no 唯一；幂等 ON CONFLICT (customer_no) DO NOTHING
--   · 联系人/电话缺失不阻断，remark 标注 DATA_INCOMPLETE
--   · 类型映射：经销商=DISTRIBUTOR / 零售=RETAIL / 企业=CORPORATE / 物流=LOGISTICS / 其他=OTHER
--   · 公司归属：星驰系(特区/会晒)=COMP-LAO-XINGCHI；凤凰系(名单挂孟赛)=COMP-LAO-AGRI
--   · 区域「待定」置 NULL 并在 remark 注明；疑似重复/老挝文名保留 remark 待核，不擅自合并/删除
-- ============================================================
BEGIN;

INSERT INTO sal_customers
  (customer_no, customer_name, customer_type, region_code, company_code, status, risk_level, remark)
VALUES
  -- ── 星驰系（金三角特区 / 会晒）→ COMP-LAO-XINGCHI ──
  ('CUS-DIST-001','十八号仓库','DISTRIBUTOR','金三角特区','COMP-LAO-XINGCHI','ACTIVE','LOW','特区直营店；仓库批发点；DATA_INCOMPLETE: contact,phone'),
  ('CUS-RTL-001','小李杂货铺','RETAIL','金三角特区','COMP-LAO-XINGCHI','ACTIVE','LOW','特区直营店；杂货零售；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-002','李潇蔬菜','DISTRIBUTOR','金三角特区','COMP-LAO-XINGCHI','ACTIVE','LOW','特区直营店；蔬菜摊(转售)；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-003','吴晓斌蔬菜','DISTRIBUTOR','金三角特区','COMP-LAO-XINGCHI','ACTIVE','LOW','特区直营店；蔬菜摊(转售)；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-004','阿香内','DISTRIBUTOR','会晒(博胶省)','COMP-LAO-XINGCHI','ACTIVE','LOW','会晒直营店；⚠音译名待核；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-005','阿慧','DISTRIBUTOR','会晒(博胶省)','COMP-LAO-XINGCHI','ACTIVE','LOW','会晒直营店；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-006','向老头','DISTRIBUTOR','会晒(博胶省)','COMP-LAO-XINGCHI','ACTIVE','LOW','会晒直营店；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-007','孟嗯','DISTRIBUTOR','会晒(博胶省)','COMP-LAO-XINGCHI','ACTIVE','LOW','会晒直营店；⚠音译名待核；DATA_INCOMPLETE: contact,phone'),
  -- ── 凤凰系（名单挂孟赛）→ COMP-LAO-AGRI ──
  ('CUS-DIST-008','拉邦吴总','DISTRIBUTOR','琅勃拉邦','COMP-LAO-AGRI','ACTIVE','LOW','⚠与"万象吴总"是否同一人待确认；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-009','拉邦张杰','DISTRIBUTOR','琅勃拉邦','COMP-LAO-AGRI','ACTIVE','LOW','DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-010','万象吴总','DISTRIBUTOR','万象','COMP-LAO-AGRI','ACTIVE','LOW','⚠与"拉邦吴总"是否同一人待确认；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-011','khan jun','DISTRIBUTOR',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠区域待定(疑拉邦)；拉丁拼写待补中文名；疑与"khnjin lpb"关联；DATA_INCOMPLETE'),
  ('CUS-DIST-012','丰沙里 小青','DISTRIBUTOR','丰沙里省','COMP-LAO-AGRI','ACTIVE','LOW','⚠"小青"多区域出现是否同一人待确认；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-013','ເມຍອ້າຍໄຊ','DISTRIBUTOR',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠老挝文客户名，待补中文/罗马音译名与区域；DATA_INCOMPLETE'),
  ('CUS-DIST-014','拉邦卖大蒜','DISTRIBUTOR','琅勃拉邦','COMP-LAO-AGRI','ACTIVE','LOW','卖大蒜(转售点)；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-015','阿布','DISTRIBUTOR',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠区域待定(默认孟赛)；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-016','那摩福丽','DISTRIBUTOR','那摩(乌多姆赛省)','COMP-LAO-AGRI','ACTIVE','LOW','⚠与"副丽 那摩"疑同一人；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-017','ແມ່ນສວຍ','DISTRIBUTOR',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠老挝文客户名，待补译名与区域；DATA_INCOMPLETE'),
  ('CUS-DIST-018','khnjin lpb','DISTRIBUTOR','琅勃拉邦','COMP-LAO-AGRI','ACTIVE','LOW','⚠拉丁拼写，疑与"khan jun"关联待确认；DATA_INCOMPLETE'),
  ('CUS-DIST-019','金丽客户','DISTRIBUTOR',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠区域待定(默认孟赛)；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-020','ໜອງແມງດາ','DISTRIBUTOR',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠老挝文(疑 Nong Maeng Da 地名)，待补译名；DATA_INCOMPLETE'),
  ('CUS-CORP-001','中铁路','CORPORATE',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠企业客户(中老铁路)，归属待确认(疑沿线/万象)；DATA_INCOMPLETE'),
  ('CUS-DIST-021','猛昏小青','DISTRIBUTOR','猛昏','COMP-LAO-AGRI','ACTIVE','LOW','⚠与"猛昏客户小青"疑重复；DATA_INCOMPLETE: contact,phone'),
  ('CUS-RTL-002','散户','RETAIL',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠散户汇总项非单一客户，建议拆分或单列；DATA_INCOMPLETE'),
  ('CUS-DIST-022','陈玲','DISTRIBUTOR',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠区域待定(默认孟赛)；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-023','副丽 那摩','DISTRIBUTOR','那摩(乌多姆赛省)','COMP-LAO-AGRI','ACTIVE','LOW','⚠疑与"那摩福丽"同一人(副/福)；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-024','盛唱','DISTRIBUTOR',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠区域待定(默认孟赛)；名称疑音译待核；DATA_INCOMPLETE'),
  ('CUS-DIST-025','ຈີນຂາຍຜັກ','DISTRIBUTOR',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠老挝文意"卖菜的华人"，待补具体客户名/区域；DATA_INCOMPLETE'),
  ('CUS-OTH-001','东鹏','OTHER','东鹏','COMP-LAO-AGRI','ACTIVE','LOW','⚠与本集团"东鹏场/东鹏直营店"同名，待确认是否客户；DATA_INCOMPLETE'),
  ('CUS-DIST-026','ຈີນຫນ້າຕະລາດບ້ານຖີ່ນ','DISTRIBUTOR',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠老挝文意"本地市场前的华人"，待补客户名/区域；DATA_INCOMPLETE'),
  ('CUS-DIST-027','ເມືອງຂວາ','DISTRIBUTOR','孟夸(疑丰沙里省)','COMP-LAO-AGRI','ACTIVE','LOW','⚠老挝文 Muang Khua(孟夸)地名待确认；DATA_INCOMPLETE'),
  ('CUS-LOG-001','物流公司','LOGISTICS',NULL,'COMP-LAO-AGRI','ACTIVE','LOW','⚠疑为物流承运方而非购货客户，待确认是否应建为客户；DATA_INCOMPLETE'),
  ('CUS-DIST-028','风沙里 福丽','DISTRIBUTOR','丰沙里省','COMP-LAO-AGRI','ACTIVE','LOW','⚠"风沙里"疑=丰沙里；"福丽"多区域出现；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-029','猛龙客户小青','DISTRIBUTOR','猛龙','COMP-LAO-AGRI','ACTIVE','LOW','⚠"小青"多区域疑同一人；DATA_INCOMPLETE: contact,phone'),
  ('CUS-DIST-030','猛昏客户小青','DISTRIBUTOR','猛昏','COMP-LAO-AGRI','ACTIVE','LOW','⚠疑与"猛昏小青"重复；DATA_INCOMPLETE: contact,phone')
ON CONFLICT (customer_no) DO NOTHING;

COMMIT;

-- ── 重复客户名称诊断（疑似重复人工复核）──────────────────────────────────
\echo '── 重复客户名称（应为 0 行；疑似重复见各行 remark 标记）──'
SELECT customer_name, count(*) AS 重复数
FROM sal_customers GROUP BY customer_name HAVING count(*) > 1;
-- 校验见 90-check-init-data.sql
