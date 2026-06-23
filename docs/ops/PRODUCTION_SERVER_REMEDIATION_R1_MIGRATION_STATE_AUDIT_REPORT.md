# Production Server Remediation R1 Migration State Audit Report

Date: 2026-06-23

## Objective

Audit the production-side remediation target migration state without executing migration, writing database data, restarting services, deploying, or pushing code.

## Scope

Approved scope:

- Use SSH for read-only server-side audit.
- Write audit evidence under `/opt/phoenix-erp-backups/remediation-r1-migration-audit-20260623-220510`.
- Read remote git state, migration files, migration history, schema metadata, and Store Payment readiness facts.
- Compare remote state with local approved Store Payment / file metadata migration files.
- Generate remediation reports and Runtime Memory updates.

Explicitly not executed:

- migration execution
- DB structure changes
- business DB writes
- seed / cleanup / reset
- service restart
- deploy
- push
- server env, nginx, or compose changes

## Remote Evidence Bundle

| Item | Evidence |
| --- | --- |
| audit directory | `/opt/phoenix-erp-backups/remediation-r1-migration-audit-20260623-220510` |
| manifest | `manifest.json` |
| git evidence | `remote_git_state.txt` |
| migration files evidence | `remote_migration_files.txt` |
| migration history evidence | `remote_migration_history.txt` |
| schema evidence | `remote_schema_state.txt` |
| Store Payment readiness evidence | `remote_store_payment_readiness.txt` |
| summary | `migration_schema_drift_summary.txt` |
| checksum file | `checksums.sha256` |

Long SSH output remains unstable, so large evidence files were kept server-side. A small manifest copy is stored in `docs/ops/runs/r1-migration-audit-remote/manifest.json`.

## Remote Code Version

| Field | Value |
| --- | --- |
| remote branch | `main` |
| remote commit | `87b5781` |
| working tree | clean from `remote_git_state.txt` summary |

Remote recent commit evidence showed `87b5781 (HEAD -> main, origin/main, origin/HEAD) docs(ops): record generated ops run artifacts`.

## Local Approved Migration Files

| Migration | Local state | SHA-256 |
| --- | --- | --- |
| `1782041418112-CreateStorePaymentTables.ts` | present | `703c39d6f819e1d8f2db807092f6ee58f02d75e1cf4258cc46fda572b4a5076d` |
| `1782042418112-CreateFileMetadata.ts` | present | `9ba67741f1a43528a399aa4ec42031d4dc2a6b33bc761aa2fb1607599364e70b` |

## Remote Migration File State

| Migration | Remote state | Remote SHA-256 evidence |
| --- | --- | --- |
| `1782041418112-CreateStorePaymentTables.ts` | present | `703c39d6f819e1d8f2db807092f6ee58f02d75e1cf4258cc46fda572b4a5076d` |
| `1782042418112-CreateFileMetadata.ts` | missing | not available |

Finding: the Store Payment table migration file is deployed on the remote server and matches the local approved hash. The File Metadata migration file is absent from remote code.

## Remote Migration History

| Check | Result |
| --- | --- |
| Store Payment migration history matches | `2` text matches in audit output |
| File Metadata migration history matches | `0` |

The R1 summary shows no File Metadata migration history match. Store Payment history requires follow-up review because the Store Payment migration file exists remotely while target tables were not found in the audited database.

## Remote DB Schema State

| Table | Presence |
| --- | --- |
| `store_payment_accounts` | missing |
| `store_payment_records` | missing |
| `file_metadata` | missing |

Finding: the audited DB target does not currently contain the Store Payment tables or the File Metadata table.

## Store Payment Readiness State

| Area | Result |
| --- | --- |
| Store Payment schema | not ready |
| File Metadata schema | not ready |
| protected attachment readiness | not ready on remote target |
| Store Payment business trial readiness | HOLD |

## `file_metadata` Missing Cause Classification

Classification: `CODE_NOT_DEPLOYED`.

Reasoning:

1. Local approved code contains `1782042418112-CreateFileMetadata.ts`.
2. Remote code at `main@87b5781` does not contain that migration file.
3. Remote migration history has no File Metadata match.
4. Remote DB lacks `file_metadata`.

Secondary drift also exists:

- `migration_drift=yes`
- `schema_drift=yes`
- `history_drift=yes`
- `data_readiness_drift=yes`

## A1 Validation

Conclusion: PASS WITH CONDITIONS.

Evidence:

- R1 audit gathered remote git, migration file, migration history, schema, and readiness evidence without executing migration.
- Remote Store Payment and File Metadata schema are not ready.
- W5 gate must remain required after any future repair.

Conditions:

- Store Payment history/table mismatch requires follow-up before any business trial.
- File Metadata cannot be repaired until user approves a dedicated repair execution Gate.

## A2 Security Review

Conclusion: PASS WITH CONDITIONS.

Evidence:

- No remote DB write, migration, deploy, restart, or push was executed.
- No sensitive DB URL, password, token, or private key was copied into this report.
- Missing `file_metadata` means protected attachment streaming must remain disabled on the remote target.

Conditions:

- Future repair must not expose `/uploads`, raw URL, or storage path.
- Future migration execution must be scoped and logged.

## A5 Data Readiness

Conclusion: HOLD.

Evidence:

- Audited DB lacks required Store Payment and File Metadata tables.
- Store Payment remote business readiness cannot proceed until schema and migration state are repaired.

## Safety Record

| Action | Result |
| --- | --- |
| migration executed | no |
| DB structure changed | no |
| business DB write | no |
| seed / cleanup / reset | no |
| service restart | no |
| deploy | no |
| push | no |
| business code changed | no |

## Current Decision

HOLD.

The R1 audit completed and classified the File Metadata missing cause as `CODE_NOT_DEPLOYED`, but the remote DB also lacks Store Payment tables. Do not enter Store Payment remote trial, menu/role sync, protected attachment enablement, staging/production deployment, or migration execution until a dedicated repair execution Gate is approved.

