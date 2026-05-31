-- ═══════════════════════════════════════════════════════════════════════════
-- 19_seed_sys_dict.sql  —  系统数据字典种子数据（幂等）
-- 全部使用 INSERT ... WHERE NOT EXISTS，可重复执行，不覆盖已有数据
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 前置：确保 sys_dict 表存在 ─────────────────────────────────────────────
-- 修复（Phase C）：sys_dict 原由 generic-crud.service.ts 运行时（API启动后）创建，
-- 但本 seed 文件在 CI 的纯 SQL 阶段（API 启动前）执行 → INSERT 报
-- "relation sys_dict does not exist"（此前被 deploy.yml `|| true` 吞掉）。
-- 此处补建表，与 generic-crud.service.ts L1144 定义严格一致（幂等）。
CREATE TABLE IF NOT EXISTS sys_dict (
  id             SERIAL PRIMARY KEY,
  dict_code      VARCHAR(64),
  dict_type      VARCHAR(64),
  name           VARCHAR(128),
  dict_label_zh  VARCHAR(128),
  dict_label_lo  VARCHAR(128),
  dict_label_en  VARCHAR(128),
  dict_value     VARCHAR(64),
  sort_no        INT DEFAULT 0,
  status         VARCHAR(32) DEFAULT 'ACTIVE',
  config_json    TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE sys_dict ADD COLUMN IF NOT EXISTS dict_label_lo VARCHAR(128);
ALTER TABLE sys_dict ADD COLUMN IF NOT EXISTS dict_label_en VARCHAR(128);
ALTER TABLE sys_dict ADD COLUMN IF NOT EXISTS config_json   TEXT;

-- ── SYS_ORG_LEVEL：组织层级 ────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'SYS_ORG_LEVEL_1','SYS_ORG_LEVEL','集团总部','集团总部','ສຳນັກງານໃຫຍ່','HQ / Group',350,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SYS_ORG_LEVEL_1' AND dict_type='SYS_ORG_LEVEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'SYS_ORG_LEVEL_2','SYS_ORG_LEVEL','事业部','事业部','ຫ່ວຍທຸລະກິດ','Business Unit',351,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SYS_ORG_LEVEL_2' AND dict_type='SYS_ORG_LEVEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'SYS_ORG_LEVEL_3','SYS_ORG_LEVEL','部门','部门','ພະແນກ','Department',352,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SYS_ORG_LEVEL_3' AND dict_type='SYS_ORG_LEVEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'SYS_ORG_LEVEL_4','SYS_ORG_LEVEL','大区','大区','ເຂດໃຫຍ່','Region',353,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SYS_ORG_LEVEL_4' AND dict_type='SYS_ORG_LEVEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'SYS_ORG_LEVEL_5','SYS_ORG_LEVEL','门店','门店','ຮ້ານ','Store',354,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SYS_ORG_LEVEL_5' AND dict_type='SYS_ORG_LEVEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'SYS_ORG_LEVEL_6','SYS_ORG_LEVEL','基地','基地','ຖານທີ່','Base',355,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SYS_ORG_LEVEL_6' AND dict_type='SYS_ORG_LEVEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'SYS_ORG_LEVEL_7','SYS_ORG_LEVEL','工厂','工厂','ໂຮງງານ','Factory',356,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SYS_ORG_LEVEL_7' AND dict_type='SYS_ORG_LEVEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'SYS_ORG_LEVEL_8','SYS_ORG_LEVEL','车队','车队','ຂະບວນລົດ','Fleet',357,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SYS_ORG_LEVEL_8' AND dict_type='SYS_ORG_LEVEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'SYS_ORG_LEVEL_9','SYS_ORG_LEVEL','中心','中心','ສູນ','Center',358,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SYS_ORG_LEVEL_9' AND dict_type='SYS_ORG_LEVEL');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'SYS_ORG_LEVEL_10','SYS_ORG_LEVEL','项目组','项目组','ກຸ່ມໂຄງການ','Project Group',359,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SYS_ORG_LEVEL_10' AND dict_type='SYS_ORG_LEVEL');

-- ── BRD_HOUSE_TYPE：鸡舍类型 ───────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'CLOSED','BRD_HOUSE_TYPE','密闭式','密闭式','ປິດ','Closed House',1,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='CLOSED' AND dict_type='BRD_HOUSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'OPEN','BRD_HOUSE_TYPE','开放式','开放式','ເປີດ','Open House',2,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='OPEN' AND dict_type='BRD_HOUSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'SEMI_OPEN','BRD_HOUSE_TYPE','半开放','半开放','ເຄີ່ງເປີດ','Semi-Open House',3,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='SEMI_OPEN' AND dict_type='BRD_HOUSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'LAYER','BRD_HOUSE_TYPE','蛋鸡舍','蛋鸡舍','ຄອກໄຂ່','Layer House',4,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LAYER' AND dict_type='BRD_HOUSE_TYPE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_lo, dict_label_en, sort_no, status)
SELECT 'LAYING','BRD_HOUSE_TYPE','蛋鸡舍','蛋鸡舍','ຄອກໄຂ່','Layer House',5,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LAYING' AND dict_type='BRD_HOUSE_TYPE');

-- ── PKG_PACK_LINE：包装产线 ────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'LINE-01','PKG_PACK_LINE','1号包装线','1号包装线','Line 1',1,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LINE-01' AND dict_type='PKG_PACK_LINE');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'LINE-02','PKG_PACK_LINE','2号包装线','2号包装线','Line 2',2,'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='LINE-02' AND dict_type='PKG_PACK_LINE');

-- ── PKG_SHIFT：包装班次 ────────────────────────────────────────────────────
INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status, config_json)
SELECT 'MORNING','PKG_SHIFT','早班','早班','Morning Shift',1,'ACTIVE','{"timeRange":"08:00-14:00"}'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='MORNING' AND dict_type='PKG_SHIFT');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status, config_json)
SELECT 'AFTERNOON','PKG_SHIFT','下午班','下午班','Afternoon Shift',2,'ACTIVE','{"timeRange":"14:00-22:00"}'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='AFTERNOON' AND dict_type='PKG_SHIFT');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status, config_json)
SELECT 'NIGHT','PKG_SHIFT','夜班','夜班','Night Shift',3,'ACTIVE','{"timeRange":"22:00-06:00"}'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='NIGHT' AND dict_type='PKG_SHIFT');
