# Production Readiness P1-005 - Store Payment Remote Readiness Smoke Refresh Report

Date: 2026-06-25

Task ID: `PRD-P1-005`

## Purpose

Refresh the Store Payment remote readiness smoke after `PRD-P0-001` inserted three disabled/inactive pilot account placeholders.

This run was read-only. It did not write DB, execute migration, seed, deploy, restart, push, cleanup, reset, or change business code.

## Evidence Directory

`docs/ops/runs/production-readiness-p1-005-store-payment-remote-smoke-refresh-20260625-090139`

Key evidence:

- `public_http_smoke.txt`
- `remote_db_counts.txt`

## Public HTTP Smoke

| Check | Result | Evidence |
| --- | --- | --- |
| API health | `PASS` | `/api/health` returned `status=OK`, `env=production`, DB connected, JWT fallback disabled. |
| `/store-payment` anonymous page access | `PASS` | Returns `307` to `/login?return=%2Fstore-payment`. |
| `/store-payment/accounts` anonymous access | `PASS` | Returns `307` to login. |
| `/store-payment/records` anonymous access | `PASS` | Returns `307` to login. |
| `/store-payment/attachments/.../status` anonymous access | `PASS` | Returns `307` to login before disclosing missing file state. |
| `/uploads/` public exposure | `PASS_WITH_CONDITIONS` | Returns `404`, no raw directory listing. |

## Remote DB Read-Only Smoke

| Check | Result |
| --- | --- |
| `store_payment_accounts` | `3` |
| active Store Payment accounts | `0` |
| disabled Store Payment accounts | `3` |
| `store_payment_records` | `0` |
| Store Payment `file_metadata` rows | `0` |
| Store Payment menus | `5` |
| Store Payment role-menu grants | `11` |

## Interpretation

The previous blocker "`store_payment_accounts = 0`" has been cleared by the approved P0-001 placeholder execution.

Current readiness:

1. Store Payment route exists and fails closed to login for anonymous users.
2. Store Payment schema exists.
3. Store Payment menu and grants exist.
4. Pilot placeholder accounts exist.
5. No active financial collection account exists yet.
6. No payment records exist.
7. No Store Payment file metadata exists.
8. Authenticated role-specific smoke still requires test-user credentials or an approved controlled UAT session.

## A1 Validation

Conclusion: `PASS_WITH_CONDITIONS`.

Passing:

1. Public health is OK.
2. Anonymous route access fails closed through login redirects.
3. Read-only DB counts confirm the placeholder account write outcome.

Conditions:

1. Authenticated route smoke remains pending.
2. W5 closeout must pass before commit.

## A2 Security Review

Conclusion: `PASS_WITH_CONDITIONS`.

Passing:

1. Anonymous Store Payment account, record, and attachment routes do not expose data.
2. No raw `/uploads` listing is exposed.
3. Placeholder accounts are disabled and inactive.

Conditions:

1. Authenticated RBAC/DataScope smoke is still needed.
2. Store Payment protected attachment preview/download cannot be proven remotely because there is no Store Payment `file_metadata` row.

## A5 Data Readiness

Conclusion: `GO_WITH_CONDITIONS`.

Ready:

1. Pilot store/company baseline is already proven from P0-001 precheck.
2. Menus and role-menu grants exist.
3. Disabled/inactive account placeholders now exist.

Still missing:

1. Real finance-confirmed account activation.
2. QR file metadata.
3. Payment-record UAT fixture or real controlled UAT record.
4. Authenticated business-user UAT smoke.

## Business UAT Decision

Current decision: `HOLD_WITH_PROGRESS`.

The account-list prerequisite is no longer empty, but full business UAT should not start until at least one of the following is approved:

1. authenticated Store Payment UAT smoke using approved test users; or
2. QR file metadata fixture setup; or
3. finance-confirmed account activation Gate.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| Business code changed | No |
| Production DB write | No |
| Migration executed | No |
| Seed executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed by smoke | No |
| Production data cleanup/reset | No |

## Current Conclusion

`GO_WITH_CONDITIONS / BUSINESS_UAT_STILL_HOLD`

`PRD-P1-005` has improved from the previous all-empty Store Payment data state. It is not final UAT GO because authenticated smoke, real account activation, payment records, and Store Payment file metadata remain pending.
