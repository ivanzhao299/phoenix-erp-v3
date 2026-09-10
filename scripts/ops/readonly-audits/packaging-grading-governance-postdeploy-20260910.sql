-- Production post-deploy verification: packaging grading submission governance.
-- The controlled runner wraps this file in a read-only transaction.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM migrations
    WHERE name = 'GovernPackagingGradingSubmissions1789012800000'
  ) THEN
    RAISE EXCEPTION 'grading governance migration is not recorded';
  END IF;

  IF to_regclass('public.pkg_grading_source_links') IS NULL THEN
    RAISE EXCEPTION 'pkg_grading_source_links is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pkg_grading_records'
      AND column_name IN ('idempotency_key', 'payload_hash')
      AND is_nullable <> 'NO'
  ) OR (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pkg_grading_records'
      AND column_name IN ('idempotency_key', 'payload_hash')
      AND is_nullable = 'NO'
  ) <> 2 THEN
    RAISE EXCEPTION 'grading idempotency columns are missing or nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'pkg_grading_records'
      AND indexname = 'uq_pkg_grading_records_idempotency_key'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
  ) THEN
    RAISE EXCEPTION 'grading idempotency unique index is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pkg_source_batches psb
    LEFT JOIN (
      SELECT source_batch_id, SUM(input_qty)::int AS input_qty
      FROM pkg_grading_source_links
      GROUP BY source_batch_id
    ) linked ON linked.source_batch_id = psb.id
    WHERE GREATEST(
      COALESCE(NULLIF(psb.total_qty, 0), NULLIF(psb.received_qty, 0), 0)
      - COALESCE(psb.dirty_qty, 0)
      - COALESCE(psb.cracked_qty, 0)
      - COALESCE(linked.input_qty, 0),
      0
    ) < 0
  ) THEN
    RAISE EXCEPTION 'pending arithmetic produced a negative quantity';
  END IF;
END $$;

SELECT 'migration' AS check_name, name
FROM migrations
WHERE name = 'GovernPackagingGradingSubmissions1789012800000';

SELECT 'link_schema' AS check_name,
       COUNT(*)::int AS link_rows,
       COUNT(DISTINCT grading_id)::int AS linked_gradings,
       COALESCE(SUM(input_qty), 0)::int AS linked_input_qty
FROM pkg_grading_source_links;

SELECT ws.id AS open_shift_id,
       COUNT(psb.id) FILTER (
         WHERE GREATEST(
           COALESCE(NULLIF(psb.total_qty, 0), NULLIF(psb.received_qty, 0), 0)
           - COALESCE(psb.dirty_qty, 0)
           - COALESCE(psb.cracked_qty, 0)
           - COALESCE(linked.input_qty, 0), 0
         ) > 0
       )::int AS pending_source_batches
FROM pkg_work_shifts ws
LEFT JOIN pkg_source_batches psb ON psb.shift_id = ws.id
LEFT JOIN (
  SELECT source_batch_id, SUM(input_qty)::int AS input_qty
  FROM pkg_grading_source_links
  GROUP BY source_batch_id
) linked ON linked.source_batch_id = psb.id
WHERE ws.status = 'OPEN'
GROUP BY ws.id
ORDER BY ws.id;
