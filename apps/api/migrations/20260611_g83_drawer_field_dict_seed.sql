-- ════════════════════════════════════════════════════════════════════════
-- G83 抽屉裸字段治理 — 配套字典 seed（SAL_REGION 客户区域 / WMS_ZONE_TYPE 库区类型）
-- ────────────────────────────────────────────────────────────────────────
-- 目的：客户档案 region_code、库区档案 zone_type 由裸文本框升级为 DictSelect。
-- ⚠️ 数据保护：仅幂等 INSERT 新字典项（WHERE NOT EXISTS），
--    绝不 DELETE / UPDATE sys_dict 已有记录。
-- 列：sys_dict(dict_type, dict_code, dict_label_zh, dict_label_en, dict_value, sort_no, status)
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_en, dict_value, sort_no, status)
SELECT v.dict_type, v.dict_code, v.dict_label_zh, v.dict_label_en, v.dict_code, v.sort_no, 'ACTIVE'
FROM (VALUES
  -- ① 客户区域（按集团真实经营地理：老挝主战场 + 中国 + 泰国）
  ('SAL_REGION','LA_VTE','老挝·万象',        'Laos-Vientiane',     1),
  ('SAL_REGION','LA_XYL','老挝·沙耶武里',    'Laos-Xayaboury',     2),
  ('SAL_REGION','LA_BLK','老挝·波利坎赛',    'Laos-Bolikhamsai',   3),
  ('SAL_REGION','LA_HXY','老挝·会晒（博胶）','Laos-Houayxay',      4),
  ('SAL_REGION','LA_LPB','老挝·琅勃拉邦',    'Laos-LuangPrabang',  5),
  ('SAL_REGION','LA_OTH','老挝·其他',        'Laos-Other',         9),
  ('SAL_REGION','CN',    '中国',             'China',              10),
  ('SAL_REGION','TH',    '泰国',             'Thailand',           11),
  ('SAL_REGION','OTHER', '其他区域',         'Other',              99),
  -- ② 库区类型（标准仓储分区）
  ('WMS_ZONE_TYPE','NORMAL',  '常温区', 'Normal',   1),
  ('WMS_ZONE_TYPE','CHILLED', '冷藏区', 'Chilled',  2),
  ('WMS_ZONE_TYPE','FROZEN',  '冷冻区', 'Frozen',   3),
  ('WMS_ZONE_TYPE','STAGING', '暂存区', 'Staging',  4),
  ('WMS_ZONE_TYPE','RETURN',  '退货区', 'Return',   5),
  ('WMS_ZONE_TYPE','QUARANTINE','隔离待检区','Quarantine', 6)
) AS v(dict_type, dict_code, dict_label_zh, dict_label_en, sort_no)
WHERE NOT EXISTS (
  SELECT 1 FROM sys_dict d
  WHERE d.dict_type = v.dict_type AND d.dict_code = v.dict_code
);
