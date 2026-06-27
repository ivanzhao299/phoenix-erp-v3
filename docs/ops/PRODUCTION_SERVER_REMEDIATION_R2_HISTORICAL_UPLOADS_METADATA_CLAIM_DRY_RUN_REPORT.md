# Production Server Remediation R2 - Historical Uploads Metadata Claim Dry-Run Report

Date: 2026-06-24

## Conclusion

HOLD.

The approved dry-run Gate could not safely execute remote DB owner correlation because SSH repeatedly failed during banner exchange / connection setup. No `file_metadata` rows were inserted, no DB write occurred, no files were moved or deleted, and no deployment/restart/push was executed.

## Remote Dry-Run Directory

Not created.

Reason: SSH connection failed before remote script transfer/execution.

Local HOLD evidence:

- `docs/ops/runs/historical-uploads-metadata-claim-dry-run-hold-20260624/manifest.json`
- `docs/ops/runs/historical-uploads-metadata-claim-dry-run-hold-20260624/metadata_claim_dry_run_rows.json`
- `docs/ops/runs/historical-uploads-metadata-claim-dry-run-hold-20260624/metadata_claim_risk_summary.txt`

## Input Inventory

| Item | Value |
| --- | --- |
| Source inventory directory | `/opt/phoenix-erp-backups/remediation-r2-historical-uploads-inventory-20260624-085306` |
| Input file count | 74 |
| Source category | `CONTRACT_ATTACHMENT_CANDIDATE` |
| Source total size | 63.6 MB |
| Source static risk count | 0 |

## Dry-Run Result

| Item | Result |
| --- | --- |
| dry-run rows total | 0 |
| `AUTO_CLAIM_READY` | 0 |
| `MANUAL_REVIEW_REQUIRED` | 0 |
| `UNRESOLVED_OR_HOLD` | 74 |
| owner correlation method | Not executed due SSH unavailability |
| contract / business table query summary | Not available |

## Intended Owner Correlation Method

The approved dry-run was designed to:

1. Read the prior inventory records.
2. Query text / varchar / JSON attachment-like columns in business tables.
3. Search for references to `contracts/<filename>` and `/uploads/contracts/<filename>`.
4. Generate proposed `file_metadata` rows only when owner evidence is deterministic.
5. Mark all ambiguous files as `MANUAL_REVIEW_REQUIRED`.
6. Never write DB in this Gate.

This method was not executed because the remote SSH connection was unavailable.

## Why Not Infer Ownership Locally

The previous filesystem inventory only proves that 74 files live under `contracts/`. It does not prove:

- exact module ownership.
- business record `owner_id`.
- company / store scope.
- active vs archived business status.
- whether a file is referenced by one or multiple records.

Therefore no file can be safely moved into `AUTO_CLAIM_READY` without remote DB correlation.

## A1 Review

HOLD.

- Manifest exists for the HOLD run.
- JSON format is valid locally.
- No DB write occurred.
- No file delete or move occurred.
- No deploy or restart occurred.
- W5 gate must be run by Baseline Autopilot after this report is committed.
- Blocker: remote SSH unavailable, so remote dry-run manifest could not be generated.

## A2 Review

PASS WITH CONDITIONS.

- No raw URL was generated.
- No `/uploads` public URL was generated.
- No `storage_path` was exposed in a user-facing report.
- Files with unclear owner were not auto-claimed.
- Condition: do not proceed to metadata claim execution until a successful dry-run owner correlation exists.

## A5 Review

HOLD.

- Historical inventory remains useful, but owner readiness is not proven.
- Store Payment remains unaffected.
- Contract attachment ownership cannot be validated until remote DB read-only correlation succeeds.

## Boundary Confirmation

| Item | Executed |
| --- | --- |
| DB write | No |
| `file_metadata` insert | No |
| Contract table update | No |
| File delete | No |
| File move | No |
| Permission change | No |
| Migration | No |
| Deploy | No |
| Restart | No |
| Push | No |
| Nginx change | No |
| Env change | No |
| Business code modification | No |

## Current Decision

HOLD.

Recommended next single Gate:

`RESTORE_SSH_OBSERVABILITY_AND_RETRY_HISTORICAL_UPLOADS_METADATA_CLAIM_DRY_RUN`

Scope:

1. Restore or verify SSH command-level observability.
2. Re-run the same metadata claim dry-run.
3. Keep DB read-only.
4. Do not insert `file_metadata`.
5. Do not move/delete files.

