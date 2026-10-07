# R4.3 Controlled Transactional UAT — R4.4 Cleanup Closeout

- `LATEST_MAIN`: `4af74f1a8c85d44f56dacbeb3934ad9afeb94a72` (R4.4 closeout merged; archive verification snapshot)
- `CLOSEOUT_PR`: [#358 — R4.4 POST-R3 TEST DATA CLEANUP CLOSEOUT](https://github.com/ivanzhao299/phoenix-erp-v3/pull/358), merged `2026-10-06T09:53:04Z`
- `R3_RESET_EPOCH`: `2026-10-06T13:33:09+08:00`
- `UAT_RUN_ID`: `UAT-20261006-R4-6b0e3f`
- `POST_R3_INCREMENTAL_TEST_DATA_CLEANUP_AUTHORIZED`: `YES`
- `TRANSACTIONAL_UAT_WRITE_AUTHORIZED`: `YES` (historical R4.3 authorization; no further business writes)
- `ACCOUNT`: `admin`
- `AUTOMATED_TRANSACTIONAL_UAT`: `STOPPED`
- `NEXT_ACTION`: `HUMAN_PRODUCT_ACCEPTANCE`

## R4.3 execution disposition

The user stopped automated transactional UAT. T01 created only the existing purchase request `PR2-20261006-00001` (id `20`) and item id `21`; the single submit attempt returned HTTP 429. The rate-limit observation remains `UNKNOWN` and is recorded as `DEFERRED_UNRESOLVED_OBSERVATION`. No submit retry, second purchase request, rate-limit configuration change, proxy bypass, or application cancellation was performed. No active rate-limit product-fix track is open.

| Case | Final result |
|---|---|
| T01 Procurement | `ABORTED_AND_CLEANED` |
| T02 Sales | `NOT_RUN` |
| T03 WMS | `NOT_RUN` |
| T04 Finance | `NOT_RUN` |
| T05 Workflow | `NOT_RUN` |

## R4.4 incremental cleanup

The merged maintenance contract is [post-r3-incremental-test-data-cleanup.sql](../../scripts/uat/post-r3-incremental-test-data-cleanup.sql). It is derived from the production-verified R3 child-before-parent order and requires explicit `PRODUCTION_INCREMENTAL_CLEANUP_AUTHORIZED=true` for commit. Its default mode is a rollback dry-run. Static safety checks passed, including the 148-table scope, no master/archive deletes, no `sys_cron_heartbeat` mutation, strict preservation of approved `SYSTEM_ALERT/SYS_ALERT` notifications, no `sys_alerts` mutation, no destructive session/trigger/DDL bypass, and approved derived-state update targets only.

The read-only pre-cleanup inventory found three post-R3 cleanup rows: `prc2_request_items.id=21`, `prc2_purchase_requests.id=20`, and one business `WORKFLOW_TASK` notification (`sys_notifications.id=222520`). The dry-run passed with `WOULD_DELETE_ROWS=3`; the merged contract then committed exactly three deletes. The corrected child table name is `prc2_request_items`.

A fresh custom-format backup was taken while API and Web writers were stopped:

- Path: `/home/phoenix-codex-deploy/post-r3-test-cleanup-evidence/20261006T170333+0800/phoenix_erp_post_r3_precleanup.dump`
- Size: `194513276` bytes
- TOC: `2941` entries
- SHA-256: `ac1b15592aa591fa6150f57e51a16da8471840ce3facba93ead1f418e1b2902f`

Post-commit read-only evidence passed:

- PR 20: absent; item 21: absent; UAT run business objects remaining: `0`
- Business notifications: `0`
- Approved system-alert notifications: `186`, with `0` orphaned alert references
- `sys_cron_heartbeat`: `4` rows preserved; no cleanup mutation
- `sys_alerts`: preserved; IOT `IOT_DEVICE_ALERT/WARNING` remains for `IOT_ALERT_BUSINESS_REVIEW=PENDING`
- AR invoices/receipts/ledger: `0`; inventory batches/ledger: `0`; workflow approval/runtime facts: `0`
- Cash transactions: `0`; `current_balance=opening_balance` mismatch: `0`
- Audit/operation/file evidence remains retained (`sys_audit_log=141649`, `sys_operation_logs=339`, `file_metadata=56` at postcheck)
- Chanjet reimport guard: `PASS`; read-only sync and ERP inbound flags remain `false`; remote Chanjet cleanup is `DEFERRED_EXTERNAL_MAINTENANCE`

The production API and Web services are restored from their pinned images after the database postcheck. No application deploy or image pull was performed.

## Final status fields

```text
T01_PROCUREMENT=ABORTED_AND_CLEANED
T02_SALES=NOT_RUN
T03_WMS=NOT_RUN
T04_FINANCE=NOT_RUN
T05_WORKFLOW=NOT_RUN

CREATED_ROOT_OBJECTS=1 (historical; remaining=0)
CREATED_TOTAL_TRACKED_OBJECTS=2 (historical; remaining=0)
UNATTRIBUTED_NEW_BUSINESS_ROWS=0

INVENTORY_ASSERTION=PASS
FINANCE_ASSERTION=PASS
WORKFLOW_ASSERTION=PASS (zero runtime after cleanup)
DATASCOPE_ASSERTION=PASS (created PR references were in expected scope)

P0_DEFECTS=0
P1_DEFECTS=0 after cleanup; prior T01 rate-limit block retained as deferred observation
P2_DEFECTS=0

PROCUREMENT_SUBMIT_429_ORIGIN=UNKNOWN
RATE_LIMIT_STATUS=DEFERRED_UNRESOLVED_OBSERVATION
NO_ACTIVE_RATE_LIMIT_PRODUCT_FIX_TRACK=YES

CLEANUP_MANIFEST_READY=YES
CLEANUP_STATUS=COMPLETE
PRODUCTION_CLEANUP_COMMITTED=YES
ACTUAL_DELETE_ROWS=3
PR20=ABSENT
PR_ITEM21=ABSENT
UAT_RUN_OBJECTS_REMAINING=0

HUMAN_BUSINESS_UAT=PENDING
IOT_ALERT_BUSINESS_REVIEW=PENDING
NEXT_ACTION=HUMAN_PRODUCT_ACCEPTANCE
```

The frozen run archive is [artifacts/uat/UAT-20261006-R4-6b0e3f](../../artifacts/uat/UAT-20261006-R4-6b0e3f/): [uat-run-manifest.json](../../artifacts/uat/UAT-20261006-R4-6b0e3f/uat-run-manifest.json), [uat-cleanup-graph.json](../../artifacts/uat/UAT-20261006-R4-6b0e3f/uat-cleanup-graph.json), [uat-case-results.json](../../artifacts/uat/UAT-20261006-R4-6b0e3f/uat-case-results.json), [post-r3-zero-required-precounts.csv](../../artifacts/uat/UAT-20261006-R4-6b0e3f/post-r3-zero-required-precounts.csv), [post-r3-incremental-cleanup-manifest.csv](../../artifacts/uat/UAT-20261006-R4-6b0e3f/post-r3-incremental-cleanup-manifest.csv), [r4-4-postcheck.txt](../../artifacts/uat/UAT-20261006-R4-6b0e3f/r4-4-postcheck.txt), and [r4-4-steady-state-postcheck.txt](../../artifacts/uat/UAT-20261006-R4-6b0e3f/r4-4-steady-state-postcheck.txt). Audit, security, operation, rate-limit diagnosis, and UAT evidence are retained; no credentials, tokens, cookies, raw secrets, backup, or raw production rows are committed.

Archive interpretation: the manifest's `production_main_sha` and `cleanup_contract_main_sha` (`66d4fed...`) identify the execution-time contract baseline; `evidence_main_sha` and the production deployment/API revision are historical evidence, unchanged by the docs-only closeout merge. In all three JSON files, `stop_reason.next_action` retains the earlier resume suggestion; the manifest's final `t01_resume_allowed=false`, `transactional_uat_status=ABORTED_BY_USER`, `cleanup_status=COMPLETE`, and `next_action=HUMAN_PRODUCT_ACCEPTANCE` supersede it. `HUMAN_BUSINESS_UAT=PENDING`, `IOT_ALERT_BUSINESS_REVIEW=PENDING`, and deferred remote Chanjet maintenance remain open business follow-ups after archival.
