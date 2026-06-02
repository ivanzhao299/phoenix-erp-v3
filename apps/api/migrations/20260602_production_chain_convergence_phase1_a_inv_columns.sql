-- ════════════════════════════════════════════════════════════════════════
-- Production Chain Convergence Phase 1 — A · inv_batches 追溯字段 + legacy 标记
-- ────────────────────────────────────────────────────────────────────────
-- 依据：docs/production-inventory-integration-audit.md
-- 目标：
--   1) 为 inv_batches 增加正反向追溯字段（packaging_batch_ref / collection_batch_ref）
--   2) 增加 legacy_source 标记，把三套旧闭环写入的库存批次标识出来：
--        · EGG-STOCK-*            → 闭环A Farm Egg 旁路（已冻结）
--        · PRD-EGG-* / PACK-*     → 闭环B 包装中间态（不再作为最终销售库存）
--      标记后由 FIFO 查询排除，确保销售只认 Sales V2 可售批次（EGG-YYYYMMDD-*）
--   3) 不删除任何历史数据（破坏性操作须授权）；仅加列 + 幂等回填标记
-- 全部幂等：ADD COLUMN IF NOT EXISTS / WHERE ... IS NULL 守卫，可重复执行
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.inv_batches') IS NOT NULL THEN
    -- 追溯字段：包装批次 / 集蛋批次 引用（字符串引用，正反向追溯用）
    ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS packaging_batch_ref  VARCHAR(64);
    ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS collection_batch_ref VARCHAR(64);
    -- legacy 标记：标识旧闭环批次，FIFO 据此排除
    ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS legacy_source        VARCHAR(32);

    -- 回填标记（幂等：仅标记尚未标记的历史批次，不覆盖已标记的）
    -- 闭环A：Farm Egg 旁路固定批次
    UPDATE inv_batches
       SET legacy_source = 'FARM_EGG'
     WHERE batch_no LIKE 'EGG-STOCK-%'
       AND legacy_source IS NULL;

    -- 闭环B：包装中间态（submitGrade 的 BAT-*/PRD-EGG-* + packComplete 的 PACK-*/PRD-EGG-*-PACK
    --        + completeShift 的 PRD-EGG-RAW），不再作为最终销售库存。
    -- 关键守卫：排除「生产链路收口」后由 PackagingInventoryIntegrationService 生成的新可售批次
    --          （batch_no 形如 EGG-YYYYMMDD-* 且 source_type='PACKAGING'），它们才是统一可售库存，
    --          否则会被误标 legacy → FIFO 排除 → 销售看不到包装产出。
    UPDATE inv_batches
       SET legacy_source = 'PACKAGING_INTERMEDIATE'
     WHERE (product_code LIKE 'PRD-EGG-%' OR batch_no LIKE 'PACK-%' OR batch_no LIKE 'BAT-%')
       AND batch_no NOT LIKE 'EGG-%'
       AND source_type IS DISTINCT FROM 'PACKAGING'
       AND legacy_source IS NULL;
  END IF;
END $$;

-- 索引：追溯查询 + FIFO 排除 legacy（部分索引，仅非空/非 legacy 行）
DO $$
BEGIN
  IF to_regclass('public.inv_batches') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_inv_batches_pkg_ref
      ON inv_batches (packaging_batch_ref) WHERE packaging_batch_ref IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_inv_batches_collection_ref
      ON inv_batches (collection_batch_ref) WHERE collection_batch_ref IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_inv_batches_legacy_source
      ON inv_batches (legacy_source) WHERE legacy_source IS NOT NULL;
    -- 销售可售批次快速过滤（仅非 legacy + AVAILABLE）
    CREATE INDEX IF NOT EXISTS idx_inv_batches_saleable
      ON inv_batches (company_code, product_code, expire_date)
      WHERE legacy_source IS NULL AND status = 'AVAILABLE';
  END IF;
END $$;
