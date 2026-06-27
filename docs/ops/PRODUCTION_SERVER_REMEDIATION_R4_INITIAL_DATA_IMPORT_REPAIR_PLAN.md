# Production Server Remediation R4 - Initial Data Import Repair Plan

Date: 2026-06-24

## Conclusion

Current conclusion: READY_FOR_DRY_RUN_APPROVAL.

This plan converts the prior read-only initial-data diagnosis into a bounded repair dry-run package. It does not authorize DB writes, migration, deploy, restart, push, seed, cleanup, or business-code changes.

## Source Evidence

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_INITIAL_DATA_IMPORT_DIAGNOSIS_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_METADATA_CLAIM_EXECUTION_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_NEXT_GATE_RECOMMENDATION.md`
- `docs/ops/PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md`

## Current Evidence Summary

| Area | Evidence |
| --- | --- |
| DB identity | `phoenix_erp`, user `phoenix_v3`, schema `public` from prior read-only audit |
| Import tables | `prc2_init_batches`, `prc2_init_batch_rows`, workflow definition tables exist |
| Store Payment tables | `store_payment_accounts` and `store_payment_records` exist |
| Store Payment rows | `store_payment_accounts=0`, `store_payment_records=0` in prior audit |
| file metadata | `file_metadata=15` active historical rows after approved metadata claim execution |
| Store Payment file metadata | `0` Store Payment rows in prior initial-data diagnosis |
| Menu / role / DataScope | Store Payment menu/role/DataScope repair execution completed with conditions |
| Historical uploads | 15 AUTO rows inserted; 59 unresolved files remain HOLD |

Fresh SSH read-only evidence was attempted during this batch but the first handshake closed on port 22. This report therefore does not pretend to have refreshed remote DB counts.

## Repair Scope Candidates

### Candidate 1: Store Payment Pilot Account Readiness

Goal: decide whether the production-remediation target needs placeholder Store Payment account rows for `STORE-VTE-001`.

Allowed dry-run work:

1. Read `store_payment_accounts`.
2. Read `fin_cash_accounts`.
3. Read `mst_stores` / `sys_organizations`.
4. Generate candidate SQL or a no-op decision.
5. Keep candidate rows disabled / pending unless a later execution Gate explicitly approves activation.

Forbidden:

1. Do not insert account rows in this plan Gate.
2. Do not write real bank account information.
3. Do not enable accounts automatically.
4. Do not create QR file metadata without owner evidence.

### Candidate 2: Store Payment Record Readiness

Goal: confirm whether `store_payment_records` must remain empty until business UAT creates records.

Recommended decision: no repair write by default.

Reason:

- Payment records are business events.
- Synthetic production-side records would create finance/audit ambiguity.
- If a UAT fixture is needed, it must be a separate staging/UAT data Gate, not a production-remediation repair.

### Candidate 3: Initial Import Batch Repair

Goal: inspect `prc2_init_batches` and `prc2_init_batch_rows` for failed, partial, or stale import rows.

Allowed dry-run work:

1. Read batch status counts.
2. Read recent failed row reasons.
3. Classify rows into `NO_ACTION`, `AUTO_RETRY_CANDIDATE`, `MANUAL_REVIEW_REQUIRED`, and `HOLD`.
4. Produce a repair manifest only for deterministic rows.

Forbidden:

1. Do not retry import rows.
2. Do not update statuses.
3. Do not delete batch rows.
4. Do not alter source files.

### Candidate 4: Store Payment File Metadata

Goal: determine whether Store Payment attachment metadata should be created now.

Recommended decision: HOLD for production-side repair unless there is deterministic file owner evidence.

Reason:

- Store Payment-specific `file_metadata` rows were absent in prior audit.
- QR/proof files must map to a specific Store Payment account or record.
- The 59 unresolved historical uploads cannot be auto-claimed.

## Proposed Dry-Run Output

The next Gate should produce:

1. `docs/ops/PRODUCTION_SERVER_REMEDIATION_R4_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN_REPORT.md`
2. `docs/ops/runs/remediation-r4-initial-data-import-repair-dry-run-<timestamp>/manifest.json`
3. `docs/ops/runs/remediation-r4-initial-data-import-repair-dry-run-<timestamp>/candidate_store_payment_accounts.sql`
4. `docs/ops/runs/remediation-r4-initial-data-import-repair-dry-run-<timestamp>/candidate_init_batch_repairs.json`
5. `docs/ops/runs/remediation-r4-initial-data-import-repair-dry-run-<timestamp>/manual_review_items.json`

## A5 Data Readiness Decision

Conclusion: GO WITH CONDITIONS.

The prior evidence is sufficient to prepare a dry-run manifest. Fresh remote evidence is still required before any write execution Gate.

## A2 Security Decision

Conclusion: PASS WITH CONDITIONS.

Conditions:

1. Do not create payment records as repair data.
2. Do not activate accounts without finance/user approval.
3. Do not attach files without deterministic owner evidence.
4. Keep manual/HOLD rows excluded.

## A1 Validation Decision

Conclusion: PASS WITH CONDITIONS.

The current batch ran static W5 gates locally and passed. The router produced one false HOLD when the request used English `DB write` inside a negative phrase; this should be tracked as a platform P2 fix but does not block this plan.

## Next Gate

`APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN`

This next Gate remains read-only and manifest-only. It must not execute repair SQL.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| DB write | No |
| Migration | No |
| Seed | No |
| Deploy | No |
| Restart | No |
| Push | No |
| Business-code change | No |
