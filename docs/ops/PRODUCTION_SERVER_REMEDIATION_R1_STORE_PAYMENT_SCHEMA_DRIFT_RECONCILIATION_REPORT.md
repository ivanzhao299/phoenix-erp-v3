# Production Server Remediation R1 Store Payment Schema Drift Reconciliation Report

Date: 2026-06-23

## Objective

Reconcile the previously observed Store Payment migration history/table inconsistency without executing migration, writing DB data, deploying, restarting services, pushing, or modifying server configuration.

## Remote Audit Directory

`/opt/phoenix-erp-backups/remediation-r1-schema-drift-reconciliation-20260623-232820`

Evidence files:

- `manifest.json`
- `db_identity.txt`
- `schema_search_path.txt`
- `migration_history_store_payment.txt`
- `information_schema_store_payment.txt`
- `pg_catalog_store_payment.txt`
- `migration_history_vs_tables_summary.txt`
- `store_payment_schema_drift_classification.txt`
- `remote_code_state.txt`

Local summary:

- `docs/ops/runs/r1-schema-drift-reconciliation/manifest.json`
- `docs/ops/runs/r1-schema-drift-reconciliation/summary.md`

## DB Identity

| Check | Result |
| --- | --- |
| current_database() | `phoenix_erp` |
| current_user | `phoenix_v3` |
| current_schema() | `public` |
| search_path | `"$user", public` |
| inet_server_addr / port | unavailable from container query, returned `null` |

Conclusion: wrong DB target is not indicated by this evidence. The audit ran against `phoenix_erp`.

## Schema And Search Path

| Check | Result |
| --- | --- |
| current schema | `public` |
| search_path | `"$user", public` |
| migration table | `public.migrations` |

Conclusion: wrong schema target is not indicated. The Store Payment tables, if present, should resolve in `public`.

## Migration History

| Migration area | Result |
| --- | --- |
| migrations table columns | `id`, `timestamp`, `name` |
| Store Payment migration history | one record found |
| Store Payment history row | `id=9`, `timestamp=1782041418112`, `name=CreateStorePaymentTables1782041418112` |
| duplicate Store Payment history | none reported |
| File Metadata migration history | zero records |

## information_schema Result

Exact target tables found:

- `public.store_payment_accounts`
- `public.store_payment_records`

Exact target table missing:

- `public.file_metadata`

Selected Store Payment columns were visible for both tables, including `account_code`, `store_code`, `company_code`, `qr_attachment_id`, `proof_attachment_id`, status, audit fields, and timestamps.

## pg_catalog Result

Exact target tables found:

- `public.store_payment_accounts`
- `public.store_payment_records`

`to_regclass` results:

| Object | Result |
| --- | --- |
| `store_payment_accounts` | `store_payment_accounts` |
| `public.store_payment_accounts` | `store_payment_accounts` |
| `store_payment_records` | `store_payment_records` |
| `public.store_payment_records` | `store_payment_records` |
| `file_metadata` | `null` |
| `public.file_metadata` | `null` |

## Store Payment Table Existence Conclusion

The original R1 finding that `store_payment_accounts` and `store_payment_records` were missing is not reproduced after remote code alignment.

Current evidence shows:

- `store_payment_accounts` exists in `public`.
- `store_payment_records` exists in `public`.
- Store Payment migration history exists once.
- No duplicate Store Payment migration history was reported.
- No partial Store Payment object residue was observed.

## Drift Classification

Classification: `UNKNOWN_HOLD` for the original Store Payment history/table drift, because the original table-missing condition is no longer reproduced by the reconciliation evidence.

Operational interpretation:

- Current Store Payment schema drift is reconciled enough to stop treating Store Payment tables as missing.
- The remaining schema gap is File Metadata: `file_metadata` is missing and File Metadata migration history is absent.

The following classifications are not supported by current evidence:

- `WRONG_DATABASE_TARGET`: not indicated.
- `WRONG_SCHEMA_TARGET`: not indicated.
- `MIGRATION_PARTIAL_OR_ROLLED_BACK`: not indicated for Store Payment.
- `MANUAL_HISTORY_INSERT_SUSPECTED`: no longer indicated for Store Payment because tables now exist.
- `TABLE_DROPPED_AFTER_MIGRATION`: no direct evidence.

## Risk Judgment

Risk remains medium because:

- Earlier R1 summary reported missing Store Payment tables, while the current reconciliation sees them.
- SSH sessions are intermittently unstable.
- `file_metadata` remains missing.

Risk is bounded because:

- The current DB identity is explicit.
- Store Payment tables are visible in both `information_schema` and `pg_catalog`.
- No DB write or migration was executed.

## Recommended Repair Path

Do not run Store Payment schema repair now.

Recommended next single Gate:

`FILE_METADATA_MIGRATION_EXECUTION_GATE`

Reason:

- File Metadata migration file is now present remotely after code alignment.
- File Metadata migration history is absent.
- `file_metadata` table is absent.
- Store Payment tables are currently present.

## Migration / Repair Policy

| Question | Recommendation |
| --- | --- |
| Allow next step to execute Store Payment migration? | no |
| Allow next step to repair Store Payment history? | no |
| Recommend Store Payment repair migration/script? | no, not for current evidence |
| Recommend File Metadata migration execution Gate? | yes |
| Allow File Metadata migration in this Gate? | no, requires separate approval |

If future evidence again shows Store Payment tables missing, prepare an idempotent schema repair script or dedicated repair migration only after a new Gate. Do not reset migration history blindly.

## A1 Review

Conclusion: PASS WITH CONDITIONS.

- Report is complete.
- Manifest exists.
- DB identity evidence exists.
- No migration, DB write, deploy, restart, or push was executed.
- W5 gate must pass after local report commit.

Condition:

- Earlier/current Store Payment table evidence conflict should be noted, but current reconciliation supports proceeding to File Metadata Gate.

## A2 Review

Conclusion: PASS WITH CONDITIONS.

- Evidence is redacted.
- No sensitive DB URL, password, token, or private key was printed.
- No blind migration rerun is recommended.
- Single-Gate approval remains required.

## A5 Review

Conclusion: GO WITH CONDITIONS for Store Payment table readiness; HOLD for File Metadata readiness.

- Store Payment tables are now visible.
- `file_metadata` is still missing.
- Store Payment protected attachment readiness remains blocked until File Metadata migration and validation complete.

## Safety Record

| Action | Result |
| --- | --- |
| DB write | no |
| migration | no |
| migration history repair | no |
| table creation | no |
| table deletion | no |
| cleanup / reset | no |
| deploy | no |
| service restart | no |
| push | no |
| env/nginx/compose modification | no |
| deleting `docker-compose.yml.bak-20260522-180813` | no |

## Current Conclusion

READY_FOR_SCHEMA_REPAIR_EXECUTION_APPROVAL.

Practical next approval should be `APPROVE_FILE_METADATA_MIGRATION_EXECUTION_GATE`, not Store Payment schema repair.

