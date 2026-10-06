-- PHOENIX ERP V3 — Chanjet reimport guard (read-only postcheck)
-- Required variable: -v RESET_EPOCH='YYYY-MM-DD HH24:MI:SS+TZ'
\set ON_ERROR_STOP on
\if :{?RESET_EPOCH}
\else
  \echo 'RESET_EPOCH is required'
  \quit 2
\endif

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';

SELECT current_database() AS target_database,
       current_setting('server_version') AS server_version,
       :'RESET_EPOCH'::timestamptz AS reset_epoch;

SELECT 'chanjet_sync_jobs' AS table_name,
       count(*)::bigint AS new_rows
FROM public.chanjet_sync_jobs
WHERE created_at >= :'RESET_EPOCH'::timestamptz;

SELECT 'chanjet_read_snapshots' AS table_name,
       count(*)::bigint AS new_rows
FROM public.chanjet_read_snapshots
WHERE pulled_at >= :'RESET_EPOCH'::timestamptz;

SELECT 'chanjet_entity_snapshots' AS table_name,
       count(*)::bigint AS new_rows
FROM public.chanjet_entity_snapshots
WHERE created_at >= :'RESET_EPOCH'::timestamptz;

SELECT 'chanjet_ar_snapshot' AS table_name,
       count(*)::bigint AS new_rows
FROM public.chanjet_ar_snapshot
WHERE synced_at >= :'RESET_EPOCH'::timestamptz;

SELECT 'chanjet_reconciliation_results' AS table_name,
       count(*)::bigint AS new_rows
FROM public.chanjet_reconciliation_results
WHERE created_at >= :'RESET_EPOCH'::timestamptz;

SELECT 'chanjet_erp_inbound_sync_runs' AS table_name,
       count(*)::bigint AS new_rows
FROM public.chanjet_erp_inbound_sync_runs
WHERE created_at >= :'RESET_EPOCH'::timestamptz;

SELECT 'chanjet_shareholder_accounting_balances' AS table_name,
       count(*)::bigint AS new_rows
FROM public.chanjet_shareholder_accounting_balances
WHERE created_at >= :'RESET_EPOCH'::timestamptz;

SELECT 'chanjet_wms_promotion_candidates' AS table_name,
       count(*)::bigint AS new_rows
FROM public.chanjet_wms_promotion_candidates
WHERE created_at >= :'RESET_EPOCH'::timestamptz;

SELECT 'chanjet_writeback_outbox_pending' AS check_name,
       count(*)::bigint AS pending_rows
FROM public.chanjet_writeback_outbox
WHERE state IN ('PENDING','QUEUED','RETRYING');

SELECT 'chanjet_wms_writeback_outbox_pending' AS check_name,
       count(*)::bigint AS pending_rows
FROM public.chanjet_wms_writeback_outbox
WHERE state IN ('PENDING','QUEUED','RETRYING');

ROLLBACK;
