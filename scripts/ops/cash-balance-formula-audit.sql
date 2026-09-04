\set ON_ERROR_STOP on

WITH ledger AS (
  SELECT a.id,a.account_code,a.status,a.remark,a.opening_balance,a.current_balance,
    count(x.id) FILTER (WHERE x.source_type IS DISTINCT FROM 'OPENING') business_txns,
    coalesce(sum(CASE WHEN x.source_type='OPENING' THEN 0 WHEN x.direction='IN' THEN x.amount ELSE -x.amount END),0) signed_sum
  FROM fin_cash_accounts a LEFT JOIN fin_cash_transactions x ON x.account_code=a.account_code
  GROUP BY a.id
), classified AS (
  SELECT *, current_balance-opening_balance-signed_sum diff,
    status='INACTIVE' AND remark LIKE '%[G45 已并入刘杰主档(FH-/DP-)，停用]%' AS retired_g45_duplicate
  FROM ledger
)
SELECT account_code,status,opening_balance,signed_sum,current_balance,diff,
  CASE WHEN retired_g45_duplicate THEN 'EXCLUDED_RETIRED_G45_DUPLICATE' ELSE 'IN_SCOPE' END audit_scope
FROM classified ORDER BY id;

WITH ledger AS (
  SELECT a.id,a.account_code,a.status,a.remark,a.opening_balance,a.current_balance,
    coalesce(sum(CASE WHEN x.source_type='OPENING' THEN 0 WHEN x.direction='IN' THEN x.amount ELSE -x.amount END),0) signed_sum
  FROM fin_cash_accounts a LEFT JOIN fin_cash_transactions x ON x.account_code=a.account_code GROUP BY a.id
), classified AS (
  SELECT *, current_balance-opening_balance-signed_sum diff,
    status='INACTIVE' AND remark LIKE '%[G45 已并入刘杰主档(FH-/DP-)，停用]%' AS retired_g45_duplicate
  FROM ledger
)
SELECT count(*) FILTER (WHERE status='ACTIVE') active_accounts,
       count(*) FILTER (WHERE status='ACTIVE' AND diff<>0) active_differences,
       count(*) FILTER (WHERE retired_g45_duplicate) retired_g45_excluded,
       count(*) FILTER (WHERE status<>'ACTIVE' AND NOT retired_g45_duplicate AND diff<>0) unexplained_inactive_differences
FROM classified;

DO $$
DECLARE bad text;
BEGIN
  WITH ledger AS (
    SELECT a.account_code,a.status,a.remark,a.opening_balance,a.current_balance,
      coalesce(sum(CASE WHEN x.source_type='OPENING' THEN 0 WHEN x.direction='IN' THEN x.amount ELSE -x.amount END),0) signed_sum
    FROM fin_cash_accounts a LEFT JOIN fin_cash_transactions x ON x.account_code=a.account_code GROUP BY a.id
  )
  SELECT string_agg(account_code, ',') INTO bad FROM ledger
  WHERE current_balance-opening_balance-signed_sum<>0
    AND NOT (status='INACTIVE' AND remark LIKE '%[G45 已并入刘杰主档(FH-/DP-)，停用]%');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CASH_BALANCE_FORMULA_AUDIT_FAILED accounts=%',bad; END IF;

  WITH expected(account_code,balance) AS (VALUES
    ('FH-101',10370.00::numeric),('FH-102',314625000.00),('FH-10206',157387359.59),
    ('FH-10207',279843132.53),('FH-10209',856000.00),('FH-10210',91.00),
    ('FH-10211',2626.00),('FH-10212',57898.79),('DP-01',213119.40),
    ('DP-10',205889.06),('DP-11',2623934.57)
  )
  SELECT string_agg(e.account_code, ',') INTO bad
  FROM expected e LEFT JOIN fin_cash_accounts a ON a.account_code=e.account_code
  WHERE a.current_balance IS DISTINCT FROM e.balance;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CASH_BALANCE_LOOKUP_SNAPSHOT_CHANGED accounts=%',bad; END IF;
END $$;
\echo CASH_BALANCE_FORMULA_AUDIT=PASS
\echo CASH_BALANCE_LOOKUP_SNAPSHOT=UNCHANGED
