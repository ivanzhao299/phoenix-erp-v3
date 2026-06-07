-- ═════════════════════════════════════════════════════════════════════════════
-- G17 · 出库单可用化 + 业务字典 seed
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：宋明光新建出库单字段全部不能下拉。SSH 审计实表得知：
--   1. wms_outbound 缺 warehouse_code / batch_no / attachment_url / date /
--      destination_customer_code 等列；前端 FIELDS 用了不存在的字段名。
--   2. sys_dict 业务字典 INV_OUTBOUND_TYPE / INV_INBOUND_TYPE / ... 全 0 行
--      （前端走 DictSelect 调 /api/dict/INV_OUTBOUND_TYPE → 0 选项）。
--
-- 改动：
--   § 1. wms_outbound 加列（幂等 IF NOT EXISTS）
--   § 2. wms_inbound 加列（attachment_url / date）
--   § 3. sys_dict 加 (dict_type, dict_code) 唯一约束（防重复 seed）
--   § 4. seed 8 类业务字典：
--        · INV_OUTBOUND_TYPE       出库类型
--        · INV_OUTBOUND_DEST_TYPE  出库去向类型
--        · INV_INBOUND_TYPE        入库类型
--        · INV_TRANSFER_REASON     调拨原因
--        · INV_LOSS_REASON         损耗原因
--        · INV_COUNT_TYPE          盘点类型
--        · BRD_MORTALITY_REASON    死亡原因
--        · BRD_CULLING_REASON      淘汰原因
--        · VET_USAGE               用药途径
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
BEGIN
  -- § 1. wms_outbound 加列
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='wms_outbound') THEN
    EXECUTE 'ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(64)';
    EXECUTE 'ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS batch_no VARCHAR(64)';
    EXECUTE 'ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS attachment_url TEXT';
    EXECUTE 'ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS date DATE';
    EXECUTE 'ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS destination_customer_code VARCHAR(64)';
    EXECUTE 'ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS site_code VARCHAR(64)';
    EXECUTE 'ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS company_code VARCHAR(64)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wms_outbound_site ON wms_outbound(site_code)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wms_outbound_warehouse ON wms_outbound(warehouse_code)';
    -- outbound_no 唯一性（防前端硬编码冲突）
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_wms_outbound_no ON wms_outbound(outbound_no) WHERE outbound_no IS NOT NULL';
    RAISE NOTICE '[g17] wms_outbound 加列完成';
  END IF;

  -- § 2. wms_inbound 加列
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='wms_inbound') THEN
    EXECUTE 'ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS attachment_url TEXT';
    EXECUTE 'ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS date DATE';
    EXECUTE 'ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS site_code VARCHAR(64)';
    EXECUTE 'ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS company_code VARCHAR(64)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wms_inbound_site ON wms_inbound(site_code)';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_wms_inbound_no ON wms_inbound(task_no) WHERE task_no IS NOT NULL';
    RAISE NOTICE '[g17] wms_inbound 加列完成';
  END IF;

  -- § 3. sys_dict 加 (dict_type, dict_code) 唯一约束（如不存在）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sys_dict') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE tablename='sys_dict' AND indexname='uq_sys_dict_type_code'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX uq_sys_dict_type_code ON sys_dict(dict_type, dict_code)';
    END IF;
    RAISE NOTICE '[g17] sys_dict 唯一约束就绪';
  END IF;
END $body$;

-- § 4. 业务字典 seed（幂等 ON CONFLICT DO NOTHING）
INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, dict_label_lo, dict_label_en, dict_value, sort_no, status, name)
VALUES
  -- ─── INV_OUTBOUND_TYPE 出库类型 ──────────────────────────────────────────
  ('INV_OUTBOUND_TYPE', 'SALE',                 '销售出库',        'ການອອກຄັງເພື່ອການຂາຍ', 'Sales',           'SALE',                 10, 'ACTIVE', '出库类型'),
  ('INV_OUTBOUND_TYPE', 'TRANSFER',             '调拨出库',        'ການໂອນສິນຄ້າ',          'Transfer',        'TRANSFER',             20, 'ACTIVE', '出库类型'),
  ('INV_OUTBOUND_TYPE', 'PRODUCTION_USE',       '生产领用',        'ໃຊ້ສຳລັບການຜະລິດ',      'Production Use',  'PRODUCTION_USE',       30, 'ACTIVE', '出库类型'),
  ('INV_OUTBOUND_TYPE', 'FEED_DISTRIBUTION',    '饲料发放',        'ການແຈກອາຫານ',           'Feed Distribute', 'FEED_DISTRIBUTION',    40, 'ACTIVE', '出库类型'),
  ('INV_OUTBOUND_TYPE', 'MEDICINE_DISTRIBUTION','兽药发放',        'ການແຈກຢາ',              'Med Distribute',  'MEDICINE_DISTRIBUTION',50, 'ACTIVE', '出库类型'),
  ('INV_OUTBOUND_TYPE', 'SCRAP',                '报废出库',        'ການລົບລ້າງ',            'Scrap',           'SCRAP',                60, 'ACTIVE', '出库类型'),
  ('INV_OUTBOUND_TYPE', 'RETURN',               '退货出库',        'ການສົ່ງຄືນ',            'Return',          'RETURN',               70, 'ACTIVE', '出库类型'),

  -- ─── INV_OUTBOUND_DEST_TYPE 出库去向类型 ────────────────────────────────
  ('INV_OUTBOUND_DEST_TYPE', 'HOUSE',     '鸡舍',     '',  'Chicken House', 'HOUSE',     10, 'ACTIVE', '出库去向'),
  ('INV_OUTBOUND_DEST_TYPE', 'CUSTOMER',  '客户',     '',  'Customer',      'CUSTOMER',  20, 'ACTIVE', '出库去向'),
  ('INV_OUTBOUND_DEST_TYPE', 'WAREHOUSE', '其它仓库', '',  'Warehouse',     'WAREHOUSE', 30, 'ACTIVE', '出库去向'),
  ('INV_OUTBOUND_DEST_TYPE', 'STORE',     '门店',     '',  'Store',         'STORE',     40, 'ACTIVE', '出库去向'),

  -- ─── INV_INBOUND_TYPE 入库类型 ──────────────────────────────────────────
  ('INV_INBOUND_TYPE', 'PURCHASE',         '采购入库',     '', 'Purchase',     'PURCHASE',         10, 'ACTIVE', '入库类型'),
  ('INV_INBOUND_TYPE', 'PRODUCTION',       '生产入库',     '', 'Production',   'PRODUCTION',       20, 'ACTIVE', '入库类型'),
  ('INV_INBOUND_TYPE', 'RETURN',           '退货入库',     '', 'Return',       'RETURN',           30, 'ACTIVE', '入库类型'),
  ('INV_INBOUND_TYPE', 'ADJUSTMENT',       '盘盈入库',     '', 'Adjustment',   'ADJUSTMENT',       40, 'ACTIVE', '入库类型'),
  ('INV_INBOUND_TYPE', 'TRANSFER_RECEIVE', '调拨接收',     '', 'Transfer In',  'TRANSFER_RECEIVE', 50, 'ACTIVE', '入库类型'),

  -- ─── INV_TRANSFER_REASON 调拨原因 ───────────────────────────────────────
  ('INV_TRANSFER_REASON', 'REBALANCE',         '库存调平',   '', 'Rebalance',          'REBALANCE',         10, 'ACTIVE', '调拨原因'),
  ('INV_TRANSFER_REASON', 'EXPIRY_RISK',       '临期处置',   '', 'Expiry Risk',        'EXPIRY_RISK',       20, 'ACTIVE', '调拨原因'),
  ('INV_TRANSFER_REASON', 'PRODUCTION_NEEDS',  '生产需要',   '', 'Production Needs',   'PRODUCTION_NEEDS',  30, 'ACTIVE', '调拨原因'),
  ('INV_TRANSFER_REASON', 'EMERGENCY_SUPPLY',  '紧急调配',   '', 'Emergency',          'EMERGENCY_SUPPLY',  40, 'ACTIVE', '调拨原因'),

  -- ─── INV_LOSS_REASON 损耗原因 ───────────────────────────────────────────
  ('INV_LOSS_REASON', 'DAMAGED',     '破损',     '', 'Damaged',     'DAMAGED',     10, 'ACTIVE', '损耗原因'),
  ('INV_LOSS_REASON', 'EXPIRED',     '过期',     '', 'Expired',     'EXPIRED',     20, 'ACTIVE', '损耗原因'),
  ('INV_LOSS_REASON', 'THEFT',       '失窃',     '', 'Theft',       'THEFT',       30, 'ACTIVE', '损耗原因'),
  ('INV_LOSS_REASON', 'COUNT_DIFF',  '盘点差异', '', 'Count Diff',  'COUNT_DIFF',  40, 'ACTIVE', '损耗原因'),
  ('INV_LOSS_REASON', 'NATURAL',     '自然损耗', '', 'Natural',     'NATURAL',     50, 'ACTIVE', '损耗原因'),

  -- ─── INV_COUNT_TYPE 盘点类型 ────────────────────────────────────────────
  ('INV_COUNT_TYPE', 'FULL',    '全盘',   '', 'Full',        'FULL',    10, 'ACTIVE', '盘点类型'),
  ('INV_COUNT_TYPE', 'SAMPLE',  '抽盘',   '', 'Sample',      'SAMPLE',  20, 'ACTIVE', '盘点类型'),
  ('INV_COUNT_TYPE', 'CYCLE',   '循环盘点', '', 'Cycle Count', 'CYCLE',   30, 'ACTIVE', '盘点类型'),

  -- ─── BRD_MORTALITY_REASON 死亡原因 ──────────────────────────────────────
  ('BRD_MORTALITY_REASON', 'DISEASE',   '疾病',   '', 'Disease',      'DISEASE',   10, 'ACTIVE', '死亡原因'),
  ('BRD_MORTALITY_REASON', 'INJURY',    '外伤',   '', 'Injury',       'INJURY',    20, 'ACTIVE', '死亡原因'),
  ('BRD_MORTALITY_REASON', 'HEAT',      '热应激', '', 'Heat Stress',  'HEAT',      30, 'ACTIVE', '死亡原因'),
  ('BRD_MORTALITY_REASON', 'NATURAL',   '自然',   '', 'Natural',      'NATURAL',   40, 'ACTIVE', '死亡原因'),
  ('BRD_MORTALITY_REASON', 'UNKNOWN',   '不明',   '', 'Unknown',      'UNKNOWN',   90, 'ACTIVE', '死亡原因'),

  -- ─── BRD_CULLING_REASON 淘汰原因 ────────────────────────────────────────
  ('BRD_CULLING_REASON', 'LOW_PRODUCTION',  '产蛋率低', '', 'Low Production', 'LOW_PRODUCTION',  10, 'ACTIVE', '淘汰原因'),
  ('BRD_CULLING_REASON', 'SICKNESS',        '患病',     '', 'Sickness',       'SICKNESS',        20, 'ACTIVE', '淘汰原因'),
  ('BRD_CULLING_REASON', 'AGE',             '老龄',     '', 'Aged',           'AGE',             30, 'ACTIVE', '淘汰原因'),
  ('BRD_CULLING_REASON', 'INJURY',          '严重外伤', '', 'Injury',         'INJURY',          40, 'ACTIVE', '淘汰原因'),
  ('BRD_CULLING_REASON', 'OTHER',           '其它',     '', 'Other',          'OTHER',           90, 'ACTIVE', '淘汰原因'),

  -- ─── VET_USAGE 用药途径 ─────────────────────────────────────────────────
  ('VET_USAGE', 'ORAL',       '口服',       '', 'Oral',         'ORAL',       10, 'ACTIVE', '用药途径'),
  ('VET_USAGE', 'INJECTION',  '注射',       '', 'Injection',    'INJECTION',  20, 'ACTIVE', '用药途径'),
  ('VET_USAGE', 'DRINK',      '饮水',       '', 'Drinking',     'DRINK',      30, 'ACTIVE', '用药途径'),
  ('VET_USAGE', 'SPRAY',      '喷雾',       '', 'Spray',        'SPRAY',      40, 'ACTIVE', '用药途径'),
  ('VET_USAGE', 'EXTERNAL',   '体外涂抹',   '', 'External',     'EXTERNAL',   50, 'ACTIVE', '用药途径')

ON CONFLICT (dict_type, dict_code) DO NOTHING;

COMMIT;

-- ─── 验证 ───────────────────────────────────────────
-- SELECT dict_type, count(*) FROM sys_dict WHERE dict_type IN
--   ('INV_OUTBOUND_TYPE','INV_OUTBOUND_DEST_TYPE','INV_INBOUND_TYPE','INV_TRANSFER_REASON',
--    'INV_LOSS_REASON','INV_COUNT_TYPE','BRD_MORTALITY_REASON','BRD_CULLING_REASON','VET_USAGE')
--  GROUP BY dict_type ORDER BY dict_type;
-- SELECT column_name FROM information_schema.columns WHERE table_name='wms_outbound' ORDER BY ordinal_position;
