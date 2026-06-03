-- v5: 给 pkg_source_batches 补充集蛋细节字段（幂等）
ALTER TABLE pkg_source_batches
  ADD COLUMN IF NOT EXISTS total_qty    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dirty_qty    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cracked_qty  INTEGER NOT NULL DEFAULT 0;

-- 回填历史数据：total_qty 用 expected_qty 填充（近似），dirty/cracked 无历史来源保持 0
UPDATE pkg_source_batches
SET total_qty = GREATEST(expected_qty, received_qty)
WHERE total_qty = 0 AND (expected_qty > 0 OR received_qty > 0);
