\set ON_ERROR_STOP on
\pset pager off

BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '30s';

-- Prevent phantom cash rows while the locked evidence set is exported and rebuilt.
LOCK TABLE fin_cash_transactions IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE expected_scope(account_code text PRIMARY KEY, first_breakpoint_id bigint NOT NULL) ON COMMIT DROP;
INSERT INTO expected_scope VALUES
  ('CA-202608-00001',505), ('CA-202608-00002',507), ('CASH_CNY',460),
  ('DP-04',512), ('DP-10',508), ('FH-101',218);

-- Lock the six accounts and their complete transaction collections in deterministic order.
SELECT a.id FROM fin_cash_accounts a JOIN expected_scope s USING (account_code) ORDER BY a.id FOR UPDATE OF a;
SELECT x.id FROM fin_cash_transactions x JOIN expected_scope s USING (account_code) ORDER BY x.id FOR UPDATE OF x;

CREATE TEMP TABLE accounts_before ON COMMIT DROP AS
SELECT a.*, md5(row_to_json(a)::text) AS row_md5
FROM fin_cash_accounts a JOIN expected_scope s USING (account_code);

CREATE TEMP TABLE chain_before ON COMMIT DROP AS
SELECT x.*,
       row_number() OVER (PARTITION BY x.account_code ORDER BY x.txn_date,x.id) AS chain_position,
       a.opening_balance + sum(CASE WHEN x.source_type='OPENING' THEN 0 WHEN x.direction='IN' THEN x.amount ELSE -x.amount END)
         OVER (PARTITION BY x.account_code ORDER BY x.txn_date,x.id ROWS UNBOUNDED PRECEDING) AS expected_balance_after
FROM fin_cash_transactions x
JOIN fin_cash_accounts a USING (account_code)
WHERE a.status='ACTIVE';

CREATE TEMP TABLE breakpoints_before ON COMMIT DROP AS
SELECT * FROM chain_before WHERE balance_after <> expected_balance_after;

CREATE TEMP TABLE target_tail_before ON COMMIT DROP AS
SELECT c.*,
       md5((row_to_json(c)::jsonb - 'balance_after' - 'expected_balance_after' - 'chain_position')::text) AS immutable_md5
FROM chain_before c
JOIN expected_scope s USING (account_code)
WHERE (c.txn_date,c.id) >= (
  SELECT b.txn_date,b.id FROM chain_before b WHERE b.id=s.first_breakpoint_id
);

CREATE TEMP TABLE other_transactions_before ON COMMIT DROP AS
SELECT x.id, md5(row_to_json(x)::text) AS row_md5
FROM fin_cash_transactions x
WHERE NOT EXISTS (SELECT 1 FROM target_tail_before t WHERE t.id=x.id);

DO $$
DECLARE
  v_active integer; v_accounts integer; v_breakpoints integer; v_nan integer;
  v_finite integer; v_tail integer; v_formula integer; v_bad_first integer;
BEGIN
  SELECT count(*) INTO v_active FROM fin_cash_accounts a JOIN expected_scope s USING(account_code) WHERE a.status='ACTIVE';
  SELECT count(DISTINCT account_code),count(*),count(*) FILTER (WHERE balance_after='NaN'::numeric),
         count(*) FILTER (WHERE balance_after<>'NaN'::numeric)
    INTO v_accounts,v_breakpoints,v_nan,v_finite FROM breakpoints_before;
  SELECT count(*) INTO v_tail FROM target_tail_before;
  SELECT count(*) INTO v_bad_first FROM expected_scope s
   WHERE NOT EXISTS (
     SELECT 1 FROM breakpoints_before b WHERE b.id=s.first_breakpoint_id
       AND NOT EXISTS (SELECT 1 FROM breakpoints_before p WHERE p.account_code=b.account_code AND (p.txn_date,p.id)<(b.txn_date,b.id))
   );
  SELECT count(*) INTO v_formula FROM (
    SELECT a.id FROM fin_cash_accounts a LEFT JOIN fin_cash_transactions x USING(account_code)
     WHERE a.status='ACTIVE' GROUP BY a.id
     HAVING a.current_balance-a.opening_balance-
       coalesce(sum(CASE WHEN x.source_type='OPENING' THEN 0 WHEN x.direction='IN' THEN x.amount ELSE -x.amount END),0) <> 0
  ) q;
  IF v_active<>6 OR v_accounts<>6 OR v_breakpoints<>23 OR v_nan<>21 OR v_finite<>2 OR v_tail<>29 OR v_formula<>0 OR v_bad_first<>0 THEN
    RAISE EXCEPTION 'BASELINE_MISMATCH active=% accounts=% breakpoints=% nan=% finite=% tail=% formula=% bad_first=%',
      v_active,v_accounts,v_breakpoints,v_nan,v_finite,v_tail,v_formula,v_bad_first;
  END IF;
END $$;

SELECT set_config('bal.accounts_csv', :'accounts_csv', true),
       set_config('bal.breakpoints_csv', :'breakpoints_csv', true),
       set_config('bal.tail_before_csv', :'tail_before_csv', true),
       set_config('bal.other_before_csv', :'other_before_csv', true),
       set_config('bal.rollback_body', :'rollback_body', true),
       set_config('bal.tail_after_csv', :'tail_after_csv', true),
       set_config('bal.other_after_csv', :'other_after_csv', true);
DO $$ BEGIN
  EXECUTE format('COPY (SELECT * FROM accounts_before ORDER BY account_code) TO %L CSV HEADER',current_setting('bal.accounts_csv'));
  EXECUTE format('COPY (SELECT * FROM breakpoints_before ORDER BY account_code,txn_date,id) TO %L CSV HEADER',current_setting('bal.breakpoints_csv'));
  EXECUTE format('COPY (SELECT * FROM target_tail_before ORDER BY account_code,txn_date,id) TO %L CSV HEADER',current_setting('bal.tail_before_csv'));
  EXECUTE format('COPY (SELECT x.* FROM fin_cash_transactions x JOIN other_transactions_before b USING(id) ORDER BY x.id) TO %L CSV HEADER',current_setting('bal.other_before_csv'));
  EXECUTE format($copy$COPY (SELECT format('UPDATE fin_cash_transactions SET balance_after=%%L::numeric WHERE id=%%L;',balance_after::text,id::text) FROM target_tail_before ORDER BY id) TO %L$copy$,current_setting('bal.rollback_body'));
END $$;

DO $$ DECLARE v_changed integer; v_unchanged integer; BEGIN
  SELECT count(*) FILTER (WHERE balance_after IS DISTINCT FROM expected_balance_after),
         count(*) FILTER (WHERE balance_after IS NOT DISTINCT FROM expected_balance_after)
    INTO v_changed,v_unchanged FROM target_tail_before;
  IF v_changed<>23 OR v_unchanged<>6 THEN RAISE EXCEPTION 'EXPECTED_23_CHANGED_6_UNCHANGED got=%/%',v_changed,v_unchanged; END IF;
END $$;

CREATE TEMP TABLE update_result ON COMMIT DROP AS
WITH updated AS (
  UPDATE fin_cash_transactions x SET balance_after=t.expected_balance_after
  FROM target_tail_before t WHERE x.id=t.id
  RETURNING x.id
) SELECT id FROM updated;

DO $$
DECLARE v_updated integer; v_target_breaks integer; v_active_breaks integer; v_nan integer;
  v_formula integer; v_account_drift integer; v_immutable_drift integer; v_other_drift integer;
BEGIN
  SELECT count(*) INTO v_updated FROM update_result;
  SELECT count(*) INTO v_target_breaks FROM fin_cash_transactions x JOIN target_tail_before t USING(id)
   WHERE x.balance_after IS DISTINCT FROM t.expected_balance_after;
  WITH chain AS (
    SELECT x.id,x.balance_after,a.opening_balance+sum(CASE WHEN x.source_type='OPENING' THEN 0 WHEN x.direction='IN' THEN x.amount ELSE -x.amount END)
      OVER(PARTITION BY x.account_code ORDER BY x.txn_date,x.id ROWS UNBOUNDED PRECEDING) expected
    FROM fin_cash_transactions x JOIN fin_cash_accounts a USING(account_code) WHERE a.status='ACTIVE'
  ) SELECT count(*) INTO v_active_breaks FROM chain WHERE balance_after<>expected;
  SELECT count(*) INTO v_nan FROM fin_cash_transactions WHERE amount='NaN'::numeric OR balance_after='NaN'::numeric;
  SELECT count(*) INTO v_formula FROM (
    SELECT a.id FROM fin_cash_accounts a LEFT JOIN fin_cash_transactions x USING(account_code)
     WHERE a.status='ACTIVE' GROUP BY a.id
     HAVING a.current_balance-a.opening_balance-
       coalesce(sum(CASE WHEN x.source_type='OPENING' THEN 0 WHEN x.direction='IN' THEN x.amount ELSE -x.amount END),0)<>0
  ) q;
  SELECT count(*) INTO v_account_drift FROM accounts_before b JOIN fin_cash_accounts a USING(id) WHERE b.row_md5<>md5(row_to_json(a)::text);
  SELECT count(*) INTO v_immutable_drift FROM target_tail_before b JOIN fin_cash_transactions x USING(id)
   WHERE b.immutable_md5<>md5((row_to_json(x)::jsonb-'balance_after')::text);
  SELECT count(*) INTO v_other_drift FROM other_transactions_before b FULL JOIN (
    SELECT x.* FROM fin_cash_transactions x
    WHERE NOT EXISTS (SELECT 1 FROM target_tail_before t WHERE t.id=x.id)
  ) x USING(id)
   WHERE b.id IS NULL OR x.id IS NULL OR b.row_md5<>md5(row_to_json(x)::text);
  IF v_updated<>29 OR v_target_breaks<>0 OR v_active_breaks<>0 OR v_nan<>0 OR v_formula<>0 OR
     v_account_drift<>0 OR v_immutable_drift<>0 OR v_other_drift<>0 THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL updated=% target_breaks=% active_breaks=% nan=% formula=% accounts=% immutable=% other=%',
      v_updated,v_target_breaks,v_active_breaks,v_nan,v_formula,v_account_drift,v_immutable_drift,v_other_drift;
  END IF;
END $$;

DO $$ BEGIN
  EXECUTE format('COPY (SELECT x.* FROM fin_cash_transactions x JOIN target_tail_before t USING(id) ORDER BY x.account_code,x.txn_date,x.id) TO %L CSV HEADER',current_setting('bal.tail_after_csv'));
  EXECUTE format('COPY (SELECT x.* FROM fin_cash_transactions x WHERE NOT EXISTS(SELECT 1 FROM target_tail_before t WHERE t.id=x.id) ORDER BY x.id) TO %L CSV HEADER',current_setting('bal.other_after_csv'));
END $$;

\if :BAL_CHAIN_COMMIT
COMMIT;
\echo 'PASS BAL_CHAIN_TRANSACTION=COMMIT'
\else
ROLLBACK;
\echo 'PASS BAL_CHAIN_TRANSACTION=ROLLBACK'
\endif
\echo 'PASS BAL_CHAIN_PREFLIGHT=6/23/21+2/29'
\echo 'PASS BAL_CHAIN_UPDATED=29 MATERIAL_CHANGED=23 UNCHANGED=6'
\echo 'PASS BAL_CHAIN_POSTCHECK=ALL_ACTIVE_BREAKPOINTS_0 NAN_0 FORMULA_DIFF_0 HASHES_UNCHANGED'
