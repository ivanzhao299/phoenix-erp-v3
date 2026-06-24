# Production Server Remediation R4 - Initial Data Import Repair Dry-Run Report

Date: 2026-06-24

## Conclusion

Current conclusion: GO WITH CONDITIONS.

The dry-run Gate produced a manifest, but fresh remote SQL evidence could not be refreshed because SSH failed during banner exchange / connection setup. No DB write, migration, seed, deploy, restart, push, cleanup, reset, or business-code change was executed.

## Evidence

Local evidence directory:

`docs/ops/runs/remediation-r4-initial-data-import-repair-dry-run-20260624-1514/`

Files:

- `readonly_diagnostics.txt`
- `manifest.json`
- `readonly_identity_tables.txt` (empty because SSH closed before DB output)

## Fresh Remote Evidence Status

| Probe | Result |
| --- | --- |
| SSH container inventory | PASS at 2026-06-24 15:12 CST |
| psql identity probe | PASS in earlier short command: `phoenix_erp|phoenix_v3` |
| long read-only SQL batch | FAIL: banner exchange timeout after ControlMaster pipe failure |
| short read-only SQL batch | FAIL: connection closed by remote port 22 |

Interpretation: the database is reachable intermittently, but the dry-run cannot safely claim fresh counts for all target tables.

## Dry-Run Candidate Summary

| Candidate | Decision | Reason |
| --- | --- | --- |
| Store Payment account candidates | NEEDS_FRESH_READONLY_CONFIRMATION | Prior R3 evidence showed `store_payment_accounts=0`, but fresh count must be rechecked before generating write SQL. |
| Store Payment records | NO_ACTION_RECOMMENDED | Production payment records are business events and should not be synthetic repair data. |
| Initial import batch rows | NEEDS_FRESH_READONLY_CONFIRMATION | Existing import tables are present, but failed-row detail needs fresh evidence. |
| Store Payment file metadata | HOLD_WITHOUT_OWNER_EVIDENCE | Do not create file_metadata rows without deterministic file owner evidence. |

## A5 Data Readiness

Conclusion: GO WITH CONDITIONS.

Prior evidence supports planning, but not execution. A5 requires fresh read-only evidence before any repair execution manifest can become executable.

## A2 Security Review

Conclusion: PASS WITH CONDITIONS.

Conditions:

1. Do not create production payment records.
2. Do not attach files without owner evidence.
3. Do not auto-execute manual/HOLD rows.
4. Do not use synthetic account data unless disabled/pending and explicitly approved.

## A1 Validation

Conclusion: PASS WITH CONDITIONS.

Local W5 static gates passed before and after plan generation. Fresh remote SSH instability remains a condition.

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

## Next Recommendation

Next single Gate:

`APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN_REFRESH_OR_EXECUTION_PLAN`

This should first stabilize or retry read-only SSH/DB evidence with concurrency `1`. If fresh counts match prior R3 evidence, generate candidate SQL only for deterministic account placeholders or import-row status fixes. Do not execute SQL until a later explicit execution Gate.
