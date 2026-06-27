-- Candidate only. Do not execute without APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_EXECUTION.
-- Scope: disabled/pending Store Payment pilot account placeholders for STORE-VTE-001 / COMP-LAO-AGRI.
-- Preconditions to verify immediately before execution:
--   1. mst_stores has active STORE-VTE-001 mapped to COMP-LAO-AGRI.
--   2. store_payment_accounts has no existing rows for these account_code values.
--   3. No Store Payment records depend on these candidate account codes.
--   4. User has approved production DB write for this exact SQL.
--
-- This package intentionally does not insert payment records and does not insert file_metadata.

BEGIN;

INSERT INTO store_payment_accounts (
  account_code,
  account_name,
  company_code,
  store_code,
  fin_cash_account_id,
  currency,
  payment_method,
  qr_attachment_id,
  status,
  is_active,
  remark,
  created_by,
  updated_by,
  created_at,
  updated_at
) VALUES
  (
    'SP-VTE-BCEL-LAK-PENDING',
    '万象直营店公司收款码占位-LAK',
    'COMP-LAO-AGRI',
    'STORE-VTE-001',
    NULL,
    'LAK',
    'QR_PENDING',
    NULL,
    'DISABLED',
    false,
    'P0-001 production readiness placeholder only. Pending finance confirmation, QR metadata, and protected attachment validation.',
    'codex-p0-001-plan',
    'codex-p0-001-plan',
    now(),
    now()
  ),
  (
    'SP-VTE-BCEL-CNY-PENDING',
    '万象直营店公司收款码占位-CNY',
    'COMP-LAO-AGRI',
    'STORE-VTE-001',
    NULL,
    'CNY',
    'QR_PENDING',
    NULL,
    'DISABLED',
    false,
    'P0-001 production readiness placeholder only. Pending finance confirmation, QR metadata, and protected attachment validation.',
    'codex-p0-001-plan',
    'codex-p0-001-plan',
    now(),
    now()
  ),
  (
    'SP-VTE-BCEL-USD-PENDING',
    '万象直营店公司收款码占位-USD',
    'COMP-LAO-AGRI',
    'STORE-VTE-001',
    NULL,
    'USD',
    'QR_PENDING',
    NULL,
    'DISABLED',
    false,
    'P0-001 production readiness placeholder only. Pending finance confirmation, QR metadata, and protected attachment validation.',
    'codex-p0-001-plan',
    'codex-p0-001-plan',
    now(),
    now()
  )
ON CONFLICT (company_code, store_code, account_code)
DO UPDATE SET
  account_name = EXCLUDED.account_name,
  fin_cash_account_id = NULL,
  currency = EXCLUDED.currency,
  payment_method = EXCLUDED.payment_method,
  qr_attachment_id = NULL,
  status = 'DISABLED',
  is_active = false,
  remark = EXCLUDED.remark,
  updated_by = EXCLUDED.updated_by,
  updated_at = now()
WHERE store_payment_accounts.status = 'DISABLED'
  AND store_payment_accounts.is_active = false
  AND NOT EXISTS (
    SELECT 1
    FROM store_payment_records r
    WHERE r.payment_account_id = store_payment_accounts.id
      AND r.deleted_at IS NULL
  );

COMMIT;
