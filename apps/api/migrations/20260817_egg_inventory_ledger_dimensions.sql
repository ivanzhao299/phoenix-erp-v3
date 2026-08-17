-- 统一鸡蛋库存流水：保留业务日期及库位维度，供移动端台账与 PC 库存查询共用。
ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS log_date DATE;
ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(64);
ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS location_code VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_inv_ledger_log_date ON inv_ledger(log_date);

-- 历史流水没有业务日期时，按关联批次的 egg_date 回填，避免移动端台账遗漏。
UPDATE inv_ledger l
   SET log_date = b.egg_date,
       warehouse_code = COALESCE(l.warehouse_code, b.warehouse_code),
       location_code = COALESCE(l.location_code, b.location_code)
  FROM inv_batches b
 WHERE b.batch_no = l.batch_no
   AND (l.log_date IS NULL OR l.warehouse_code IS NULL OR l.location_code IS NULL);
