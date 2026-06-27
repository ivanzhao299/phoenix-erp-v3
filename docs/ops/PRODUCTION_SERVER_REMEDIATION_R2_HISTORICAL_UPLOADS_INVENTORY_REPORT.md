# Production Server Remediation R2 - Historical Uploads Inventory Report

Date: 2026-06-24

## Conclusion

READY_FOR_HISTORICAL_UPLOADS_METADATA_CLAIM_APPROVAL.

The approved read-only historical uploads inventory completed. It found 74 files under the remote `phoenix_uploads` Docker volume, all under `contracts/`, with no executable files, empty files, unexpected extensions, duplicate basenames, sensitive-name matches, or traversal-name risk detected by static checks.

No database write, `file_metadata` insert, file delete, file move, permission change, deployment, restart, push, migration, Nginx change, or env change was executed.

## Remote Audit Directory

`/opt/phoenix-erp-backups/remediation-r2-historical-uploads-inventory-20260624-085306`

Pulled local evidence:

- `docs/ops/runs/historical-uploads-inventory-20260624-085306/manifest.json`
- `docs/ops/runs/historical-uploads-inventory-20260624-085306/uploads_contracts_inventory_summary.txt`
- `docs/ops/runs/historical-uploads-inventory-20260624-085306/uploads_contracts_file_list_sample.txt`
- `docs/ops/runs/historical-uploads-inventory-20260624-085306/uploads_contracts_file_type_summary.txt`
- `docs/ops/runs/historical-uploads-inventory-20260624-085306/uploads_contracts_size_summary.txt`
- `docs/ops/runs/historical-uploads-inventory-20260624-085306/uploads_contracts_risk_summary.txt`
- `docs/ops/runs/historical-uploads-inventory-20260624-085306/historical_uploads_metadata_candidate_summary.txt`
- `docs/ops/runs/historical-uploads-inventory-20260624-085306/orphan_uploads_candidate_summary.txt`
- `docs/ops/runs/historical-uploads-inventory-20260624-085306/run-result.json`

## Inventory Summary

| Item | Result |
| --- | --- |
| Inventory completed | Yes |
| Inventory root | `/var/lib/docker/volumes/phoenix_uploads/_data` |
| File count | 74 |
| Total size | 66,718,630 bytes / 63.6 MB |
| Directory pattern | `contracts/*` |
| Metadata claim candidates | 74 |
| Orphan candidates | 0 by path-classification rule |
| Risk files | 0 |
| Duplicate basename count | 0 |
| Empty files | 0 |
| Executable files | 0 |
| Unexpected extensions | 0 |
| Sensitive filename matches | 0 |
| Path traversal filename risk | 0 |

## File Type Distribution

| Extension | Count |
| --- | ---: |
| `.pdf` | 38 |
| `.jpg` | 19 |
| `.png` | 17 |

## Size / Time Observations

Largest files:

| Size bytes | Relative path |
| ---: | --- |
| 10,483,137 | `contracts/1781511286748-ekj31p.pdf` |
| 10,483,137 | `contracts/1781511321159-t438s1.pdf` |
| 8,388,608 | `contracts/1781511282294-fohz4h.pdf` |
| 3,408,144 | `contracts/1782119058894-8tri0h.pdf` |
| 3,145,728 | `contracts/1781511335199-xyj2vk.pdf` |

Newest observed file:

- `contracts/1782198418698-h1rfui.pdf`

Oldest observed file:

- `contracts/1781511278688-nyw86u.pdf`

## Risk Summary

Static risk checks found no risk files by filename, extension, mode, empty-file, duplicate-basename, or sensitive-name rules.

This does not prove business ownership. It only means the filesystem inventory did not find obvious high-risk filenames or file modes.

## Metadata Claim Candidate Summary

| Candidate category | Count | Suggested module | Auto claim | Human confirmation |
| --- | ---: | --- | --- | --- |
| `CONTRACT_ATTACHMENT_CANDIDATE` | 74 | `LEGACY_CONTRACT` | No | Yes |

All 74 files are candidate historical contract attachments because they are under `contracts/`. None has a determinable `owner_id` from filesystem evidence alone.

## Candidate Categories

| Category | Identification basis | Auto claim | Human confirmation | Suggested `module_code` | Suggested `owner_type` | `owner_id` determinable | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `CONTRACT_ATTACHMENT_CANDIDATE` | Path under `contracts/` | No | Yes | `LEGACY_CONTRACT` or module-specific after reconciliation | `LEGACY_CONTRACT_ATTACHMENT` | No | Medium |
| `PAYMENT_PROOF_CANDIDATE` | payment / voucher keywords | No | Yes | `LEGACY_PAYMENT` | `LEGACY_PAYMENT_PROOF` | No | Medium |
| `STORE_PAYMENT_PROOF_CANDIDATE` | Store Payment keywords | No | Yes | `STORE_PAYMENT` | `STORE_PAYMENT_RECORD` | No | Medium |
| `STORE_PAYMENT_QR_CANDIDATE` | QR keywords | No | Yes | `STORE_PAYMENT` | `STORE_PAYMENT_ACCOUNT` | No | Medium |
| `EXPENSE_ATTACHMENT_CANDIDATE` | expense / reimbursement keywords | No | Yes | `LEGACY_EXPENSE` | `LEGACY_EXPENSE_ATTACHMENT` | No | Medium |
| `PURCHASE_ATTACHMENT_CANDIDATE` | purchase / procurement keywords | No | Yes | `LEGACY_PURCHASE` | `LEGACY_PURCHASE_ATTACHMENT` | No | Medium |
| `UNKNOWN_LEGACY_UPLOAD` | no deterministic signal | No | Yes | `LEGACY_UPLOAD` | `LEGACY_PENDING` | No | Medium |
| `ORPHAN_FILE` | no DB or module owner match | No | Yes | `LEGACY_UPLOAD` | `LEGACY_PENDING` | No | Medium |
| `RISK_FILE_REVIEW_REQUIRED` | unsafe extension/mode/name | No | Yes | `LEGACY_UPLOAD_REVIEW` | `RISK_REVIEW` | No | High |

## A1 Review

PASS WITH CONDITIONS.

- Manifest exists locally and remotely.
- Required summary files were generated and pulled.
- No DB write was executed.
- No `file_metadata` insert was executed.
- No file delete or move was executed.
- No deploy or restart was executed.
- W5 gate must still be run by Baseline Autopilot after commit.
- Condition: SSH was intermittently unstable; retries were required for pull operations.

## A2 Review

PASS WITH CONDITIONS.

- No sensitive secrets were printed.
- Static filename/mode checks found 0 high-risk files.
- `/uploads` public hardening was not changed.
- No file was automatically classified as safe for metadata write.
- All candidates require human confirmation before metadata claim.

## A5 Review

GO WITH CONDITIONS.

- Historical attachments appear concentrated under the legacy contracts directory.
- Store Payment does not appear to require historical upload migration from this inventory because no Store Payment-specific path/name signal was found.
- Procurement / contracts / payment workflows may be impacted by the later metadata claim plan.
- Owner records cannot be inferred from filesystem evidence alone; a dry-run claim Gate must correlate DB records before any write.

## Boundary Confirmation

| Item | Executed |
| --- | --- |
| DB write | No |
| `file_metadata` insert | No |
| Migration | No |
| File delete | No |
| File move | No |
| Permission change | No |
| Nginx change | No |
| Env change | No |
| Deploy | No |
| Restart | No |
| Push | No |

## Current Decision

READY_FOR_HISTORICAL_UPLOADS_METADATA_CLAIM_APPROVAL.

Recommended next single Gate:

`APPROVE_HISTORICAL_UPLOADS_METADATA_CLAIM_DRY_RUN_GATE`

Goal:

1. Correlate the 74 contract-path files against business tables and legacy URL fields.
2. Generate a proposed `file_metadata` write set.
3. Do not write DB.
4. Require user approval before any actual metadata claim write.

