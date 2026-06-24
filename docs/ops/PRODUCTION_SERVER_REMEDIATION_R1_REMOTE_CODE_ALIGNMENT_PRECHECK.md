# Production Server Remediation R1 Remote Code Alignment Precheck

Date: 2026-06-23

## Objective

Confirm how the production-side remediation target should align code before any schema repair. This precheck does not execute code alignment, git pull, checkout, reset, migration, DB write, deploy, restart, or push.

## Evidence Sources

| Source | Result |
| --- | --- |
| R1 audit bundle | `/opt/phoenix-erp-backups/remediation-r1-migration-audit-20260623-220510` |
| local precheck manifest | `docs/ops/runs/r1-schema-repair-precheck/manifest.json` |
| fresh SSH probe | failed with banner timeout; port 22 was reachable |

## Remote Deploy Path

Remote deploy path: `/opt/phoenix-erp`.

This path was read in R1 audit evidence. No server application file was modified in this precheck.

## Remote Current State

| Field | Value |
| --- | --- |
| branch | `main` |
| commit | `87b5781` |
| working tree | clean based on R1 audit evidence |
| Store Payment migration file | present |
| File Metadata migration file | missing |

## Local Verified State

Current local verified branch head after R1 baseline:

- `7315bfb6 docs(ops): record baseline lifecycle report`
- R1 audit commit: `9f87a633 docs(ops): audit production migration state`

Important locally available files:

| File | Local state | SHA-256 |
| --- | --- | --- |
| `apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts` | present | `703c39d6f819e1d8f2db807092f6ee58f02d75e1cf4258cc46fda572b4a5076d` |
| `apps/api/src/database/migrations/1782042418112-CreateFileMetadata.ts` | present | `9ba67741f1a43528a399aa4ec42031d4dc2a6b33bc761aa2fb1607599364e70b` |

## Key Local Verified Commit Areas

The remote target is older than the current local verified remediation branch. The current local line contains:

1. Store Payment schema and backend gates.
2. Store Payment migration file.
3. File Metadata migration file.
4. Protected attachment backend and frontend UAT work.
5. A4 Store Payment UI.
6. Runtime Memory.
7. R0 backup baseline reports.
8. R1 migration-state audit and repair plan.

## Missing Remote Files / Commits

Confirmed missing remote file:

- `apps/api/src/database/migrations/1782042418112-CreateFileMetadata.ts`

Implication:

- `file_metadata` missing is caused by `CODE_NOT_DEPLOYED`.
- Running a File Metadata migration is impossible until the remote code target contains the migration file or a separately approved migration artifact is made available.

## Code Alignment Recommendation

Recommended next Gate: `REMOTE_CODE_ALIGNMENT_EXECUTION_GATE`.

The next Gate should:

1. Confirm target commit.
2. Confirm whether remote `main@87b5781` should align to current verified `main/w5-codex-orchestrator@7315bfb6` or another approved commit.
3. Confirm rollback commit `87b5781`.
4. Confirm R0 backup directory remains available.
5. Confirm no migration, deploy, restart, or push is bundled into code alignment unless separately approved.

This precheck does not perform code alignment.

## Required Before Code Alignment Execution

| Requirement | Current state |
| --- | --- |
| current remote directory snapshot | R0 backup baseline exists |
| DB backup | R0 DB backup exists |
| env backup | R0 backup includes env backup where present |
| deploy file backup | R0 backup includes deploy / compose backup where present |
| rollback commit record | `87b5781` |
| user approval | required |

## A1 / A2 / A5

| Agent | Conclusion |
| --- | --- |
| A1 | PASS WITH CONDITIONS |
| A2 | PASS WITH CONDITIONS |
| A5 | HOLD until code alignment and schema readiness are repaired |

## Safety Record

| Action | Result |
| --- | --- |
| git pull / checkout / reset on remote | no |
| migration | no |
| DB write | no |
| deploy | no |
| service restart | no |
| push main | no |

## Conclusion

READY_FOR_REMOTE_CODE_ALIGNMENT_APPROVAL.

