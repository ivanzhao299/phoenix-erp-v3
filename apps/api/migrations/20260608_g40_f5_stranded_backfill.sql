-- ════════════════════════════════════════════════════════════════════════════
-- G40 · F5 stranded 迁移回填（顶级 migrations 漏部署 · 仅已确认 app 在用项）
-- ════════════════════════════════════════════════════════════════════════════
-- 背景：生产 Deploy 只跑 apps/api/migrations/2026*.sql，不跑顶级 /migrations/。
--   承接 G37/G38（字典）。对顶级 46 文件做 schema/seed 交叉比对后，确认以下内容
--   「当前前后端代码在用、但仅存在于顶级 migrations、apps/api/migrations 与 v3 基线均无」：
--
--   A. brd_daily_logs 生产派生列 —— farm.service.ts writableCols + 自动派生查询在用
--      （来源顶级 20260605_glp1a2_production_extension.sql）
--   B. wms_outbound/inbound 去向/备注列 —— 前端 warehouse/outbound CrudForm 在用
--      （同上来源）
--   C. PKG_ANOMALY_REASON / PKG_EXCEPTION_TYPE 字典 —— packaging.service + 异常页在用
--      （来源顶级 20260604_g4e_farm_scope_and_dict_seed.sql；G38 因只扫 JSX dictType= 而漏，
--       本次补扫 CrudForm dictType: 冒号式发现）
--
-- 全程幂等（ADD COLUMN IF NOT EXISTS / INSERT WHERE NOT EXISTS），生产若已有则空操作。
-- 不含：songmingguang 用户（生产经 UAT 证实已存在，属"从零重建"可复现性缺口，敏感故留诊断）；
--       PKG_EGG_GRADE 等已被 G5 主动废弃项（不可回退）。
-- ════════════════════════════════════════════════════════════════════════════

-- ── A. brd_daily_logs 生产派生列 ─────────────────────────────────────────────
ALTER TABLE brd_daily_logs
  ADD COLUMN IF NOT EXISTS opening_qty  integer       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_qty  integer       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS self_use_qty integer       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lay_rate     numeric(5,4);

-- ── B. wms_outbound / wms_inbound 去向 / 备注列 ──────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.wms_outbound') IS NOT NULL THEN
    ALTER TABLE wms_outbound
      ADD COLUMN IF NOT EXISTS destination_type       varchar(32),
      ADD COLUMN IF NOT EXISTS destination_house_code varchar(64),
      ADD COLUMN IF NOT EXISTS remark                 text;
  END IF;
  IF to_regclass('public.wms_inbound') IS NOT NULL THEN
    ALTER TABLE wms_inbound
      ADD COLUMN IF NOT EXISTS remark text;
  END IF;
END $$;

-- ── C. 包装异常字典（packaging.service + 异常页在用）────────────────────────
INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_en, dict_value, sort_no, status)
SELECT v.dict_type, v.dict_code, v.dict_label_zh, v.dict_label_en, v.dict_code, v.sort_no, 'ACTIVE'
FROM (VALUES
  -- PKG_ANOMALY_REASON（异常原因）
  ('PKG_ANOMALY_REASON','EQUIPMENT_FAULT','设备故障','Equipment Fault',10),
  ('PKG_ANOMALY_REASON','POWER_OUTAGE','断电','Power Outage',20),
  ('PKG_ANOMALY_REASON','MATERIAL_SHORTAGE','物料短缺','Material Shortage',30),
  ('PKG_ANOMALY_REASON','QUALITY_ISSUE','质量问题','Quality Issue',40),
  ('PKG_ANOMALY_REASON','OPERATOR_ERROR','操作失误','Operator Error',50),
  ('PKG_ANOMALY_REASON','SCHEDULE_DELAY','排程延迟','Schedule Delay',60),
  ('PKG_ANOMALY_REASON','OTHER','其他','Other',99),
  -- PKG_EXCEPTION_TYPE（异常类型）
  ('PKG_EXCEPTION_TYPE','BROKEN','破损蛋','Broken Egg',10),
  ('PKG_EXCEPTION_TYPE','DIRTY','脏蛋','Dirty Egg',20),
  ('PKG_EXCEPTION_TYPE','OVERSIZE','超规格','Oversize',30),
  ('PKG_EXCEPTION_TYPE','UNDERSIZE','不足规格','Undersize',40),
  ('PKG_EXCEPTION_TYPE','HYGIENE','卫生不达标','Hygiene Issue',50),
  ('PKG_EXCEPTION_TYPE','OTHER','其他','Other',99)
) AS v(dict_type, dict_code, dict_label_zh, dict_label_en, sort_no)
WHERE NOT EXISTS (
  SELECT 1 FROM sys_dict d WHERE d.dict_type = v.dict_type AND d.dict_code = v.dict_code
);
