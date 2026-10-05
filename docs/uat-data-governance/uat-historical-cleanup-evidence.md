# UAT Historical Cleanup Evidence — U1

## Evidence reviewed

| Evidence | Finding | Weight |
|---|---|---|
| `scripts/seed-uat-fixture.sh` | Historical fixture used `UAT-*` master and transaction prefixes; its `--clean` path is broad and fail-open, so it is reference-only | Historical design |
| `docs/uat2-real-operation-acceptance-test.md` | UAT2 explicitly recorded AR, receipt, procurement, sales, inventory and breeding identifiers as retained evidence; it references a cleanup script that is absent from the current checkout | Strong historical evidence |
| `apps/api/migrations/20260612_g85e_cleanup_uat_test_data.sql` | A separate, precise G85-E cleanup script exists for 2026-06-12 PO/AP/payment records; the repository contains no execution report | Script existence only |
| `apps/api/migrations/20260609_g64_archive_uat_test_grade.sql` | One named UAT test grade was archived by a targeted update; this is not evidence that UAT transactions were removed | Targeted historical change |
| `docs/ops/DELIVERY_OUTBOUND_PACKAGING_PRODUCTION_UAT_20260726.md` | Later production UAT explicitly says no destructive cleanup was run and records a controlled outbound with inventory effects | Strong historical evidence |

## Current production cross-check

Short read-only probes for `UAT2-AR-001`, `UAT2-RCT-001`, `UAT2-PR-001`, `UAT2-SO-001`, `UAT2-BATCH-001`, `UAT2-IN-001` and `UAT2-LOG-001` returned zero rows in their documented tables. Current report tables also contain zero rows: `uat_pilot_runs`, `pilot_daily_reports`, `uat_feedbacks`, `uat_checklists`, `uat_training_records`, and `mst_audit_trail`.

This proves the documented UAT2 facts are absent from the current database. It does not prove whether they were deleted, the database was rebuilt/restored, or UAT2 ran against another database. A later controlled UAT outbound remains, so the overall finding is:

```text
WERE_UAT_TRANSACTIONS_ALREADY_REMOVED=PARTIAL / CAUSALITY_UNKNOWN
UAT_REPORTS_EXIST=YES (repository evidence)
UAT_TRANSACTION_FACTS_EXIST=PARTIAL (one later controlled outbound remains)
```

The U0 rules were also incomplete for historical `UAT2-*` identifiers. This is a coverage finding, not permission to broaden deletion rules.
