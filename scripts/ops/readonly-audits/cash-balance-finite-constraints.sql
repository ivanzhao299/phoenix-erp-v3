-- Stage 3 production verification. The wrapper enforces a read-only transaction.

DO $$
DECLARE
  invalid_constraints integer;
  nan_rows integer;
  active_breaks integer;
  active_formula_diffs integer;
  account_lookup_diffs integer;
BEGIN
  SELECT 4 - COUNT(*) INTO invalid_constraints
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE (t.relname, c.conname) IN (
     ('fin_cash_transactions', 'chk_fin_cash_txn_amount_finite'),
     ('fin_cash_transactions', 'chk_fin_cash_txn_balance_after_finite'),
     ('fin_cash_accounts', 'chk_fin_cash_acc_opening_balance_finite'),
     ('fin_cash_accounts', 'chk_fin_cash_acc_current_balance_finite')
   ) AND c.contype = 'c' AND c.convalidated;

  SELECT
    (SELECT COUNT(*) FROM fin_cash_transactions WHERE amount = 'NaN'::numeric OR balance_after = 'NaN'::numeric)
    + (SELECT COUNT(*) FROM fin_cash_accounts WHERE opening_balance = 'NaN'::numeric OR current_balance = 'NaN'::numeric)
    INTO nan_rows;

  WITH chain AS (
    SELECT t.id, t.account_code, t.balance_after,
           a.opening_balance
             + SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END)
               OVER (PARTITION BY t.account_code ORDER BY t.txn_date, t.id) AS expected_balance
      FROM fin_cash_transactions t
      JOIN fin_cash_accounts a ON a.account_code = t.account_code
     WHERE a.status = 'ACTIVE'
  )
  SELECT COUNT(*) INTO active_breaks FROM chain WHERE balance_after IS DISTINCT FROM expected_balance;

  SELECT COUNT(*) INTO active_formula_diffs
    FROM fin_cash_accounts a
   WHERE a.status = 'ACTIVE'
     AND a.current_balance IS DISTINCT FROM
       a.opening_balance + COALESCE((
         SELECT SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END)
           FROM fin_cash_transactions t WHERE t.account_code = a.account_code
       ), 0);

  WITH expected(account_code, opening_balance, current_balance) AS (VALUES
    ('CA-202608-00001', 1000.00::numeric, 1500.00::numeric),
    ('CA-202608-00002', 2000.00::numeric, 2160.00::numeric),
    ('CASH_CNY', 1.00::numeric, 0.00::numeric),
    ('DP-04', 0.00::numeric, 0.00::numeric),
    ('DP-10', 10494389.06::numeric, 238947375.06::numeric),
    ('FH-101', 10370.00::numeric, 3512.00::numeric)
  )
  SELECT COUNT(*) INTO account_lookup_diffs
    FROM expected e
    FULL JOIN (
      SELECT * FROM fin_cash_accounts
       WHERE status = 'ACTIVE'
         AND account_code IN ('CA-202608-00001', 'CA-202608-00002', 'CASH_CNY', 'DP-04', 'DP-10', 'FH-101')
    ) a ON a.account_code = e.account_code
   WHERE e.account_code IS NULL OR a.account_code IS NULL
      OR a.opening_balance IS DISTINCT FROM e.opening_balance
      OR a.current_balance IS DISTINCT FROM e.current_balance;

  IF invalid_constraints <> 0 OR nan_rows <> 0 OR active_breaks <> 0
     OR active_formula_diffs <> 0 OR account_lookup_diffs <> 0 THEN
    RAISE EXCEPTION 'cash finite audit failed: constraints=% nan=% breaks=% formula=% lookup=%',
      invalid_constraints, nan_rows, active_breaks, active_formula_diffs, account_lookup_diffs;
  END IF;
END $$;

SELECT 'CASH_BALANCE_FINITE_ASSERTIONS' AS section,
       'PASS' AS result,
       4 AS valid_constraints,
       0 AS numeric_nan_rows,
       0 AS active_chain_breakpoints,
       0 AS active_formula_differences,
       0 AS stage2_account_lookup_differences;

SELECT account_code, opening_balance, current_balance
  FROM fin_cash_accounts
 WHERE account_code IN ('CA-202608-00001', 'CA-202608-00002', 'CASH_CNY', 'DP-04', 'DP-10', 'FH-101')
 ORDER BY account_code;
