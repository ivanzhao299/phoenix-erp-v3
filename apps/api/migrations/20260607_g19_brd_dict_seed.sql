-- ═════════════════════════════════════════════════════════════════════════════
-- G19-C · 养殖域字典 seed（BRD_HOUSE_TYPE / BRD_FLOCK_STATUS / BRD_BREED）
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务方反馈"鸡舍下拉框 LAYER 英文不干净"。G18-1 临时用前端硬编码 map 应急，
-- G19-C 把所有养殖域枚举正式 seed 到 sys_dict，HouseSelector/FlockSelector
-- 走字典查中文，未来增减枚举无需改前端代码。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_lo, dict_label_en, dict_value, sort_no, status, name)
VALUES
  -- ─── BRD_HOUSE_TYPE 鸡舍类型 ────────────────────────────────────────────
  ('BRD_HOUSE_TYPE', 'LAYER',    '蛋鸡舍',  '', 'Layer',    'LAYER',    10, 'ACTIVE', '鸡舍类型'),
  ('BRD_HOUSE_TYPE', 'BREEDER',  '种鸡舍',  '', 'Breeder',  'BREEDER',  20, 'ACTIVE', '鸡舍类型'),
  ('BRD_HOUSE_TYPE', 'HATCHERY', '孵化舍',  '', 'Hatchery', 'HATCHERY', 30, 'ACTIVE', '鸡舍类型'),
  ('BRD_HOUSE_TYPE', 'PULLET',   '育雏舍',  '', 'Pullet',   'PULLET',   40, 'ACTIVE', '鸡舍类型'),
  ('BRD_HOUSE_TYPE', 'GROWER',   '育成舍',  '', 'Grower',   'GROWER',   50, 'ACTIVE', '鸡舍类型'),
  ('BRD_HOUSE_TYPE', 'BROILER',  '肉鸡舍',  '', 'Broiler',  'BROILER',  60, 'ACTIVE', '鸡舍类型'),

  -- ─── BRD_FLOCK_STATUS 鸡群状态 ──────────────────────────────────────────
  ('BRD_FLOCK_STATUS', 'ACTIVE',     '在产',   '', 'Active',    'ACTIVE',     10, 'ACTIVE', '鸡群状态'),
  ('BRD_FLOCK_STATUS', 'LAYING',     '产蛋中', '', 'Laying',    'LAYING',     20, 'ACTIVE', '鸡群状态'),
  ('BRD_FLOCK_STATUS', 'BROODING',   '育雏期', '', 'Brooding',  'BROODING',   30, 'ACTIVE', '鸡群状态'),
  ('BRD_FLOCK_STATUS', 'GROWING',    '育成期', '', 'Growing',   'GROWING',    40, 'ACTIVE', '鸡群状态'),
  ('BRD_FLOCK_STATUS', 'CULLING',    '淘汰期', '', 'Culling',   'CULLING',    50, 'ACTIVE', '鸡群状态'),
  ('BRD_FLOCK_STATUS', 'INACTIVE',   '已停产', '', 'Inactive',  'INACTIVE',   90, 'ACTIVE', '鸡群状态'),

  -- ─── BRD_BREED 品种（常见蛋鸡品种）───────────────────────────────────────
  ('BRD_BREED', 'HY_LINE_BROWN',    '海兰褐',     '', 'Hy-Line Brown',    'HY_LINE_BROWN',    10, 'ACTIVE', '品种'),
  ('BRD_BREED', 'HY_LINE_WHITE',    '海兰白',     '', 'Hy-Line White',    'HY_LINE_WHITE',    20, 'ACTIVE', '品种'),
  ('BRD_BREED', 'LOHMANN_BROWN',    '罗曼褐',     '', 'Lohmann Brown',    'LOHMANN_BROWN',    30, 'ACTIVE', '品种'),
  ('BRD_BREED', 'LOHMANN_WHITE',    '罗曼白',     '', 'Lohmann White',    'LOHMANN_WHITE',    40, 'ACTIVE', '品种'),
  ('BRD_BREED', 'ISA_BROWN',        '伊莎褐',     '', 'ISA Brown',        'ISA_BROWN',        50, 'ACTIVE', '品种'),
  ('BRD_BREED', 'DEKALB_WHITE',     '德卡白',     '', 'Dekalb White',     'DEKALB_WHITE',     60, 'ACTIVE', '品种'),
  ('BRD_BREED', 'LOCAL',            '本地土鸡',   '', 'Local Native',     'LOCAL',            90, 'ACTIVE', '品种')

ON CONFLICT (dict_type, dict_code) DO NOTHING;

COMMIT;
