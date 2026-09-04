\set ON_ERROR_STOP on
WITH targets(code) AS (VALUES ('FH-101'),('FH-102'),('FH-10206'),('FH-10207'),('FH-10209'),('FH-10210'),('FH-10211'),('FH-10212'),('DP-01'),('DP-10'),('DP-11'))
SELECT a.account_code,a.opening_balance,a.updated_at,a.updated_by
FROM fin_cash_accounts a JOIN targets t ON t.code=a.account_code ORDER BY a.account_code;

WITH target_accounts AS (
 SELECT id FROM fin_cash_accounts WHERE account_code IN ('FH-101','FH-102','FH-10206','FH-10207','FH-10209','FH-10210','FH-10211','FH-10212','DP-01','DP-10','DP-11')
)
SELECT l.id,l.created_at,l.user_id,l.username,l.role_code,l.module_code,l.action_code,l.biz_type,l.biz_id,l.biz_no,l.request_method,l.request_path,l.result_status,l.before_data,l.after_data
FROM sys_operation_logs l
WHERE l.created_at>=TIMESTAMPTZ '2026-06-08 00:00:00+00' AND (
 (l.biz_id IN (SELECT id FROM target_accounts) AND lower(coalesce(l.biz_type,'')) IN ('fin_cash_accounts','fin_cash_account','cash_account'))
 OR l.request_path LIKE '%/finance/cash/accounts/%'
 OR l.before_data::text ~ 'FH-101|FH-102|DP-01|DP-10|DP-11'
 OR l.after_data::text ~ 'FH-101|FH-102|DP-01|DP-10|DP-11')
ORDER BY l.created_at,l.id;
\echo CASH_OPENING_WRITE_TRACE=PASS
