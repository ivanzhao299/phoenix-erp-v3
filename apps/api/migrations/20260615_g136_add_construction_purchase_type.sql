-- ════════════════════════════════════════════════════════════════════════
-- G136 采购类型新增「装修/工程」(CONSTRUCTION) 2026-06-15
-- 背景：万象总部办公室装修付款属工程类采购，原 PRC_PURCHASE_TYPE 只有
--   原料/设备/服务/固定资产/其他，无贴切选项（被迫归到"服务/外包"且单位填 kg 不合理）。
-- 用户授权新增此字典选项。幂等：NOT EXISTS（仅 INSERT，不动既有行，遵 sys_dict 保护约定）。
-- ════════════════════════════════════════════════════════════════════════
INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_en, dict_value, sort_no, status)
SELECT v.dict_type, v.dict_code, v.dict_label_zh, v.dict_label_en, v.dict_code, v.sort_no, 'ACTIVE'
FROM (VALUES
  ('PRC_PURCHASE_TYPE','CONSTRUCTION','装修/工程','Construction',5)
) AS v(dict_type, dict_code, dict_label_zh, dict_label_en, sort_no)
WHERE NOT EXISTS (
  SELECT 1 FROM sys_dict d WHERE d.dict_type = v.dict_type AND d.dict_code = v.dict_code
);
