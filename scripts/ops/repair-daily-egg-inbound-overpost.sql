-- Reviewed repair for the three overposted daily egg groups from audit run 42547702372.
-- Never delete source rows or ledger events. Apply only when exact batch state matches.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TEMP TABLE daily_egg_overpost_repair(batch_no text PRIMARY KEY, expected_qty int, reverse_qty int, repair_ref text) ON COMMIT DROP;
INSERT INTO daily_egg_overpost_repair VALUES
  ('EGG-20261105-00002', 50, 50, 'DAILY-OVERPOST-20261105-CSJS-001-GRADE_2'),
  ('EGG-20261107-00002', 25, 10, 'DAILY-OVERPOST-20261107-CSJS-001-GRADE_1'),
  ('EGG-20261107-00001', 25, 10, 'DAILY-OVERPOST-20261107-CSJS-001-GRD-001');

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM inv_batches b JOIN daily_egg_overpost_repair r USING(batch_no)
      WHERE b.source_type='TEMP_PRODUCTION' AND b.qty=r.expected_qty
        AND b.qty_available=r.expected_qty AND b.status='AVAILABLE') <> 3 THEN
    RAISE EXCEPTION 'DAILY_EGG_OVERPOST_STATE_MISMATCH';
  END IF;
  IF EXISTS (
    SELECT 1 FROM inv_ledger l JOIN daily_egg_overpost_repair r ON r.batch_no=l.batch_no
    WHERE l.change_type NOT IN ('TEMP_PRODUCTION_INBOUND','TEMP_PRODUCTION_REVERSAL')
  ) THEN
    RAISE EXCEPTION 'DAILY_EGG_OVERPOST_BATCH_CONSUMED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM daily_egg_overpost_repair r
    WHERE EXISTS (SELECT 1 FROM inv_ledger l WHERE l.batch_no=r.batch_no AND l.change_type='TEMP_PRODUCTION_REVERSAL')
  ) THEN
    RAISE EXCEPTION 'DAILY_EGG_OVERPOST_ALREADY_APPLIED';
  END IF;
END $$;

UPDATE inv_batches b
SET qty = b.qty - r.reverse_qty,
    qty_available = b.qty_available - r.reverse_qty,
    updated_at = NOW()
FROM daily_egg_overpost_repair r
WHERE b.batch_no=r.batch_no;

INSERT INTO inv_ledger (
  batch_no, change_type, qty_change, operator, ref_no, note,
  log_date, warehouse_code, location_code, quality_grade,
  company_code, sku_code, created_at
)
SELECT b.batch_no, 'TEMP_PRODUCTION_REVERSAL', -r.reverse_qty,
       'system:daily-egg-overpost-repair', r.repair_ref,
       '日报为准：冲销超过日报分级数量的 TEMP_PRODUCTION 入库；保留原始入库流水',
       b.egg_date, b.warehouse_code, b.location_code,
       COALESCE(b.grade_code_std,b.quality_grade), b.company_code, b.sku_code, NOW()
FROM inv_batches b JOIN daily_egg_overpost_repair r USING(batch_no);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM inv_batches b JOIN daily_egg_overpost_repair r USING(batch_no)
             WHERE b.qty_available <> b.qty - r.reverse_qty) THEN
    RAISE EXCEPTION 'DAILY_EGG_OVERPOST_POST_STATE_MISMATCH';
  END IF;
END $$;
COMMIT;
