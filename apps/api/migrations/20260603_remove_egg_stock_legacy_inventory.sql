-- ════════════════════════════════════════════════════════════════════════
-- R1 · 删除重复库存体系 — 清理 EGG-STOCK-* / FARM_EGG 测试库存
-- ────────────────────────────────────────────────────────────────────────
-- 依据：docs/production-runtime-rebuild-phase-r1-delete-duplicate-inventory.md
-- 背景：Farm Egg Inventory Runtime（EGG-STOCK-* 旁路库存）已在 R1 删除（service onModuleInit
--   + inbound/outbound/writeOff 已移除，不再生成/扣减）。系统未正式上线，EGG-STOCK-* 均为测试数据，
--   本迁移一次性清理其批次与流水。
--
-- 安全保证（强守卫，绝不误删正式库存）：
--   · 仅删 batch_no LIKE 'EGG-STOCK-%'（farm-egg 固定批次命名）
--   · 仅删 warehouse_code='FARM_EGG' 的对应流水
--   · 不触碰 EGG-YYYYMMDD-*（唯一可售库存）
--   · 不触碰 source_type='PACKAGING'（包装入库）
--   · 不触碰 TEMP_PRODUCTION_INBOUND 生成的批次
--   · DELETE 天然幂等，可重复执行
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_ledger INTEGER := 0;
  v_batch  INTEGER := 0;
BEGIN
  IF to_regclass('public.inv_ledger') IS NOT NULL THEN
    -- 先删流水（按 EGG-STOCK-* 批次号；双重守卫排除任何 EGG-YYYYMMDD-* / PACKAGING）
    DELETE FROM inv_ledger
     WHERE batch_no LIKE 'EGG-STOCK-%'
       AND batch_no NOT LIKE 'EGG-2%';     -- 守卫：排除 EGG-YYYYMMDD-*
    GET DIAGNOSTICS v_ledger = ROW_COUNT;
  END IF;

  IF to_regclass('public.inv_batches') IS NOT NULL THEN
    -- 再删批次（EGG-STOCK-* 且 来源非 PACKAGING；warehouse=FARM_EGG）
    DELETE FROM inv_batches
     WHERE batch_no LIKE 'EGG-STOCK-%'
       AND batch_no NOT LIKE 'EGG-2%'                       -- 守卫：排除 EGG-YYYYMMDD-*
       AND (source_type IS DISTINCT FROM 'PACKAGING')       -- 守卫：排除包装入库
       AND (warehouse_code = 'FARM_EGG' OR legacy_source = 'FARM_EGG' OR warehouse_code IS NULL);
    GET DIAGNOSTICS v_batch = ROW_COUNT;
  END IF;

  RAISE NOTICE 'R1 清理 EGG-STOCK 测试库存：删除批次 % 条，流水 % 条', v_batch, v_ledger;
END $$;
