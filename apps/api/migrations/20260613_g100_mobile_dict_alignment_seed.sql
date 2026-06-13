-- ════════════════════════════════════════════════════════════════════════
-- G100 字典补齐对齐 — 为手机端"统一字典化"打底（2026-06-13）
-- ────────────────────────────────────────────────────────────────────────
-- 背景：手机多页硬编码枚举，欲改走 sys_dict，但部分字典缺/不全 → 先补齐。
--   ① PRC_MATERIAL_TYPE：生产为空 → 补手机现用的 8 类物料类型。
--   ② PRC_URGENCY：已有 LOW/NORMAL/HIGH/URGENT → 补手机用的 CRITICAL(非常紧急)。
--   ③ IOT_ALERT_TYPE：新建——手机 dashboard 14 个设备告警类型。
--   （BRD_SHIFT 不在此处：生产已有 4 行 MORNING/EVENING/NIGHT/DAY，手机 3 中文班次与之不一致，
--     属数据重整问题，单独处理。）
-- ⚠️ 遵守 sys_dict 保护规则：仅幂等 INSERT（dict_value=dict_code，WHERE NOT EXISTS），
--    绝不 DELETE/UPDATE 既有记录。
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_en, dict_value, sort_no, status)
SELECT v.dict_type, v.dict_code, v.dict_label_zh, v.dict_label_en, v.dict_code, v.sort_no, 'ACTIVE'
FROM (VALUES
  -- ① 物料类型（与 G91 物料种子、手机 MATERIAL_TYPE_OPTIONS 一致）
  ('PRC_MATERIAL_TYPE','FEED_RAW',     '饲料原料',   'Feed Raw Material',   1),
  ('PRC_MATERIAL_TYPE','VET_DRUG',     '兽药疫苗',   'Veterinary Drug',     2),
  ('PRC_MATERIAL_TYPE','PACKAGING',    '包装材料',   'Packaging',           3),
  ('PRC_MATERIAL_TYPE','EQUIPMENT',    '设备及配件', 'Equipment & Parts',   4),
  ('PRC_MATERIAL_TYPE','CONSTRUCTION', '建筑材料',   'Construction',        5),
  ('PRC_MATERIAL_TYPE','OFFICE',       '办公易耗',   'Office Supplies',     6),
  ('PRC_MATERIAL_TYPE','TOOL',         '工具器具',   'Tools',               7),
  ('PRC_MATERIAL_TYPE','OTHER',        '其他',       'Other',               9),
  -- ② 紧急度补 CRITICAL（手机用，既有字典缺）
  ('PRC_URGENCY','CRITICAL', '非常紧急', 'Critical', 5),
  -- ③ IOT 设备告警类型（手机 dashboard ALERT_LABELS 14 类）
  ('IOT_ALERT_TYPE','TEMP_HIGH',     '温度过高',  'Temp High',      1),
  ('IOT_ALERT_TYPE','TEMP_LOW',      '温度过低',  'Temp Low',       2),
  ('IOT_ALERT_TYPE','HUMIDITY_HIGH', '湿度过高',  'Humidity High',  3),
  ('IOT_ALERT_TYPE','HUMIDITY_LOW',  '湿度过低',  'Humidity Low',   4),
  ('IOT_ALERT_TYPE','CO2_HIGH',      'CO₂浓度高', 'CO2 High',       5),
  ('IOT_ALERT_TYPE','OFFLINE',       '设备离线',  'Offline',        6),
  ('IOT_ALERT_TYPE','POWER_FAILURE', '电源故障',  'Power Failure',  7),
  ('IOT_ALERT_TYPE','SENSOR_ERROR',  '传感器异常','Sensor Error',   8),
  ('IOT_ALERT_TYPE','OVER_HIGH',     '数值超上限','Over High',      9),
  ('IOT_ALERT_TYPE','OVER_LOW',      '数值超下限','Over Low',      10),
  ('IOT_ALERT_TYPE','AMMONIA_HIGH',  '氨气浓度高','Ammonia High',  11),
  ('IOT_ALERT_TYPE','FAN_FAULT',     '风机故障',  'Fan Fault',     12),
  ('IOT_ALERT_TYPE','WATER_LEAK',    '漏水告警',  'Water Leak',    13),
  ('IOT_ALERT_TYPE','FEED_LOW',      '饲料不足',  'Feed Low',      14)
) AS v(dict_type, dict_code, dict_label_zh, dict_label_en, sort_no)
WHERE NOT EXISTS (
  SELECT 1 FROM sys_dict d WHERE d.dict_type = v.dict_type AND d.dict_code = v.dict_code
);
