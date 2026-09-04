SELECT 'CASH_ACCOUNT_LEDGER_MISMATCH' AS section, COUNT(*)::int AS mismatch_count
FROM fin_cash_accounts a
WHERE ROUND(a.current_balance::numeric, 2) <> ROUND((
  a.opening_balance::numeric + COALESCE((
    SELECT SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END)
    FROM fin_cash_transactions t
    WHERE t.account_code = a.account_code AND t.source_type <> 'OPENING'
  ), 0)
), 2);

DO $$
DECLARE mismatch_count integer;
DECLARE error_count integer;
BEGIN
  SELECT COUNT(*)::int INTO mismatch_count
  FROM fin_cash_accounts a
  WHERE ROUND(a.current_balance::numeric, 2) <> ROUND((
    a.opening_balance::numeric + COALESCE((
      SELECT SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END)
      FROM fin_cash_transactions t
      WHERE t.account_code = a.account_code AND t.source_type <> 'OPENING'
    ), 0)
  ), 2);
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'cash account authoritative balance mismatches: %', mismatch_count;
  END IF;

  SELECT COUNT(*)::int INTO error_count
  FROM sys_error_logs
  WHERE created_at >= NOW() - INTERVAL '60 minutes'
    AND regexp_replace(COALESCE(request_path, ''), '\?.*$', '') IN (
      '/api/lookup/cash-accounts', '/api/lookup/batches'
    );
  IF error_count <> 0 THEN
    RAISE EXCEPTION 'cash/batch lookup error window is not zero: %', error_count;
  END IF;
END $$;

