-- ═════════════════════════════════════════════════════════════════════════════
-- G11 · inv_batches / inv_ledger qty 升级 NUMERIC（支持药品小数公斤）
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务驱动：G10 药品 ETL 数据含小数公斤（17.55 / 3.8 / 24.95 等），integer
-- 精度损失业务方不接受。升级为 NUMERIC(14,3) 支持千分位精度。
--
-- 兼容性：
--   · PG NUMERIC 与 INTEGER 在 +/-/比较运算上自动转换，service 层不需改
--   · 鸡蛋库存批次 qty 全为整数 → 升级后值不变（17 → 17.000）
--   · TypeORM 默认读 NUMERIC 为 string，但 inv_batches 全部走 raw SQL，不影响
--
-- 影响表：
--   · inv_batches:   qty INT → NUMERIC(14,3)，qty_available INT → NUMERIC(14,3)
--   · inv_ledger:    qty_change INT → NUMERIC(14,3)
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='inv_batches') THEN
    RAISE NOTICE '[g11] inv_batches 不存在（CI），跳过';
    RETURN;
  END IF;

  -- inv_batches.qty
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_name='inv_batches' AND column_name='qty') = 'integer' THEN
    EXECUTE 'ALTER TABLE inv_batches ALTER COLUMN qty TYPE NUMERIC(14,3) USING qty::numeric(14,3)';
    RAISE NOTICE '[g11] inv_batches.qty INTEGER → NUMERIC(14,3)';
  END IF;

  -- inv_batches.qty_available
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_name='inv_batches' AND column_name='qty_available') = 'integer' THEN
    EXECUTE 'ALTER TABLE inv_batches ALTER COLUMN qty_available TYPE NUMERIC(14,3) USING qty_available::numeric(14,3)';
    RAISE NOTICE '[g11] inv_batches.qty_available INTEGER → NUMERIC(14,3)';
  END IF;

  -- inv_ledger.qty_change（含负数）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inv_ledger')
     AND (SELECT data_type FROM information_schema.columns
           WHERE table_name='inv_ledger' AND column_name='qty_change') = 'integer' THEN
    EXECUTE 'ALTER TABLE inv_ledger ALTER COLUMN qty_change TYPE NUMERIC(14,3) USING qty_change::numeric(14,3)';
    RAISE NOTICE '[g11] inv_ledger.qty_change INTEGER → NUMERIC(14,3)';
  END IF;
END $body$;

COMMIT;

-- ─── 回滚（不推荐 — 会丢失小数精度）───────────────────
-- ALTER TABLE inv_batches ALTER COLUMN qty           TYPE INTEGER USING qty::integer;
-- ALTER TABLE inv_batches ALTER COLUMN qty_available TYPE INTEGER USING qty_available::integer;
-- ALTER TABLE inv_ledger  ALTER COLUMN qty_change    TYPE INTEGER USING qty_change::integer;
