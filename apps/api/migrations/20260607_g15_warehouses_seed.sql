-- ═════════════════════════════════════════════════════════════════════════════
-- G15 · 仓库主数据治理 — 6 类仓 × 每 SITE 一套
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务方明确：
--   · 6 类仓库枚举：EGG_FARM / EGG_SALES / MEDICINE / FEED / RAW_MATERIAL /
--                    PURCHASE_RECV / FINISHED（其实 7 类含 FINISHED）
--   · 每个 SITE 一套子仓
--   · 孟赛保持 TEMP_PRODUCTION_INBOUND（包装作业台未启用）
--
-- 改动：
--   1) wms_warehouses 加 site_code / company_code 列（按 SITE 隔离）
--   2) seed 孟赛 7 类仓（LPH_MS_*）
--   3) 历史 inv_batches 数据迁移：
--      · warehouse_code='MEDICINE'           → 'LPH_MS_MEDICINE'
--      · warehouse_code='SITE-MENGSAI-LAYER' → 'LPH_MS_EGG_SALES'（鸡蛋销售批次）
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='wms_warehouses') THEN
    RAISE NOTICE '[g15] wms_warehouses 不存在（CI），跳过';
    RETURN;
  END IF;

  -- § 1. 加 site_code / company_code 列
  EXECUTE 'ALTER TABLE wms_warehouses ADD COLUMN IF NOT EXISTS site_code VARCHAR(64)';
  EXECUTE 'ALTER TABLE wms_warehouses ADD COLUMN IF NOT EXISTS company_code VARCHAR(64)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wms_warehouses_site ON wms_warehouses(site_code)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wms_warehouses_type ON wms_warehouses(type)';

  -- § 2. seed 孟赛 7 类仓
  EXECUTE $$INSERT INTO wms_warehouses (warehouse_code, warehouse_name, warehouse_name_zh, type, status, site_code, company_code)
            VALUES
              ('LPH_MS_EGG_FARM',    'Mengsai Egg Farm Storage',     '孟赛农场鸡蛋暂存仓', 'EGG_FARM',      'ACTIVE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI'),
              ('LPH_MS_EGG_SALES',  'Mengsai Egg Sales Inventory',  '孟赛鸡蛋销售成品仓', 'EGG_SALES',     'ACTIVE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI'),
              ('LPH_MS_MEDICINE',   'Mengsai Medicine Warehouse',   '孟赛药品/疫苗仓',    'MEDICINE',      'ACTIVE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI'),
              ('LPH_MS_FEED',       'Mengsai Feed Warehouse',       '孟赛饲料仓',         'FEED',          'ACTIVE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI'),
              ('LPH_MS_RAW',        'Mengsai Raw Material',         '孟赛原料/包材仓',    'RAW_MATERIAL',  'ACTIVE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI'),
              ('LPH_MS_PURCHASE',   'Mengsai Purchase Receiving',   '孟赛采购到货仓',     'PURCHASE_RECV', 'ACTIVE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI'),
              ('LPH_MS_FINISHED',   'Mengsai Finished Goods',       '孟赛包装成品仓',     'FINISHED',      'ACTIVE', 'SITE-MENGSAI-LAYER', 'COMP-LAO-AGRI')
            ON CONFLICT (warehouse_code) DO UPDATE
              SET warehouse_name_zh = EXCLUDED.warehouse_name_zh,
                  type              = EXCLUDED.type,
                  site_code         = EXCLUDED.site_code,
                  company_code      = EXCLUDED.company_code,
                  status            = 'ACTIVE'$$;

  -- § 3. 迁移历史 inv_batches 数据到正确仓（列存在性守卫，CI 测试库缺列跳过）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inv_batches')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='inv_batches' AND column_name='warehouse_code') THEN
    EXECUTE $$UPDATE inv_batches SET warehouse_code='LPH_MS_MEDICINE'  WHERE warehouse_code='MEDICINE'$$;
    EXECUTE $$UPDATE inv_batches SET warehouse_code='LPH_MS_EGG_SALES' WHERE warehouse_code='SITE-MENGSAI-LAYER' AND product_code='EGG'$$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inv_ledger')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='inv_ledger' AND column_name='warehouse_code') THEN
    EXECUTE $$UPDATE inv_ledger SET warehouse_code='LPH_MS_MEDICINE' WHERE warehouse_code='MEDICINE'$$;
  END IF;

  RAISE NOTICE '[g15] 孟赛 7 类仓 seed 完成 + 历史 inv_batches/inv_ledger 已迁码';
END $body$;

COMMIT;

-- ─── 验证 ───────────────────────────────────────────
-- SELECT type, count(*) FROM wms_warehouses WHERE site_code='SITE-MENGSAI-LAYER' GROUP BY type ORDER BY type;
-- SELECT warehouse_code, count(*) FROM inv_batches GROUP BY warehouse_code;

-- ─── 回滚 ───────────────────────────────────────────
-- UPDATE inv_batches SET warehouse_code='MEDICINE' WHERE warehouse_code='LPH_MS_MEDICINE';
-- UPDATE inv_batches SET warehouse_code='SITE-MENGSAI-LAYER' WHERE warehouse_code='LPH_MS_EGG_SALES';
-- DELETE FROM wms_warehouses WHERE site_code='SITE-MENGSAI-LAYER';
