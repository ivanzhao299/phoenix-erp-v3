\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TEMP TABLE recon_map (target_code text PRIMARY KEY, source_code text UNIQUE NOT NULL, opening numeric(18,2) NOT NULL) ON COMMIT DROP;
INSERT INTO recon_map VALUES
 ('FH-101','WWH-FH-CASH-CNY',10370.00),('FH-102','WWH-FH-CASH-LAK',189515000.00),
 ('FH-10206','WWH-FH-SL-LDB-LAK',477477359.59),('FH-10207','WWH-FH-SL-BCEL-LAK',581213132.53),
 ('FH-10209','WWH-FH-LDB-LAK',880000.00),('FH-10210','WWH-FH-LDB-USD',94.60),
 ('FH-10211','WWH-FH-LDB-THB',1802.00),('FH-10212','WWH-FH-LDB-CNY',3958.79),
 ('DP-01','WWH-XC-CASH-CNY',244874.90),('DP-10','WWH-XC-LDB-LAK',10494389.06),
 ('DP-11','WWH-XC-BCEL-LAK',1924934.57);

-- Block concurrent transaction INSERT/UPDATE/DELETE until commit, preventing
-- phantoms after the approved 426-row business snapshot is fingerprinted.
LOCK TABLE fin_cash_transactions IN SHARE ROW EXCLUSIVE MODE;
SELECT a.id FROM fin_cash_accounts a JOIN recon_map m ON a.account_code IN (m.target_code,m.source_code) ORDER BY a.id FOR UPDATE;

CREATE TEMP TABLE before_accounts ON COMMIT DROP AS
 SELECT a.* FROM fin_cash_accounts a JOIN recon_map m ON m.target_code=a.account_code;
CREATE TEMP TABLE before_business_txns ON COMMIT DROP AS
 SELECT x.* FROM fin_cash_transactions x JOIN recon_map m ON m.target_code=x.account_code
 WHERE x.source_type IS DISTINCT FROM 'OPENING';
CREATE TEMP TABLE before_fingerprints ON COMMIT DROP AS SELECT
 (SELECT md5(string_agg(row_to_json(x)::text,E'\n' ORDER BY x.id)) FROM before_accounts x) account_hash,
 (SELECT md5(string_agg(row_to_json(x)::text,E'\n' ORDER BY x.id)) FROM before_business_txns x) business_txn_hash,
 (SELECT count(*) FROM before_business_txns) business_txn_count;

DO $$ DECLARE problems text; BEGIN
 SELECT string_agg(problem,E'\n') INTO problems FROM (
  SELECT 'mapping rows='||count(*)||', expected=11' problem FROM recon_map HAVING count(*)<>11
  UNION ALL SELECT 'mapped accounts='||count(*)||', expected=22' FROM fin_cash_accounts a JOIN
   (SELECT target_code code FROM recon_map UNION ALL SELECT source_code FROM recon_map) x ON x.code=a.account_code HAVING count(*)<>22
  UNION ALL SELECT 'source not INACTIVE: '||string_agg(s.account_code,',') FROM fin_cash_accounts s JOIN recon_map m ON m.source_code=s.account_code HAVING bool_or(s.status<>'INACTIVE')
  UNION ALL SELECT 'target not ACTIVE: '||string_agg(t.account_code,',') FROM fin_cash_accounts t JOIN recon_map m ON m.target_code=t.account_code HAVING bool_or(t.status<>'ACTIVE')
  UNION ALL SELECT 'company/currency mismatch: '||string_agg(m.target_code,',') FROM recon_map m JOIN fin_cash_accounts s ON s.account_code=m.source_code JOIN fin_cash_accounts t ON t.account_code=m.target_code WHERE (s.company_code,s.currency_code) IS DISTINCT FROM (t.company_code,t.currency_code) HAVING count(*)>0
  UNION ALL SELECT 'target certified opening mismatch: '||string_agg(t.account_code,',') FROM fin_cash_accounts t JOIN recon_map m ON m.target_code=t.account_code WHERE t.opening_balance<>m.opening HAVING count(*)>0
  UNION ALL SELECT 'source opening mismatch: '||string_agg(s.account_code,',') FROM fin_cash_accounts s JOIN recon_map m ON m.source_code=s.account_code WHERE s.opening_balance<>m.opening HAVING count(*)>0
  UNION ALL SELECT 'source has transactions: '||string_agg(m.source_code,',') FROM recon_map m WHERE EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.account_code=m.source_code) HAVING count(*)>0
  UNION ALL SELECT 'target business transaction count='||count(*)||', approved snapshot=426' FROM before_business_txns HAVING count(*)<>426
  UNION ALL SELECT 'existing OPENING: '||string_agg(m.target_code,',') FROM recon_map m WHERE EXISTS (SELECT 1 FROM fin_cash_transactions x WHERE x.account_code=m.target_code AND x.source_type='OPENING') HAVING count(*)>0
  UNION ALL SELECT 'pre-insert snapshot formula mismatch: '||string_agg(q.target_code,',') FROM (
   SELECT m.target_code,m.opening,a.current_balance,m.opening+coalesce(sum(CASE WHEN x.direction='IN' THEN x.amount ELSE -x.amount END),0) reconstructed
   FROM recon_map m JOIN fin_cash_accounts a ON a.account_code=m.target_code LEFT JOIN before_business_txns x ON x.account_code=m.target_code GROUP BY m.target_code,m.opening,a.current_balance
  ) q WHERE q.current_balance<>q.reconstructed HAVING count(*)>0
  UNION ALL SELECT 'pre-insert chain discontinuity: '||string_agg(account_code,',') FROM (
   SELECT x.account_code,x.balance_after,a.opening_balance+sum(CASE WHEN x.direction='IN' THEN x.amount ELSE -x.amount END) OVER (PARTITION BY x.account_code ORDER BY x.txn_date,x.id ROWS UNBOUNDED PRECEDING) expected
   FROM before_business_txns x JOIN fin_cash_accounts a ON a.account_code=x.account_code
  ) z WHERE z.balance_after<>z.expected HAVING count(*)>0
 ) failures;
 IF problems IS NOT NULL THEN RAISE EXCEPTION 'BAL_RECON_PREFLIGHT_FAILED:%',E'\n'||problems; END IF;
END $$;

\echo BAL_RECON_PREFLIGHT=PASS
SELECT 'BAL_RECON_LOCKED_SNAPSHOT' evidence,* FROM before_fingerprints;

INSERT INTO fin_cash_transactions
 (txn_no,account_id,account_code,account_name,company_code,company_name,direction,source_type,source_no,currency_code,amount,balance_after,txn_date,remark,created_by)
SELECT 'OPENING-BAL-RECON-20260904B-'||m.target_code,a.id,a.account_code,a.account_name,a.company_code,a.company_name,'IN',
 'OPENING','BAL-RECON-20260904B',a.currency_code,m.opening,m.opening,
 ((((min(x.txn_date) AT TIME ZONE 'Asia/Vientiane')::date-1)::timestamp) AT TIME ZONE 'Asia/Vientiane'),
 'governance_batch=BAL-RECON-20260904B;source_account='||m.source_code||';approval_ref=BAL-RECON-20260904B','BAL-RECON-20260904B'
FROM recon_map m JOIN fin_cash_accounts a ON a.account_code=m.target_code JOIN before_business_txns x ON x.account_code=m.target_code
GROUP BY m.target_code,m.source_code,m.opening,a.id,a.account_code,a.account_name,a.company_code,a.company_name,a.currency_code;

DO $$ DECLARE problems text; BEGIN
 SELECT string_agg(problem,E'\n') INTO problems FROM (
  SELECT 'formula diff: '||string_agg(q.account_code,',') problem FROM (
   SELECT a.account_code,a.current_balance-a.opening_balance-coalesce(sum(CASE WHEN x.source_type='OPENING' THEN 0 WHEN x.direction='IN' THEN x.amount ELSE -x.amount END),0) diff
   FROM fin_cash_accounts a JOIN recon_map m ON m.target_code=a.account_code LEFT JOIN fin_cash_transactions x ON x.account_code=a.account_code GROUP BY a.id
  ) q WHERE q.diff<>0 HAVING count(*)>0
  UNION ALL SELECT 'current/opening account snapshot changed: '||string_agg(a.account_code,',') FROM fin_cash_accounts a JOIN before_accounts b ON b.id=a.id WHERE row_to_json(a)::text<>row_to_json(b)::text HAVING count(*)>0
  UNION ALL SELECT 'business transaction snapshot/hash changed' WHERE
   (SELECT count(*) FROM fin_cash_transactions x JOIN recon_map m ON m.target_code=x.account_code WHERE x.source_type IS DISTINCT FROM 'OPENING')<>426 OR
   (SELECT md5(string_agg(row_to_json(x)::text,E'\n' ORDER BY x.id)) FROM fin_cash_transactions x JOIN recon_map m ON m.target_code=x.account_code WHERE x.source_type IS DISTINCT FROM 'OPENING') IS DISTINCT FROM (SELECT business_txn_hash FROM before_fingerprints)
  UNION ALL SELECT 'OPENING count invalid' WHERE (SELECT count(*) FROM fin_cash_transactions WHERE txn_no LIKE 'OPENING-BAL-RECON-20260904B-%')<>11
  UNION ALL SELECT 'unexpected target OPENING count' WHERE (SELECT count(*) FROM fin_cash_transactions x JOIN recon_map m ON m.target_code=x.account_code WHERE x.source_type='OPENING')<>11
  UNION ALL SELECT 'chain discontinuity: '||string_agg(account_code,',') FROM (
   SELECT x.account_code,x.balance_after,a.opening_balance+sum(CASE WHEN x.source_type='OPENING' THEN 0 WHEN x.direction='IN' THEN x.amount ELSE -x.amount END) OVER (PARTITION BY x.account_code ORDER BY x.txn_date,x.id ROWS UNBOUNDED PRECEDING) expected
   FROM fin_cash_transactions x JOIN fin_cash_accounts a ON a.account_code=x.account_code JOIN recon_map m ON m.target_code=x.account_code
  ) z WHERE z.balance_after<>z.expected HAVING count(*)>0
 ) failures;
 IF problems IS NOT NULL THEN RAISE EXCEPTION 'BAL_RECON_POSTCHECK_FAILED:%',E'\n'||problems; END IF;
END $$;

SELECT 'BAL_RECON_POSTCHECK=PASS accounts=11 business_txns=426 opening_inserted=11 snapshots_unchanged=true' result;
\if :{?BAL_RECON_COMMIT}
 \if :BAL_RECON_COMMIT
  COMMIT;
  \echo BAL_RECON_TRANSACTION=COMMITTED
 \else
  ROLLBACK;
  \echo BAL_RECON_TRANSACTION=ROLLED_BACK_REHEARSAL
 \endif
\else
 ROLLBACK;
 \echo BAL_RECON_TRANSACTION=ROLLED_BACK_REHEARSAL
\endif
