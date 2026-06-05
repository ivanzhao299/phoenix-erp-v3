-- ═════════════════════════════════════════════════════════════════════════════
-- GLP-1A-2 生产报表导入 — DDL 扩展 + 字典 seed
-- ═════════════════════════════════════════════════════════════════════════════
-- 来源审计：docs/glp1a1-production-data-mapping-audit.md（§5/§6.1-6.2）
--
-- 本迁移做 3 件事：
--   1) brd_daily_logs +4 字段：opening_qty / closing_qty / self_use_qty / lay_rate
--   2) wms_outbound  +3 字段：destination_type / destination_house_code / remark
--      wms_inbound   +1 字段：remark
--   3) sys_dict 补 3 类：PKG_EGG_GRADE (7) / WMS_OUTBOUND_DESTINATION (4) / BRD_HOUSE_TYPE (1)
--
-- 全程幂等（ADD COLUMN IF NOT EXISTS / NOT EXISTS guard）。
-- 不破坏既有数据；不改字段类型；不删字段。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. brd_daily_logs ───────────────────────────────────────────────────────
ALTER TABLE brd_daily_logs
  ADD COLUMN IF NOT EXISTS opening_qty  integer       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_qty  integer       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS self_use_qty integer       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lay_rate     numeric(5,4);

COMMENT ON COLUMN brd_daily_logs.opening_qty  IS '期初存栏（开盘数量，源自 Excel 生产日报"期初存栏"列）';
COMMENT ON COLUMN brd_daily_logs.closing_qty  IS '期末存栏（收盘数量；= opening_qty − mortality_qty − elimination_qty − self_use_qty）';
COMMENT ON COLUMN brd_daily_logs.self_use_qty IS '当日自用数量（场内消化，源自 Excel 生产日报"自用"列）';
COMMENT ON COLUMN brd_daily_logs.lay_rate     IS '产蛋率（0.0000 ~ 1.0000；可手填或由 eggs_produced / closing_qty 派生）';

-- ── 2. wms_outbound + wms_inbound ──────────────────────────────────────────
ALTER TABLE wms_outbound
  ADD COLUMN IF NOT EXISTS destination_type       varchar(32),
  ADD COLUMN IF NOT EXISTS destination_house_code varchar(64),
  ADD COLUMN IF NOT EXISTS remark                 text;

ALTER TABLE wms_inbound
  ADD COLUMN IF NOT EXISTS remark text;

COMMENT ON COLUMN wms_outbound.destination_type       IS '出库目的类型（字典 WMS_OUTBOUND_DESTINATION：HOUSE/KITCHEN/OFFICE/OTHER）';
COMMENT ON COLUMN wms_outbound.destination_house_code IS '当 destination_type=HOUSE 时引用 brd_houses.house_code（饲料投喂到具体鸡舍）';
COMMENT ON COLUMN wms_outbound.remark                 IS '出库备注';
COMMENT ON COLUMN wms_inbound.remark                  IS '入库备注';

-- ── 3. sys_dict seed ───────────────────────────────────────────────────────

-- 3.1 PKG_EGG_GRADE（蛋品 grade，7 种）
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'XL','PKG_EGG_GRADE','特大蛋','特大蛋','Extra Large',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='XL' AND dict_type='PKG_EGG_GRADE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'L','PKG_EGG_GRADE','一号蛋','一号蛋','Large',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='L' AND dict_type='PKG_EGG_GRADE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'M','PKG_EGG_GRADE','二号蛋','二号蛋','Medium',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='M' AND dict_type='PKG_EGG_GRADE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'S','PKG_EGG_GRADE','三号蛋','三号蛋','Small',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='S' AND dict_type='PKG_EGG_GRADE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'XS','PKG_EGG_GRADE','四号蛋','四号蛋','Extra Small',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='XS' AND dict_type='PKG_EGG_GRADE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'DIRTY','PKG_EGG_GRADE','脏蛋','脏蛋','Dirty',90,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='DIRTY' AND dict_type='PKG_EGG_GRADE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'BROKEN','PKG_EGG_GRADE','破损蛋','破损蛋','Broken',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='BROKEN' AND dict_type='PKG_EGG_GRADE');

-- 3.2 WMS_OUTBOUND_DESTINATION（出库目的类型，新字典 type）
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'HOUSE','WMS_OUTBOUND_DESTINATION','鸡舍投喂','鸡舍投喂','House Feeding',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='HOUSE' AND dict_type='WMS_OUTBOUND_DESTINATION');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'KITCHEN','WMS_OUTBOUND_DESTINATION','厨房自用','厨房自用','Kitchen',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='KITCHEN' AND dict_type='WMS_OUTBOUND_DESTINATION');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OFFICE','WMS_OUTBOUND_DESTINATION','办公室','办公室','Office',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OFFICE' AND dict_type='WMS_OUTBOUND_DESTINATION');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OTHER','WMS_OUTBOUND_DESTINATION','其他','其他','Other',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OTHER' AND dict_type='WMS_OUTBOUND_DESTINATION');

-- 3.3 BRD_HOUSE_TYPE（鸡舍类型；Sheet 1 都是产蛋舍）
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'LAYING','BRD_HOUSE_TYPE','产蛋舍','产蛋舍','Laying House',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LAYING' AND dict_type='BRD_HOUSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'BROOD','BRD_HOUSE_TYPE','育雏舍','育雏舍','Brooding',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='BROOD' AND dict_type='BRD_HOUSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PULLET','BRD_HOUSE_TYPE','育成舍','育成舍','Pullet',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PULLET' AND dict_type='BRD_HOUSE_TYPE');

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证 SQL（手工执行确认）：
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='brd_daily_logs'
--       AND column_name IN ('opening_qty','closing_qty','self_use_qty','lay_rate');
--   -- 应返回 4 行
--
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='wms_outbound'
--       AND column_name IN ('destination_type','destination_house_code','remark');
--   -- 应返回 3 行
--
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='wms_inbound' AND column_name='remark';
--   -- 应返回 1 行
--
--   SELECT dict_type, count(*) FROM sys_dict
--     WHERE dict_type IN ('PKG_EGG_GRADE','WMS_OUTBOUND_DESTINATION','BRD_HOUSE_TYPE')
--     GROUP BY dict_type ORDER BY 1;
--   -- BRD_HOUSE_TYPE=3  PKG_EGG_GRADE=7  WMS_OUTBOUND_DESTINATION=4
-- ═════════════════════════════════════════════════════════════════════════════
