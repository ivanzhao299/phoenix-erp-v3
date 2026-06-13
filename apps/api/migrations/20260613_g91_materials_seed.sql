-- ════════════════════════════════════════════════════════════════════════
-- G91 采购物料起步数据 — 蛋鸡场常用物料（ACTIVE 立即可用，业务员可在物料档案增删）
-- ────────────────────────────────────────────────────────────────────────
-- 背景：G86 建了 mst_materials 表/菜单/选择器，但无数据→采购物料下拉为空。
--   本 seed 录入蛋鸡养殖常用物料起步集；快速新建端点(createQuick)可随时追加。
-- 类型字典 PRC_MATERIAL_TYPE：FEED_RAW/VET_DRUG/PACKAGING/EQUIPMENT/CONSTRUCTION/OFFICE/TOOL/OTHER
-- 编码用语义码 MAT-* （与 runtime 自动序列 MAT-00001 不冲突）。幂等 NOT EXISTS。
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO mst_materials (material_code, material_name, material_type, spec, unit, status)
SELECT v.code, v.name, v.mtype, v.spec, v.unit, 'ACTIVE'
FROM (VALUES
  -- 饲料原料
  ('MAT-FEED-CORN',     '玉米',         'FEED_RAW',  '饲料级',        'kg'),
  ('MAT-FEED-SOYMEAL',  '豆粕',         'FEED_RAW',  '43%蛋白',       'kg'),
  ('MAT-FEED-WHEATBRAN','麸皮',         'FEED_RAW',  '饲料级',        'kg'),
  ('MAT-FEED-PREMIX',   '蛋鸡预混料',   'FEED_RAW',  '5%复合',        'kg'),
  ('MAT-FEED-LIMESTONE','石粉（钙源）', 'FEED_RAW',  '饲料级碳酸钙',  'kg'),
  ('MAT-FEED-FISHMEAL', '鱼粉',         'FEED_RAW',  '蛋白补充',      'kg'),
  ('MAT-FEED-OILBRAN',  '米糠',         'FEED_RAW',  '饲料级',        'kg'),
  ('MAT-FEED-FINISHED', '蛋鸡全价配合料','FEED_RAW', '产蛋期',        'kg'),
  -- 兽药疫苗
  ('MAT-VET-NDV',       '新城疫疫苗',   'VET_DRUG',  'LaSota株',      '瓶'),
  ('MAT-VET-AI',        '禽流感疫苗',   'VET_DRUG',  'H5+H7',         '瓶'),
  ('MAT-VET-IB',        '传支疫苗',     'VET_DRUG',  'H120',          '瓶'),
  ('MAT-VET-DEWORM',    '驱虫药',       'VET_DRUG',  '广谱',          '瓶'),
  ('MAT-VET-VITAMIN',   '多维电解质',   'VET_DRUG',  '水溶性',        '袋'),
  ('MAT-VET-DISINFECT', '消毒液',       'VET_DRUG',  '聚维酮碘',      'L'),
  -- 包装材料
  ('MAT-PKG-TRAY30',    '30枚蛋托',     'PACKAGING', '纸浆/塑料',     '个'),
  ('MAT-PKG-BOX360',    '360枚纸箱',    'PACKAGING', '瓦楞',          '个'),
  ('MAT-PKG-FILM',      '包装收缩膜',   'PACKAGING', 'PE',            '卷'),
  ('MAT-PKG-TAPE',      '封箱胶带',     'PACKAGING', '宽48mm',        '卷'),
  ('MAT-PKG-LABEL',     '标签贴纸',     'PACKAGING', '不干胶',        '卷'),
  -- 设备及配件
  ('MAT-EQ-NIPPLE',     '乳头饮水器',   'EQUIPMENT', '不锈钢',        '个'),
  ('MAT-EQ-FEEDLINE',   '料线配件',     'EQUIPMENT', '通用',          '套'),
  ('MAT-EQ-FANBELT',    '风机皮带',     'EQUIPMENT', '通用',          '条'),
  ('MAT-EQ-BULB',       '照明灯泡',     'EQUIPMENT', 'LED',           '个'),
  -- 建材 / 工具 / 办公
  ('MAT-CON-CEMENT',    '水泥',         'CONSTRUCTION','42.5',        '袋'),
  ('MAT-CON-WIREMESH',  '镀锌铁丝网',   'CONSTRUCTION','建材',        'm'),
  ('MAT-TOOL-GLOVE',    '劳保手套',     'TOOL',      '防护',          '副'),
  ('MAT-TOOL-BROOM',    '清洁工具',     'TOOL',      '扫把/铲',       '把'),
  ('MAT-OFF-PAPER',     '办公用纸',     'OFFICE',    'A4',            '包')
) AS v(code, name, mtype, spec, unit)
WHERE NOT EXISTS (
  SELECT 1 FROM mst_materials m WHERE m.material_code = v.code
);
