# R4.3 Controlled Transactional UAT Execution

- `LATEST_MAIN`: `098964f2d5221f7d4decfbf564b3c7f7a7328198`
- `UAT_RUN_ID`: `UAT-20261006-R4-6b0e3f`
- `TRANSACTIONAL_UAT_WRITE_AUTHORIZED`: `YES`
- `AUTHORIZED_SCOPE`: `R4.3_T01_TO_T05`
- `ACCOUNT`: `admin`
- `NO_APPLICATION_DEPLOY_REQUIRED`: `YES`

## Baseline

The production API health check returned `200`, `env=production`, and `db.connected=true`. A read-only baseline sweep covered 33 readable transaction/runtime endpoint categories. The full requested 148-table SELECT baseline was not independently available through the normal API surface, so this is recorded as a partial baseline rather than a claim that all 148 tables were verified. Procurement, sales, receipts, AR/AP, cash transactions/transfers, inventory batches/ledger, WMS inbound/outbound/transfer/stocktake, POS sales, store receiving/losses, workflow instances/tasks, and approval history/todos were zero. All 77 formal cash accounts satisfied `current_balance=opening_balance`; cash transaction count was zero. The legacy `pos_sessions` table is retired and returned `403 Forbidden Table`; it was recorded as an unsupported read check rather than treated as a business drift.

Chanjet current-state evidence returned `chanjetWrite=false`, `chanjetDelete=false`, `chanjetModify=false`, `voucherPush=false`, and `erpBusinessOverwrite=false`. No Chanjet write endpoint was called.

## Cases

| Case | Result | Evidence |
|---|---|---|
| T01 Procurement | `BLOCKED` | Created and verified PR `PR2-20261006-00001` (id `20`) with item id `21`; status remained `DRAFT`. The authenticated submit attempt returned HTTP `429`; a subsequent normal login retry also returned HTTP `429` with `retry-after-login: 779`. No status transition or downstream write was verified. |
| T02 Sales | `NOT_RUN` | Stopped after T01 P1 block. |
| T03 WMS | `NOT_RUN` | Stopped after T01 P1 block. |
| T04 Finance | `NOT_RUN` | Stopped after T01 P1 block. |
| T05 Workflow | `NOT_RUN` | Stopped after T01 P1 block. |

The created PR and its child item are fully mapped in the run manifest and cleanup graph. No automatic cleanup was attempted.

## Assertions

- `CREATED_ROOT_OBJECTS`: `1`
- `CREATED_TOTAL_TRACKED_OBJECTS`: `2`
- `UNATTRIBUTED_NEW_BUSINESS_ROWS`: `0` for the created UAT objects; full 148-table SQL baseline remains unverified through the normal API surface.
- `POST_UAT_BASELINE`: `NOT_RUN_RATE_LIMIT`; no downstream writes occurred after the T01 block, but a fresh authenticated read-only sweep is required.
- `INVENTORY_ASSERTION`: `PASS` for the readable pre-write endpoint subset; no UAT inventory movement created.
- `FINANCE_ASSERTION`: `PASS` for the readable pre-write cash invariant; no UAT finance movement created.
- `WORKFLOW_ASSERTION`: `NOT_RUN`
- `DATASCOPE_ASSERTION`: `PASS` on created PR company/project/warehouse references; downstream scope chain not run.
- `P0_DEFECTS`: `0`
- `P1_DEFECTS`: `1` operational block — production login rate limit prevented T01 continuation.
- `P2_DEFECTS`: `0`
- `CHANJET_REIMPORT_GUARD`: `PASS` based on live Chanjet guardrails; no external write was attempted.
- `IOT_ALERT_BUSINESS_REVIEW`: `PENDING`
- `TRANSACTIONAL_TECHNICAL_UAT`: `PARTIAL` (T01 blocked; full 148-table baseline unavailable)
- `HUMAN_BUSINESS_UAT`: `PENDING`
- `CLEANUP_MANIFEST_READY`: `YES` for the created PR root/child; downstream branches have no created objects.
- `CLEANUP_STATUS`: `NOT_STARTED`

## Next action

`PRODUCT_DEFECT_TRACK` for the production login rate-limit window, then resume the same run only after normal admin authentication succeeds. Do not create a new run ID and do not perform cleanup automatically.

## R4.3A rate-limit diagnosis

- `LOGIN_429_CLASSIFICATION`: `EXPECTED_SECURITY_THROTTLE`. The source config applies the production-only 15-minute/10-attempt bucket to `POST /api/auth/login`; one normal login after the window recovered with HTTP 200 and `/api/auth/me` returned HTTP 200 for `admin`.
- `PROCUREMENT_SUBMIT_429_ORIGIN`: `UNKNOWN`. The exact route is `POST /api/v2/procurement/requests/20/submit`; its controller has only `MenuGuard` and `DataScopeGuard`, and source review found no procurement `ThrottlerGuard`, `@Throttle`, custom limiter, queue limiter, or idempotency limiter. Repository Nginx config has no `limit_req`, `limit_conn`, `burst`, `nodelay`, or `429` directive; production proxy/WAF runtime remains unverified.
- `PROCUREMENT_APPLICATION_THROTTLER`: `NO`
- `PROXY_RATE_LIMIT_FOUND`: `NO_IN_REPO_CONFIG_RUNTIME_UNKNOWN`
- `FAILED_SUBMIT_PARTIAL_SIDE_EFFECT`: `NO`. A production `BEGIN READ ONLY` check confirmed PR `20` is still `DRAFT`, item `21` exists, and there are zero matching approval instances/steps/logs, notifications, orders, inventory, or finance facts.
- `AUTH_WINDOW_RECOVERY`: `PASS`
- `T01_RESUME_ALLOWED`: `NO`; the submit 429 origin is not understood and the single-submit rule forbids a retry yet.

The first submit response body/headers were not captured, so the submit 429 cannot be classified as Nest, proxy, WAF, re-auth, or another limiter from current evidence.

`EVIDENCE_MAIN_SHA=778f5f139a8319b15e694d4afdd5e57b8237c668`
