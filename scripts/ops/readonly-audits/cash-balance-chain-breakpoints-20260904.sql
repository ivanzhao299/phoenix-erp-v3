\set ON_ERROR_STOP on
\pset pager off

\echo '=== READ-ONLY GUARD ==='
SELECT current_setting('transaction_read_only') AS transaction_read_only,
       current_setting('default_transaction_read_only') AS default_transaction_read_only;

\echo '=== FORMULA AND PER-ACCOUNT SUMMARY ==='
WITH chain AS (
  SELECT
    x.id,
    x.account_code,
    a.currency_code,
    a.opening_balance,
    a.current_balance,
    x.txn_date,
    x.balance_after,
    row_number() OVER (
      PARTITION BY x.account_code ORDER BY x.txn_date, x.id
    ) AS chain_position,
    a.opening_balance
      + sum(CASE
          WHEN x.source_type = 'OPENING' THEN 0
          WHEN x.direction = 'IN' THEN x.amount
          ELSE -x.amount
        END) OVER (
          PARTITION BY x.account_code
          ORDER BY x.txn_date, x.id
          ROWS UNBOUNDED PRECEDING
        ) AS expected_balance_after,
    sum(CASE
        WHEN x.source_type = 'OPENING' THEN 0
        WHEN x.direction = 'IN' THEN x.amount
        ELSE -x.amount
      END) OVER (PARTITION BY x.account_code) AS signed_sum,
    count(*) OVER (PARTITION BY x.account_code) AS chain_rows
  FROM fin_cash_transactions x
  JOIN fin_cash_accounts a ON a.account_code = x.account_code
  WHERE a.status = 'ACTIVE'
), marked AS (
  SELECT *, balance_after <> expected_balance_after AS is_breakpoint
  FROM chain
), scoped AS (
  SELECT *,
    min(chain_position) FILTER (WHERE is_breakpoint)
      OVER (PARTITION BY account_code) AS first_break_position
  FROM marked
), account_summary AS (
  SELECT
    account_code,
    currency_code,
    max(opening_balance) AS opening_balance,
    max(signed_sum) AS signed_sum,
    max(current_balance) AS current_balance,
    count(*) AS complete_chain_rows,
    count(*) FILTER (WHERE is_breakpoint) AS breakpoint_rows,
    min(txn_date) FILTER (WHERE is_breakpoint) AS first_breakpoint_at,
    min(id) FILTER (WHERE chain_position = first_break_position) AS first_breakpoint_id,
    count(*) FILTER (WHERE chain_position >= first_break_position) AS rows_from_first_breakpoint,
    (array_agg(balance_after ORDER BY txn_date DESC, id DESC))[1] AS recorded_terminal_balance,
    (array_agg(expected_balance_after ORDER BY txn_date DESC, id DESC))[1] AS expected_terminal_balance
  FROM scoped
  WHERE first_break_position IS NOT NULL
  GROUP BY account_code, currency_code
)
SELECT
  account_code,
  currency_code,
  opening_balance,
  signed_sum,
  current_balance,
  current_balance - opening_balance - signed_sum AS terminal_formula_diff,
  complete_chain_rows,
  breakpoint_rows,
  first_breakpoint_at,
  first_breakpoint_id,
  rows_from_first_breakpoint,
  recorded_terminal_balance,
  expected_terminal_balance,
  recorded_terminal_balance - expected_terminal_balance AS terminal_chain_diff
FROM account_summary
ORDER BY account_code;

\echo '=== ALL 23 BREAKPOINTS (SENSITIVE REFERENCES HASHED) ==='
WITH chain AS (
  SELECT
    x.id,
    x.account_code,
    x.txn_date,
    x.created_at,
    x.direction,
    x.source_type,
    x.amount,
    x.balance_after,
    a.opening_balance
      + sum(CASE
          WHEN x.source_type = 'OPENING' THEN 0
          WHEN x.direction = 'IN' THEN x.amount
          ELSE -x.amount
        END) OVER (
          PARTITION BY x.account_code
          ORDER BY x.txn_date, x.id
          ROWS UNBOUNDED PRECEDING
        ) AS expected_balance_after,
    lag(x.balance_after) OVER (
      PARTITION BY x.account_code ORDER BY x.txn_date, x.id
    ) AS previous_recorded_balance,
    md5(x.txn_no) AS txn_ref_hash,
    CASE
      WHEN x.remark IS NULL OR btrim(x.remark) = '' THEN 'EMPTY'
      WHEN x.remark LIKE '%Excel%' THEN 'EXCEL_IMPORT'
      ELSE 'PRESENT_REDACTED'
    END AS remark_class
  FROM fin_cash_transactions x
  JOIN fin_cash_accounts a ON a.account_code = x.account_code
  WHERE a.status = 'ACTIVE'
)
SELECT
  account_code,
  id AS transaction_id,
  left(txn_ref_hash, 16) AS txn_ref_hash16,
  txn_date,
  created_at,
  direction,
  coalesce(source_type, 'NULL') AS source_type,
  amount,
  previous_recorded_balance,
  balance_after AS recorded_balance_after,
  expected_balance_after,
  balance_after - expected_balance_after AS chain_delta,
  remark_class
FROM chain
WHERE balance_after <> expected_balance_after
ORDER BY account_code, txn_date, id;

\echo '=== COMPLETE TAIL FROM EACH FIRST BREAKPOINT (SENSITIVE REFERENCES HASHED) ==='
WITH chain AS (
  SELECT
    x.id,
    x.account_code,
    x.txn_date,
    x.created_at,
    x.direction,
    x.source_type,
    x.amount,
    x.balance_after,
    row_number() OVER (
      PARTITION BY x.account_code ORDER BY x.txn_date, x.id
    ) AS chain_position,
    a.opening_balance
      + sum(CASE
          WHEN x.source_type = 'OPENING' THEN 0
          WHEN x.direction = 'IN' THEN x.amount
          ELSE -x.amount
        END) OVER (
          PARTITION BY x.account_code
          ORDER BY x.txn_date, x.id
          ROWS UNBOUNDED PRECEDING
        ) AS expected_balance_after,
    lag(x.balance_after) OVER (
      PARTITION BY x.account_code ORDER BY x.txn_date, x.id
    ) AS previous_recorded_balance,
    md5(x.txn_no) AS txn_ref_hash,
    CASE
      WHEN x.remark IS NULL OR btrim(x.remark) = '' THEN 'EMPTY'
      WHEN x.remark LIKE '%Excel%' THEN 'EXCEL_IMPORT'
      ELSE 'PRESENT_REDACTED'
    END AS remark_class
  FROM fin_cash_transactions x
  JOIN fin_cash_accounts a ON a.account_code = x.account_code
  WHERE a.status = 'ACTIVE'
), marked AS (
  SELECT *, balance_after <> expected_balance_after AS is_breakpoint
  FROM chain
), scoped AS (
  SELECT *,
    min(chain_position) FILTER (WHERE is_breakpoint)
      OVER (PARTITION BY account_code) AS first_break_position
  FROM marked
)
SELECT
  account_code,
  row_number() OVER (PARTITION BY account_code ORDER BY txn_date, id) AS tail_row_no,
  id AS transaction_id,
  left(txn_ref_hash, 16) AS txn_ref_hash16,
  txn_date,
  created_at,
  direction,
  coalesce(source_type, 'NULL') AS source_type,
  amount,
  previous_recorded_balance,
  balance_after AS recorded_balance_after,
  expected_balance_after,
  balance_after - expected_balance_after AS chain_delta,
  is_breakpoint,
  remark_class
FROM scoped
WHERE first_break_position IS NOT NULL
  AND chain_position >= first_break_position
ORDER BY account_code, txn_date, id;

\echo '=== HARD ASSERTIONS ==='
DO $$
DECLARE
  v_accounts integer;
  v_breakpoints integer;
  v_formula_differences integer;
BEGIN
  WITH chain AS (
    SELECT
      x.account_code,
      x.balance_after,
      a.current_balance,
      a.opening_balance,
      a.opening_balance
        + sum(CASE
            WHEN x.source_type = 'OPENING' THEN 0
            WHEN x.direction = 'IN' THEN x.amount
            ELSE -x.amount
          END) OVER (
            PARTITION BY x.account_code
            ORDER BY x.txn_date, x.id
            ROWS UNBOUNDED PRECEDING
          ) AS expected_balance_after,
      sum(CASE
          WHEN x.source_type = 'OPENING' THEN 0
          WHEN x.direction = 'IN' THEN x.amount
          ELSE -x.amount
        END) OVER (PARTITION BY x.account_code) AS signed_sum
    FROM fin_cash_transactions x
    JOIN fin_cash_accounts a ON a.account_code = x.account_code
    WHERE a.status = 'ACTIVE'
  ), broken AS (
    SELECT * FROM chain WHERE balance_after <> expected_balance_after
  )
  SELECT count(DISTINCT account_code), count(*)
    INTO v_accounts, v_breakpoints
  FROM broken;

  WITH ledger AS (
    SELECT
      a.account_code,
      a.current_balance - a.opening_balance
        - coalesce(sum(CASE
            WHEN x.source_type = 'OPENING' THEN 0
            WHEN x.direction = 'IN' THEN x.amount
            ELSE -x.amount
          END), 0) AS formula_diff
    FROM fin_cash_accounts a
    LEFT JOIN fin_cash_transactions x ON x.account_code = a.account_code
    WHERE a.status = 'ACTIVE'
    GROUP BY a.id
  )
  SELECT count(*) INTO v_formula_differences
  FROM ledger WHERE formula_diff <> 0;

  IF v_accounts <> 6 OR v_breakpoints <> 23 THEN
    RAISE EXCEPTION 'CHAIN_SCOPE_CHANGED accounts=% breakpoints=% expected=6/23',
      v_accounts, v_breakpoints;
  END IF;
  IF v_formula_differences <> 0 THEN
    RAISE EXCEPTION 'TERMINAL_FORMULA_NOT_CONVERGED differences=%',
      v_formula_differences;
  END IF;
END $$;

\echo 'PASS CHAIN_ACCOUNTS=6'
\echo 'PASS CHAIN_BREAKPOINTS=23'
\echo 'PASS ACTIVE_TERMINAL_FORMULA_DIFFERENCES=0'
\echo 'PASS AUDIT_SQL_DML_DDL=0'
