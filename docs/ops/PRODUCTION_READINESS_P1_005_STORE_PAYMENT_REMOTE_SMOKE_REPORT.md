# Production Readiness P1-005 - Store Payment Remote Readiness Smoke Report

Date: 2026-06-24

Task ID: `PRD-P1-005`

Conclusion: `HOLD WITH CONDITIONS`

## Purpose

Run a read-only Store Payment runtime smoke against the currently reachable remote environment to determine whether Store Payment is ready for business UAT or production-grade use.

This smoke did not perform database writes, migrations, seed, cleanup, reset, deployment, restart, push, or business-code changes.

## Evidence Directory

`docs/ops/runs/production-readiness-p1-005-store-payment-remote-smoke-20260624-170743`

Evidence files:

- `context.txt`
- `public_http_smoke.txt`
- `public_http_retry.txt`
- `public_http_no_api_prefix_retry.txt`
- `remote_store_payment_readonly.sql`
- `remote_readonly_smoke.txt`
- `store_payment_page.html`

Secrets scan result: no password, token, key, or connection string was found in the evidence directory after redaction.

## Remote HTTP Smoke

| Check | Result | Evidence |
| --- | --- | --- |
| API health | `PASS` | `https://erp.eggslao.com/api/health` returned `200` with `env=production`, DB connected, `jwt_fallback_in_use=false`. |
| Web root | `PASS` | `/` returns `307` to `/login`. |
| Store Payment page | `PASS` | `/store-payment` returns `200` HTML. |
| Store Payment page raw references | `PASS` | Page HTML contains no `/uploads`, `rawUrl`, `storage_path`, `http://`, or `https://` string occurrences. |
| `/uploads/` public exposure | `PASS WITH CONDITIONS` | `/uploads/` returned `404`, not raw file listing. Earlier hardening expected `403`; the important production condition remains no public file exposure. |
| Store Payment accounts API without `/api` prefix | `PASS` | `/store-payment/accounts` returned `401 Unauthorized`, proving route exists and fails closed without auth. |
| Store Payment records API without `/api` prefix | `PASS` | `/store-payment/records` returned `401 Unauthorized`, proving route exists and fails closed without auth. |
| Store Payment attachment status without `/api` prefix | `PASS` | `/store-payment/attachments/FILE-NONEXISTENT/status` returned `401 Unauthorized`, proving auth is required before missing-file disclosure. |
| Store Payment APIs with `/api` prefix | `INFO` | `/api/store-payment/*` returned `404`; local frontend uses no-prefix Store Payment paths, so this is not a Store Payment runtime failure. |

## Remote Read-only DB Smoke

The SSH channel remains intermittently unstable. The first docker status probe timed out during banner exchange, but the subsequent read-only DB probe succeeded.

Read-only DB result:

| Check | Result |
| --- | --- |
| `store_payment_accounts` table | Exists |
| `store_payment_records` table | Exists |
| `file_metadata` table | Exists |
| `store_payment_accounts` row count | `0` |
| `store_payment_records` row count | `0` |
| Store Payment `file_metadata` row count | `0` |
| `MENU_STORE_PAYMENT_ACCOUNT` | Exists, count `1` |
| `MENU_STORE_PAYMENT` | Exists, count `1` |
| `MENU_STORE_PAYMENT_CONFIRM` | Exists, count `1` |
| `MENU_STORE_PAYMENT_VOID` | Exists, count `1` |
| `MENU_STORE_PAYMENT_EXPORT` | Exists, count `1` |
| Active `STORE-VTE-001` | Exists, count `1` |
| Active `COMP-LAO-AGRI` | Exists, count `1` |

## A1 Validation Summary

Conclusion: `PASS WITH CONDITIONS`

Passing:

1. API health is reachable and reports DB connected.
2. Store Payment page route is reachable.
3. Store Payment API routes fail closed with unauthenticated `401`.
4. No public raw upload link was found in the Store Payment page HTML.

Conditions:

1. SSH remains intermittently unstable and should not be used for high-throughput production operations.
2. Business UAT cannot be declared ready while Store Payment account, record, and file metadata counts are all `0`.
3. Authenticated role-specific smoke requires approved test-user credentials or a controlled UAT session; this report did not use or request credentials.

## A2 Security Summary

Conclusion: `PASS WITH CONDITIONS`

Passing:

1. Unauthenticated Store Payment protected routes return `401`.
2. Store Payment page does not expose raw URL, `/uploads`, or `storage_path` literals.
3. Public `/uploads/` did not expose raw files.

Conditions:

1. Authenticated RBAC/DataScope behavior still requires a credentialed smoke.
2. Protected preview/download for real Store Payment attachments cannot be proven because remote Store Payment `file_metadata` has `0` rows.
3. Keep business UAT HOLD until account/record/metadata fixture setup is explicitly approved and verified.

## A5 Data Readiness Summary

Conclusion: `HOLD WITH CONDITIONS`

Ready:

1. Store Payment schema tables exist.
2. `file_metadata` table exists.
3. Five `MENU_STORE_PAYMENT*` menu codes exist.
4. `STORE-VTE-001` exists and is active.
5. `COMP-LAO-AGRI` exists and is active.

Blocking:

1. `store_payment_accounts` row count is `0`.
2. `store_payment_records` row count is `0`.
3. Store Payment `file_metadata` row count is `0`.
4. There is no remote Store Payment QR/proof fixture to smoke protected preview/download.

## Business UAT Decision

Current decision: `HOLD`

Reason:

The runtime shell is present and secure enough at the unauthenticated boundary, but there is no Store Payment business data or attachment metadata in the remote target. Business users cannot execute the intended pilot flow until a dedicated, approved UAT fixture/data setup gate creates or synchronizes disabled/pending account rows, records if needed, and protected attachment metadata.

## Recommended Next Single Gate

`APPROVE_STORE_PAYMENT_REMOTE_UAT_FIXTURE_SETUP`

Scope should be narrow:

1. Create or synchronize Store Payment pilot account placeholder rows for `STORE-VTE-001 / COMP-LAO-AGRI`.
2. Add only approved protected Store Payment file metadata fixtures.
3. Do not create real payment records unless explicitly approved.
4. Do not enable production-wide access.
5. Re-run authenticated A1/A2/A5 smoke after fixture setup.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| Business code changed | No |
| Production DB write | No |
| Migration executed | No |
| Seed executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed | No |
| Production data cleanup/reset | No |

## Final Result

`PRD-P1-005` is not production-GO yet.

Status: `HOLD WITH CONDITIONS / RUNTIME SHELL VERIFIED`

The route, schema, menus, and fail-closed behavior are present. Data fixtures and authenticated business-flow verification remain required before Store Payment can enter remote business UAT.
