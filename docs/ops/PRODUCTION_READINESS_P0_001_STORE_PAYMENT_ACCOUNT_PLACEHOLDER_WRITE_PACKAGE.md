# Production Readiness P0-001 - Store Payment Account Placeholder Write Package

Date: 2026-06-24

Task ID: `PRD-P0-001`

Conclusion: `READY_FOR_APPROVAL / EXECUTION HOLD`

## Purpose

Prepare the narrowest production DB write package for Store Payment pilot account readiness without executing it.

This package exists because read-only evidence repeatedly showed the production-side Store Payment schema and menu setup are present, but `store_payment_accounts` remains empty. Business UAT cannot proceed until at least disabled/pending pilot account placeholders exist or the business explicitly accepts a no-account UAT path.

## Boundary

This gate did not execute SQL and did not write production DB.

It only produced:

1. pre-execution read-only SQL;
2. candidate account-placeholder insert/upsert SQL;
3. rollback candidate SQL;
4. approval conditions.

## Evidence Directory

`docs/ops/runs/production-readiness-p0-001-account-placeholder-plan-20260624-172403`

Files:

- `context.txt`
- `store_payment_account_readiness_readonly.sql`
- `store_payment_account_readiness_readonly_result.txt`
- `store_payment_account_readiness_readonly_result_retry1.txt`
- `candidate_store_payment_account_placeholders.sql`
- `rollback_store_payment_account_placeholders.sql`

## Fresh Evidence Status

| Probe | Result |
| --- | --- |
| SSH short identity probe | `FAIL`: connection closed by remote port 22 |
| Base64 SQL transfer + read-only DB query | `FAIL`: SSH connection closed |
| Retry read-only DB query | `FAIL`: SSH connection closed |
| Candidate SQL generated | `PASS` |
| Rollback SQL generated | `PASS` |

Because SSH failed during this batch, this package relies on the latest successful read-only evidence from `PRODUCTION_READINESS_P0_001_INITIAL_DATA_REFRESH_REPORT.md` and `PRODUCTION_READINESS_P1_005_STORE_PAYMENT_REMOTE_SMOKE_REPORT.md`, both of which showed:

- `store_payment_accounts = 0`
- `store_payment_records = 0`
- Store Payment `file_metadata = 0`
- `STORE-VTE-001 / 万象直营店` active
- `COMP-LAO-AGRI` present
- `MENU_STORE_PAYMENT*` menu codes present

Execution must re-run the included read-only SQL immediately before any write.

## Candidate Rows

| account_code | company_code | store_code | currency | status | is_active | payment_method |
| --- | --- | --- | --- | --- | --- | --- |
| `SP-VTE-BCEL-LAK-PENDING` | `COMP-LAO-AGRI` | `STORE-VTE-001` | `LAK` | `DISABLED` | `false` | `QR_PENDING` |
| `SP-VTE-BCEL-CNY-PENDING` | `COMP-LAO-AGRI` | `STORE-VTE-001` | `CNY` | `DISABLED` | `false` | `QR_PENDING` |
| `SP-VTE-BCEL-USD-PENDING` | `COMP-LAO-AGRI` | `STORE-VTE-001` | `USD` | `DISABLED` | `false` | `QR_PENDING` |

These are placeholders only. They must not be treated as active finance accounts, confirmed bank accounts, or validated QR codes.

## Candidate SQL

`docs/ops/runs/production-readiness-p0-001-account-placeholder-plan-20260624-172403/candidate_store_payment_account_placeholders.sql`

Safety properties:

1. inserts only `store_payment_accounts`;
2. uses `status='DISABLED'`;
3. uses `is_active=false`;
4. does not insert `store_payment_records`;
5. does not insert `file_metadata`;
6. does not set `qr_attachment_id`;
7. does not reference a real `fin_cash_account_id`;
8. upsert updates only when an existing row is still disabled/inactive and has no dependent records.

## Rollback SQL

`docs/ops/runs/production-readiness-p0-001-account-placeholder-plan-20260624-172403/rollback_store_payment_account_placeholders.sql`

Rollback deletes only unused disabled placeholder rows for the three exact candidate `account_code` values. It refuses to delete rows that have Store Payment records.

## Required Approval

Before execution, the user must approve:

`APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_EXECUTION`

Approved scope must explicitly allow:

1. production DB write to `store_payment_accounts`;
2. only three disabled/inactive placeholder rows listed above;
3. no payment records;
4. no file metadata;
5. no menu/role changes;
6. no migration;
7. no deployment;
8. rollback SQL retained and reviewed.

## Required Precheck Immediately Before Execution

1. Re-run `store_payment_account_readiness_readonly.sql`.
2. Confirm `STORE-VTE-001` is active and maps to `COMP-LAO-AGRI`.
3. Confirm `store_payment_accounts` has no conflicting active rows.
4. Confirm `store_payment_records` has no dependency on candidate accounts.
5. Confirm Store Payment menu grants are still present.
6. Confirm A2 accepts disabled placeholder write risk.
7. Confirm A1 W5 gate is PASS.

## A2 Security Review

Conclusion: `PASS WITH CONDITIONS`

Passing:

1. Candidate rows are disabled and inactive.
2. Candidate rows do not create finance collection authority.
3. Candidate rows do not attach QR files or expose attachment links.
4. Candidate rows do not create payment records.

Conditions:

1. Execution requires fresh read-only evidence because this batch's SSH probes failed.
2. Finance must later confirm real account and QR details before activation.
3. Activation must be a separate Gate.

## A1 Validation

Conclusion: `PASS WITH CONDITIONS`

Passing:

1. SQL package is docs/runs only.
2. No DB write was executed.
3. Candidate and rollback SQL are explicit and scoped.

Condition:

1. W5 closeout must pass before this package is committed.

## Final Result

`PRD-P0-001` is `READY_FOR_APPROVAL / EXECUTION HOLD`.

The next user decision is whether to approve `APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_EXECUTION`. Without that approval, this package must remain unexecuted.
