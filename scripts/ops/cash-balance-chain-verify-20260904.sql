\set ON_ERROR_STOP on
\pset pager off
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='60s';

SELECT account_code,opening_balance,current_balance,currency_code,status
FROM fin_cash_accounts
WHERE account_code IN ('CA-202608-00001','CA-202608-00002','CASH_CNY','DP-04','DP-10','FH-101')
ORDER BY account_code;

DO $$
DECLARE v_breaks integer; v_nan integer; v_formula integer;
BEGIN
  WITH chain AS (
    SELECT x.balance_after,a.opening_balance+sum(CASE WHEN x.source_type='OPENING' THEN 0 WHEN x.direction='IN' THEN x.amount ELSE -x.amount END)
      OVER(PARTITION BY x.account_code ORDER BY x.txn_date,x.id ROWS UNBOUNDED PRECEDING) expected
    FROM fin_cash_transactions x JOIN fin_cash_accounts a USING(account_code) WHERE a.status='ACTIVE'
  ) SELECT count(*) INTO v_breaks FROM chain WHERE balance_after<>expected;
  SELECT count(*) INTO v_nan FROM fin_cash_transactions WHERE amount='NaN'::numeric OR balance_after='NaN'::numeric;
  SELECT count(*) INTO v_formula FROM (
    SELECT a.id FROM fin_cash_accounts a LEFT JOIN fin_cash_transactions x USING(account_code)
    WHERE a.status='ACTIVE' GROUP BY a.id
    HAVING a.current_balance-a.opening_balance-coalesce(sum(CASE WHEN x.source_type='OPENING' THEN 0 WHEN x.direction='IN' THEN x.amount ELSE -x.amount END),0)<>0
  ) q;
  IF v_breaks<>0 OR v_nan<>0 OR v_formula<>0 THEN
    RAISE EXCEPTION 'VERIFY_FAIL breakpoints=% nan=% formula=%',v_breaks,v_nan,v_formula;
  END IF;
END $$;
ROLLBACK;
\echo 'PASS BAL_CHAIN_READONLY_VERIFY BREAKPOINTS=0 NAN=0 FORMULA_DIFF=0'
