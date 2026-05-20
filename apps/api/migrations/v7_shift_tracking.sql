-- v7: 三表统一班次追溯（幂等）
ALTER TABLE pkg_source_batches  ADD COLUMN IF NOT EXISTS shift_id INTEGER;
ALTER TABLE pkg_packing_records ADD COLUMN IF NOT EXISTS shift_id INTEGER;
