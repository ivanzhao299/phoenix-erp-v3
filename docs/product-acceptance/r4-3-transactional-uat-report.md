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
