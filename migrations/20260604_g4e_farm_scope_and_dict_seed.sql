-- ════════════════════════════════════════════════════════════════════════════
-- G4-E · Production & Packaging Governance — Schema + sys_dict 种子
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 1：sys_user_farm_scopes（FarmScope 额外授权）─────────────────────────
-- 镜像 sys_user_warehouse_scopes 的模式
CREATE TABLE IF NOT EXISTS sys_user_farm_scopes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL,
  farm_code   VARCHAR(64) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, farm_code)
);

CREATE INDEX IF NOT EXISTS idx_sys_user_farm_scopes_user
  ON sys_user_farm_scopes(user_id);
CREATE INDEX IF NOT EXISTS idx_sys_user_farm_scopes_farm
  ON sys_user_farm_scopes(farm_code);

COMMENT ON TABLE sys_user_farm_scopes IS
  'G4-E: 用户对场站(brd_farms.farm_code)的额外授权，与 sys_user_warehouse_scopes 同模式';

-- ── PART 2：sys_dict 种子（生产/包装域字典）────────────────────────────────────
-- 新增 dict_type：
--   BRD_FLOCK_STATUS     鸡群状态
--   PKG_DEFECT           包装缺陷类型
--   PKG_ANOMALY_REASON   异常原因
--   PKG_EXCEPTION_TYPE   异常类型（覆盖现有硬编码）
--
-- 已存在不重复植入：
--   PKG_PACK_LINE / PKG_SHIFT / PKG_EGG_GRADE / PKG_EGG_DEFECT / BRD_HOUSE_TYPE

-- ── BRD_FLOCK_STATUS ────────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PULLET','BRD_FLOCK_STATUS','育雏期','育雏期','Pullet',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PULLET' AND dict_type='BRD_FLOCK_STATUS');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'GROWING','BRD_FLOCK_STATUS','育成期','育成期','Growing',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='GROWING' AND dict_type='BRD_FLOCK_STATUS');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'LAYING','BRD_FLOCK_STATUS','产蛋期','产蛋期','Laying',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LAYING' AND dict_type='BRD_FLOCK_STATUS');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'MOLTING','BRD_FLOCK_STATUS','换羽期','换羽期','Molting',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='MOLTING' AND dict_type='BRD_FLOCK_STATUS');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'CULLED','BRD_FLOCK_STATUS','淘汰','淘汰','Culled',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CULLED' AND dict_type='BRD_FLOCK_STATUS');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'SOLD','BRD_FLOCK_STATUS','已出栏','已出栏','Sold',60,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SOLD' AND dict_type='BRD_FLOCK_STATUS');

-- ── PKG_DEFECT（包装缺陷类型，与 PKG_EGG_DEFECT 互补，PKG_EGG_DEFECT 是蛋品级）──
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'PACKAGE_BROKEN','PKG_DEFECT','包装破损','包装破损','Package Broken',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='PACKAGE_BROKEN' AND dict_type='PKG_DEFECT');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'LABEL_MISSING','PKG_DEFECT','标签缺失','标签缺失','Label Missing',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LABEL_MISSING' AND dict_type='PKG_DEFECT');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'WEIGHT_DEVIATION','PKG_DEFECT','重量偏差','重量偏差','Weight Deviation',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='WEIGHT_DEVIATION' AND dict_type='PKG_DEFECT');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'CONTAMINATION','PKG_DEFECT','污染','污染','Contamination',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CONTAMINATION' AND dict_type='PKG_DEFECT');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OTHER','PKG_DEFECT','其他','其他','Other',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OTHER' AND dict_type='PKG_DEFECT');

-- ── PKG_ANOMALY_REASON（异常原因，已被 packaging.service 引用）─────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'EQUIPMENT_FAULT','PKG_ANOMALY_REASON','设备故障','设备故障','Equipment Fault',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='EQUIPMENT_FAULT' AND dict_type='PKG_ANOMALY_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'POWER_OUTAGE','PKG_ANOMALY_REASON','断电','断电','Power Outage',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='POWER_OUTAGE' AND dict_type='PKG_ANOMALY_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'MATERIAL_SHORTAGE','PKG_ANOMALY_REASON','物料短缺','物料短缺','Material Shortage',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='MATERIAL_SHORTAGE' AND dict_type='PKG_ANOMALY_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'QUALITY_ISSUE','PKG_ANOMALY_REASON','质量问题','质量问题','Quality Issue',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='QUALITY_ISSUE' AND dict_type='PKG_ANOMALY_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OPERATOR_ERROR','PKG_ANOMALY_REASON','操作失误','操作失误','Operator Error',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OPERATOR_ERROR' AND dict_type='PKG_ANOMALY_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'SCHEDULE_DELAY','PKG_ANOMALY_REASON','排程延迟','排程延迟','Schedule Delay',60,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SCHEDULE_DELAY' AND dict_type='PKG_ANOMALY_REASON');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OTHER','PKG_ANOMALY_REASON','其他','其他','Other',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OTHER' AND dict_type='PKG_ANOMALY_REASON');

-- ── PKG_EXCEPTION_TYPE（覆盖原硬编码 6 项 issue_type） ────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'BROKEN','PKG_EXCEPTION_TYPE','破损蛋','破损蛋','Broken Egg',10,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='BROKEN' AND dict_type='PKG_EXCEPTION_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'DIRTY','PKG_EXCEPTION_TYPE','脏蛋','脏蛋','Dirty Egg',20,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='DIRTY' AND dict_type='PKG_EXCEPTION_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OVERSIZE','PKG_EXCEPTION_TYPE','超规格','超规格','Oversize',30,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OVERSIZE' AND dict_type='PKG_EXCEPTION_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'UNDERSIZE','PKG_EXCEPTION_TYPE','不足规格','不足规格','Undersize',40,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='UNDERSIZE' AND dict_type='PKG_EXCEPTION_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'HYGIENE','PKG_EXCEPTION_TYPE','卫生不达标','卫生不达标','Hygiene Issue',50,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='HYGIENE' AND dict_type='PKG_EXCEPTION_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'OTHER','PKG_EXCEPTION_TYPE','其他','其他','Other',99,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OTHER' AND dict_type='PKG_EXCEPTION_TYPE');

-- ── BRD_FLOCK_STATUS 字段（如需保证 brd_flocks 表能用）────────────────────────
ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(32) DEFAULT 'LAYING';
COMMENT ON COLUMN brd_flocks.lifecycle_stage IS 'G4-E: 关联 sys_dict.BRD_FLOCK_STATUS';
