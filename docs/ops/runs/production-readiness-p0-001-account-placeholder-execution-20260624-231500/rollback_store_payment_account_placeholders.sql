-- Rollback candidate only. Do not execute without explicit rollback approval.
-- Scope: remove only unused disabled placeholders created by candidate_store_payment_account_placeholders.sql.

BEGIN;

DELETE FROM store_payment_accounts a
WHERE a.company_code = 'COMP-LAO-AGRI'
  AND a.store_code = 'STORE-VTE-001'
  AND a.account_code IN (
    'SP-VTE-BCEL-LAK-PENDING',
    'SP-VTE-BCEL-CNY-PENDING',
    'SP-VTE-BCEL-USD-PENDING'
  )
  AND a.status = 'DISABLED'
  AND a.is_active = false
  AND a.qr_attachment_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM store_payment_records r
    WHERE r.payment_account_id = a.id
      AND r.deleted_at IS NULL
  );

COMMIT;
