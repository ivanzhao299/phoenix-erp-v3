-- One-time production repair for the 2026-10-08 duplicate daily-egg posts.
-- Read the audit result first. This script refuses to touch a consumed batch,
-- a non-daily source, or a kept batch that still exceeds its daily report.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TEMP TABLE daily_egg_duplicate_repair ON COMMIT DROP AS
WITH ranked AS (
  SELECT b.id, b.batch_no, b.company_code, b.source_no, b.sku_code,
         COALESCE(b.grade_code_std, b.quality_grade, '') AS grade_code,
         COALESCE(b.spec_code, b.packaging_spec, '') AS spec_code,
         b.egg_date, b.collection_batch_ref, b.qty, b.qty_available,
         b.status, b.created_at,
         ROW_NUMBER() OVER (
           PARTITION BY b.company_code, b.source_no,
                        COALESCE(b.sku_code, ''),
                        COALESCE(b.grade_code_std, b.quality_grade, ''),
                        COALESCE(b.spec_code, b.packaging_spec, '')
           ORDER BY b.created_at DESC, b.id DESC
         ) AS rn,
         COUNT(*) OVER (
           PARTITION BY b.company_code, b.source_no,
                        COALESCE(b.sku_code, ''),
                        COALESCE(b.grade_code_std, b.quality_grade, ''),
                        COALESCE(b.spec_code, b.packaging_spec, '')
         ) AS group_count
    FROM inv_batches b
   WHERE b.source_type = 'TEMP_PRODUCTION'
     AND b.source_no IS NOT NULL
)
SELECT * FROM ranked WHERE group_count > 1 AND rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM daily_egg_duplicate_repair) THEN
    RAISE EXCEPTION 'DAILY_EGG_REPAIR_NO_DUPLICATES';
  END IF;
  IF EXISTS (
    SELECT 1 FROM daily_egg_duplicate_repair
     WHERE collection_batch_ref NOT LIKE 'HOUSE-%'
        OR qty_available IS DISTINCT FROM qty
        OR qty <= 0
        OR status <> 'AVAILABLE'
  ) THEN
    RAISE EXCEPTION 'DAILY_EGG_REPAIR_UNSAFE_BATCH_STATE';
  END IF;
END $$;

-- The newest row in every duplicate group must be the report-authoritative
-- quantity. Any mismatch stops the repair instead of guessing which row wins.
DO $$
BEGIN
  IF EXISTS (
    WITH report_grade AS (
      SELECT dl.log_date::date AS log_date, dl.house_code, grade.key AS grade,
             SUM(GREATEST(0, ROUND(grade.value::numeric)))::numeric AS qty
        FROM brd_daily_logs dl
        CROSS JOIN LATERAL jsonb_each_text(COALESCE(dl.eggs_by_grade, '{}'::jsonb)) grade
       GROUP BY dl.log_date, dl.house_code, grade.key
    ), kept AS (
      SELECT b.egg_date::date AS log_date,
             SUBSTRING(b.collection_batch_ref FROM 7) AS house_code,
             COALESCE(b.grade_code_std, b.quality_grade) AS grade,
             SUM(b.qty)::numeric AS qty
        FROM inv_batches b
       WHERE b.source_type = 'TEMP_PRODUCTION'
         AND b.source_no IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM daily_egg_duplicate_repair d
            WHERE d.company_code = b.company_code
              AND d.source_no = b.source_no
         )
         AND NOT EXISTS (SELECT 1 FROM daily_egg_duplicate_repair d WHERE d.id = b.id)
       GROUP BY b.egg_date, SUBSTRING(b.collection_batch_ref FROM 7),
                COALESCE(b.grade_code_std, b.quality_grade)
    )
    SELECT 1
      FROM kept k
      LEFT JOIN report_grade r
        ON r.log_date = k.log_date AND r.house_code = k.house_code AND r.grade = k.grade
     WHERE r.qty IS NULL OR k.qty > r.qty
  ) THEN
    RAISE EXCEPTION 'DAILY_EGG_REPAIR_REPORT_MISMATCH';
  END IF;
END $$;

-- Keep the old row and its ledger references for auditability, but remove it
-- from active stock and from the source identity that will be made unique.
UPDATE inv_batches b
   SET qty = 0,
       qty_available = 0,
       source_no = NULL,
       legacy_source = CONCAT_WS('|', NULLIF(b.legacy_source, ''),
         'DAILY_EGG_DUPLICATE_RETIRED source_no=', d.source_no),
       updated_at = NOW()
  FROM daily_egg_duplicate_repair d
 WHERE b.id = d.id;

-- Reverse the retired quantity in the unified ledger without deleting the
-- original event rows. The compensating row is idempotent by batch_no.
INSERT INTO inv_ledger (
  batch_no, change_type, qty_change, operator, ref_no, note,
  log_date, warehouse_code, location_code, quality_grade,
  company_code, sku_code, created_at
)
SELECT d.batch_no, 'TEMP_PRODUCTION_REVERSAL', -d.qty,
       'system:daily-egg-repair', d.source_no,
       '日报重复入库历史修复：冲销旧重复批次，保留原始流水追溯',
       d.egg_date, b.warehouse_code, b.location_code,
       COALESCE(b.grade_code_std, b.quality_grade),
       d.company_code, d.sku_code, NOW()
  FROM daily_egg_duplicate_repair d
  JOIN inv_batches b ON b.id = d.id
 WHERE NOT EXISTS (
   SELECT 1 FROM inv_ledger l
    WHERE l.batch_no = d.batch_no AND l.change_type = 'TEMP_PRODUCTION_REVERSAL'
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM inv_batches
     WHERE source_type = 'TEMP_PRODUCTION' AND source_no IS NOT NULL
     GROUP BY company_code, source_no,
              COALESCE(sku_code, ''),
              COALESCE(grade_code_std, quality_grade, ''),
              COALESCE(spec_code, packaging_spec, '')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'DAILY_EGG_REPAIR_DUPLICATES_REMAIN';
  END IF;
END $$;

COMMIT;
