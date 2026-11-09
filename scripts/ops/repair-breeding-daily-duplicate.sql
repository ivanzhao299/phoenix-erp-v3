-- Reviewed exact-scope repair for 2026-11-05 / CSJS-001.
-- Preserve the original row as JSON, aggregate only after all assertions pass.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
CREATE TABLE IF NOT EXISTS brd_daily_logs_498_499_repair_backup(
  repair_key text NOT NULL, id integer NOT NULL, row_data jsonb NOT NULL,
  PRIMARY KEY(repair_key,id)
);
INSERT INTO brd_daily_logs_498_499_repair_backup(repair_key,id,row_data)
SELECT '2026-11-05/CSJS-001', id, to_jsonb(d)
FROM brd_daily_logs d WHERE id IN (75,76)
ON CONFLICT (repair_key,id) DO NOTHING;
DO $$
BEGIN
 IF (SELECT COUNT(*) FROM brd_daily_logs WHERE id IN(75,76)) <> 2
    OR EXISTS (SELECT 1 FROM brd_daily_logs WHERE id IN(75,76) AND (log_date <> DATE '2026-11-05' OR house_code <> 'CSJS-001' OR flock_no <> 'FK-MUZ9QYSJSLT'))
    OR (SELECT SUM(eggs_produced) FROM brd_daily_logs WHERE id IN(75,76)) <> 300
    OR (SELECT SUM((eggs_by_grade->>'GRADE_1')::int) FROM brd_daily_logs WHERE id IN(75,76)) <> 150
    OR (SELECT SUM((eggs_by_grade->>'GRD-001')::int) FROM brd_daily_logs WHERE id IN(75,76)) <> 150
    OR EXISTS (SELECT 1 FROM brd_daily_logs WHERE id IN(75,76) AND (opening_qty <> 5000 OR closing_qty <> 5000 OR temp <> 25 OR humidity <> 60 OR mortality_qty <> 0 OR elimination_qty <> 0 OR self_use_qty <> 0))
 THEN RAISE EXCEPTION 'BREEDING_DAILY_REPAIR_SCOPE_MISMATCH'; END IF;
 IF EXISTS (SELECT 1 FROM pkg_tasks WHERE house_code='CSJS-001' AND created_at::date=DATE '2026-11-05')
 THEN RAISE EXCEPTION 'BREEDING_DAILY_REPAIR_TASK_REFERENCE_HOLD'; END IF;
END $$;
UPDATE brd_daily_logs SET shift='DAILY', eggs_produced=300,
 eggs_by_grade=jsonb_build_object('GRADE_1',150,'GRD-001',150), lay_rate=6,
 updated_at=NOW() WHERE id=75;
DELETE FROM brd_daily_logs WHERE id=76;
DO $$
BEGIN
 IF (SELECT COUNT(*) FROM brd_daily_logs WHERE log_date=DATE '2026-11-05' AND house_code='CSJS-001') <> 1
 OR NOT EXISTS (SELECT 1 FROM brd_daily_logs WHERE id=75 AND shift='DAILY' AND eggs_produced=300 AND lay_rate=6)
 THEN RAISE EXCEPTION 'BREEDING_DAILY_REPAIR_POSTCHECK_FAILED'; END IF;
END $$;
COMMIT;
