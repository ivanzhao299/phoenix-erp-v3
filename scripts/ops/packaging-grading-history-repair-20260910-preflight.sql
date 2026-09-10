\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE mismatch integer;
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN RAISE EXCEPTION 'preflight must be read only'; END IF;
  SELECT COUNT(*) INTO mismatch
  FROM (VALUES
    (71,'GRD-20260909-136133',54,300,'{"DIRTY":0,"BROKEN":0,"CRACKED":0,"DAMAGED":0,"GRADE_1":300,"GRADE_2":0,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0}'::jsonb,'2026-09-09 02:32:16.133894'::timestamp),
    (72,'GRD-20260909-265670',55,300,'{"DIRTY":0,"BROKEN":0,"CRACKED":0,"DAMAGED":0,"GRADE_1":0,"GRADE_2":300,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0}'::jsonb,'2026-09-09 08:57:45.670324'::timestamp),
    (73,'GRD-20260909-267637',55,300,'{"DIRTY":0,"BROKEN":0,"CRACKED":0,"DAMAGED":0,"GRADE_1":0,"GRADE_2":300,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0}'::jsonb,'2026-09-09 08:57:47.638061'::timestamp),
    (74,'GRD-20260909-269652',55,300,'{"DIRTY":0,"BROKEN":0,"CRACKED":0,"DAMAGED":0,"GRADE_1":300,"GRADE_2":0,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0}'::jsonb,'2026-09-09 08:57:49.652964'::timestamp),
    (75,'GRD-20260910-180875',56,98,'{"DIRTY":0,"BROKEN":0,"CRACKED":0,"DAMAGED":0,"GRADE_1":98,"GRADE_2":0,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0}'::jsonb,'2026-09-10 00:29:40.875321'::timestamp),
    (76,'GRD-20260910-278853',56,98,'{"DIRTY":0,"BROKEN":0,"CRACKED":0,"DAMAGED":0,"GRADE_1":98,"GRADE_2":0,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0}'::jsonb,'2026-09-10 00:31:18.853539'::timestamp),
    (77,'GRD-20260910-306173',56,98,'{"DIRTY":0,"BROKEN":0,"CRACKED":0,"DAMAGED":0,"GRADE_1":98,"GRADE_2":0,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0}'::jsonb,'2026-09-10 00:31:46.173537'::timestamp)
  ) expected(id,code,shift_id,total_output,outputs_json,created_at)
  FULL JOIN (SELECT * FROM pkg_grading_records WHERE id BETWEEN 71 AND 77) actual USING (id)
  WHERE actual.code IS DISTINCT FROM expected.code OR actual.shift_id IS DISTINCT FROM expected.shift_id
     OR actual.total_output IS DISTINCT FROM expected.total_output OR actual.outputs_json IS DISTINCT FROM expected.outputs_json
     OR actual.created_at IS DISTINCT FROM expected.created_at OR actual.status IS DISTINCT FROM 'ACTIVE';
  IF mismatch <> 0 THEN RAISE EXCEPTION 'grading baseline mismatch rows=%', mismatch; END IF;

  IF (SELECT COUNT(*) FROM pkg_grading_records WHERE id BETWEEN 71 AND 77) <> 7 THEN
    RAISE EXCEPTION 'unexpected grading row count';
  END IF;
  IF EXISTS (SELECT 1 FROM pkg_grading_source_links WHERE grading_id BETWEEN 71 AND 77) THEN
    RAISE EXCEPTION 'historical source links appeared; stop for review';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pkg_packing_records WHERE id=31 AND code='PKG-20260909-293183' AND shift_id=55
      AND grading_code='GRD-20260909-136133'
      AND grading_codes_json='["GRD-20260909-136133","GRD-20260909-265670","GRD-20260909-267637","GRD-20260909-269652"]'::jsonb
      AND total_boxes=10 AND total_eggs=300 AND created_at='2026-09-09 08:58:13.183594'::timestamp
  ) THEN RAISE EXCEPTION 'packing row 31 baseline mismatch'; END IF;
  IF (SELECT SUM(total_qty-dirty_qty-cracked_qty) FROM pkg_source_batches WHERE shift_id=55) <> 300
     OR (SELECT SUM(total_qty-dirty_qty-cracked_qty) FROM pkg_source_batches WHERE shift_id=56) <> 196 THEN
    RAISE EXCEPTION 'source net baseline mismatch';
  END IF;
END $$;

SELECT 'PREFLIGHT_PASS' AS result,
       md5(COALESCE(string_agg(md5(row_to_json(b)::text),'' ORDER BY b.batch_no),'')) AS inv_batches_hash
FROM inv_batches b;
SELECT 'LEDGER_HASH' AS result,
       md5(COALESCE(string_agg(md5(row_to_json(l)::text),'' ORDER BY l.id),'')) AS inv_ledger_hash
FROM inv_ledger l;
ROLLBACK;
